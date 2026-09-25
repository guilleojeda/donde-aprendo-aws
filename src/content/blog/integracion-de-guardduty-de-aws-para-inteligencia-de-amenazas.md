---
title: "Integración de GuardDuty de AWS para Inteligencia de Amenazas"
description: "Descubre cómo integrar AWS GuardDuty con inteligencia de amenazas para mejorar la seguridad en tu entorno AWS. Aprende a configurar y gestionar amenazas eficazmente."
publishedAt: "2024-04-30"
publishedTimestamp: "2024-04-30T06:43:18.648Z"
cover: "/assets/blog/ce55ff284d28beb4aeeeab54.jpg"
coverAlt: "Thumbnail for: Integración de GuardDuty de AWS para Inteligencia de Amenazas"
ogImage: "/assets/blog/ce55ff284d28beb4aeeeab54.jpg"
related:
  - title: "5 Whitepapers de AWS para Aprobar Exámenes"
    url: "https://dondeaprendoaws.com/blog/5-whitepapers-de-aws-para-aprobar-examenes/"
    image: "/assets/blog/251a69179cad106c40e9334f.webp"
    imageAlt: ""
  - title: "Transacciones en Amazon DynamoDB"
    url: "https://dondeaprendoaws.com/blog/transacciones-en-amazon-dynamodb/"
    image: "/assets/blog/92c10f1c21ba45a500fbff08.jpg"
    imageAlt: ""
  - title: "AWS Lambda en Profundidad"
    url: "https://dondeaprendoaws.com/blog/aws-lambda-en-profundidad/"
    image: "/assets/blog/fc7f86cd5d9d53b7ba70da04.jpg"
    imageAlt: ""
---

<p><a href="https://aws.amazon.com/guardduty/" rel="noopener noreferrer" target="_blank">AWS GuardDuty</a> es un servicio de detección de amenazas que utiliza inteligencia de amenazas para identificar y priorizar posibles amenazas en tu entorno de <a href="https://aws.amazon.com/" rel="noopener noreferrer" target="_blank">AWS</a>. Integrar feeds de inteligencia de amenazas en GuardDuty mejora las capacidades de detección de amenazas y reduce falsos positivos.</p>


<p><strong>Beneficios de la inteligencia de amenazas:</strong></p>


<ul>
<li>Entender mejor las amenazas</li>
<li>Tomar medidas para mitigarlas</li>
<li>Mejorar la detección de amenazas</li>
<li>Reducir falsos positivos</li>
</ul>


<p><strong>Pasos para integrar inteligencia de amenazas en GuardDuty:</strong></p>


<ol>
<li>
<p><strong>Habilitar y configurar GuardDuty</strong></p>
<ul>
<li>Habilitar GuardDuty en todas las regiones de AWS</li>
<li>Crear un rol de IAM o usuario para administrar GuardDuty</li>
<li>Habilitar los tipos de protección adecuados (malware, análisis de registros, detección de anomalías)</li>
</ul>
</li>
<li>
<p><strong>Agregar fuentes de inteligencia de amenazas</strong></p>
<ul>
<li>Agregar direcciones IP maliciosas a la lista de amenazas de GuardDuty</li>
<li>Integrar con servicios de inteligencia de amenazas (<a href="https://www.crowdstrike.com/en-us/" rel="noopener noreferrer" target="_blank">CrowdStrike</a>, <a href="https://www.proofpoint.com/us" rel="noopener noreferrer" target="_blank">Proofpoint</a>, etc.)</li>
</ul>
</li>
<li>
<p><strong>Administrar IPs confiables y listas de amenazas</strong></p>
<ul>
<li>Crear una lista de IPs confiables</li>
<li>Crear una lista de amenazas</li>
<li>Actualizar regularmente las listas</li>
</ul>
</li>
<li>
<p><strong>Automatizar actualizaciones de inteligencia de amenazas</strong></p>
<ul>
<li>Crear una función <a href="https://aws.amazon.com/lambda/" rel="noopener noreferrer" target="_blank">Lambda</a> para descargar listas actualizadas</li>
<li>Configurar la función Lambda para ejecutarse periódicamente o manualmente</li>
</ul>
</li>
<li>
<p><strong>Verificar la integración y probar</strong></p>
<ul>
<li>Generar hallazgos de muestra utilizando la función de simulación de ataques</li>
<li>Examinar los hallazgos y verificar la configuración de GuardDuty</li>
</ul>
</li>
</ol>


<p>Al integrar GuardDuty con inteligencia de amenazas, puedes mejorar la seguridad de tu entorno de AWS y mantenerte protegido contra las últimas amenazas y vulnerabilidades.</p>


<h2 id="requisitos-para-configurar-guardduty" tabindex="-1">Requisitos para configurar GuardDuty</h2>


<p>Para configurar AWS GuardDuty, es importante cumplir con los siguientes requisitos:</p>


<h3 id="habilitar-guardduty-en-todas-las-regiones-compatibles" tabindex="-1">Habilitar GuardDuty en todas las regiones compatibles</h3>


<figure class="table"><table>
<thead>
<tr>
<th>Región</th>
<th>Acción</th>
</tr>
</thead>
<tbody>
<tr>
<td>Todas las regiones de AWS</td>
<td>Habilitar GuardDuty</td>
</tr>
</tbody>
</table></figure>


<p>Debes habilitar GuardDuty en cada región de AWS que desees monitorear. Esto te permitirá detectar actividad no autorizada o anómala en todas las regiones, incluyendo aquellas que no se utilizan activamente.</p>


<h3 id="crear-un-rol-de-iam-o-usuario-para-administrar-guardduty" tabindex="-1">Crear un rol de IAM o usuario para administrar GuardDuty</h3>


<figure class="table"><table>
<thead>
<tr>
<th>Requisito</th>
<th>Descripción</th>
</tr>
</thead>
<tbody>
<tr>
<td>Rol de IAM o usuario</td>
<td>Crear un rol de IAM o usuario específico para administrar GuardDuty, siguiendo el principio de privilegios mínimos.</td>
</tr>
</tbody>
</table></figure>


<h3 id="entender-los-or%C3%ADgenes-de-datos-de-guardduty" tabindex="-1">Entender los orígenes de datos de GuardDuty</h3>


<figure class="table"><table>
<thead>
<tr>
<th>Orígenes de datos</th>
<th>Descripción</th>
</tr>
</thead>
<tbody>
<tr>
<td>Registros de AWS <a href="https://aws.amazon.com/cloudtrail/" rel="noopener noreferrer" target="_blank">CloudTrail</a></td>
<td>Registros de actividad de AWS</td>
</tr>
<tr>
<td>Registros de flujo de <a href="https://aws.amazon.com/vpc/" rel="noopener noreferrer" target="_blank">Amazon VPC</a></td>
<td>Registros de tráfico de red</td>
</tr>
<tr>
<td>Registros de consultas de <a href="https://en.wikipedia.org/wiki/Domain_Name_System" rel="noopener noreferrer" target="_blank">DNS</a></td>
<td>Registros de consultas de nombres de dominio</td>
</tr>
</tbody>
</table></figure>


<p>Es importante entender cómo GuardDuty utiliza estos orígenes de datos para generar findings de seguridad.</p>


<h3 id="habilitar-los-tipos-de-protecci%C3%B3n-adecuados" tabindex="-1">Habilitar los tipos de protección adecuados</h3>


<figure class="table"><table>
<thead>
<tr>
<th>Tipo de protección</th>
<th>Descripción</th>
</tr>
</thead>
<tbody>
<tr>
<td>Protección contra malware</td>
<td>Detección de malware y virus</td>
</tr>
<tr>
<td>Análisis de registros</td>
<td>Análisis de registros de actividad</td>
</tr>
<tr>
<td>Detección de anomalías</td>
<td>Detección de actividad anómala</td>
</tr>
</tbody>
</table></figure>


<p>Debes habilitar los tipos de protección adecuados para tu entorno y necesidades de seguridad.</p>


<p>Al cumplir con estos requisitos, podrás configurar GuardDuty para detectar y responder a amenazas de seguridad en tu entorno de AWS.</p>


<h2 id="1.-habilitar-y-configurar-aws-guardduty" tabindex="-1">1. Habilitar y Configurar <a href="https://aws.amazon.com/guardduty/" rel="noopener noreferrer" target="_blank">AWS GuardDuty</a></h2>


<p><figure><img alt="AWS GuardDuty" src="/assets/blog/13fd3ebe3a52c8ac783327b0.jpg"/></figure></p>


<p>Para habilitar y configurar AWS GuardDuty, sigue los siguientes pasos:</p>


<p><strong>Habilitar GuardDuty</strong></p>


<ol>
<li>Inicia sesión en la consola de AWS Management Console.</li>
<li>Haz clic en "Servicios" y selecciona "GuardDuty" en la lista de servicios.</li>
<li>Haz clic en "Comenzar" y luego en "Habilitar GuardDuty".</li>
<li>Selecciona la región en la que deseas habilitar GuardDuty.</li>
</ol>


<p><strong>Configurar GuardDuty</strong></p>


<figure class="table"><table>
<thead>
<tr>
<th>Paso</th>
<th>Acción</th>
</tr>
</thead>
<tbody>
<tr>
<td>1</td>
<td>Selecciona los tipos de protección que deseas habilitar, como la protección contra malware, el análisis de registros y la detección de anomalías.</td>
</tr>
<tr>
<td>2</td>
<td>Configura los ajustes de GuardDuty según sea necesario, como la frecuencia de análisis y los umbrales de detección.</td>
</tr>
</tbody>
</table></figure>


<p><strong>Revisar la configuración inicial</strong></p>


<figure class="table"><table>
<thead>
<tr>
<th>Paso</th>
<th>Acción</th>
</tr>
</thead>
<tbody>
<tr>
<td>1</td>
<td>Verifica que los tipos de protección seleccionados estén habilitados y configurados correctamente.</td>
</tr>
<tr>
<td>2</td>
<td>Asegúrate de que la frecuencia de análisis y los umbrales de detección estén configurados según sea necesario.</td>
</tr>
</tbody>
</table></figure>


<p>Al seguir estos pasos, podrás habilitar y configurar GuardDuty para detectar y responder a amenazas de seguridad en tu entorno de AWS.</p>


<h2 id="2.-agregar-fuentes-de-inteligencia-de-amenazas-a-guardduty" tabindex="-1">2. Agregar Fuentes de Inteligencia de Amenazas a GuardDuty</h2>


<p>Para mejorar las capacidades de detección de GuardDuty, es posible integrar fuentes de inteligencia de amenazas externas, como CrowdStrike y Proofpoint. Estas fuentes proporcionan información valiosa sobre direcciones IP maliciosas y otros indicadores de compromiso que pueden ayudar a GuardDuty a detectar y responder a amenazas de seguridad.</p>


<h3 id="agregando-ips-maliciosas-a-la-lista-de-amenazas-de-guardduty" tabindex="-1">Agregando IPs Maliciosas a la Lista de Amenazas de GuardDuty</h3>


<p>Puede agregar direcciones IP maliciosas a la lista de amenazas de GuardDuty para que el servicio alerte ante accesos desde esas IPs. También puede agregar indicadores de compromiso de servicios de inteligencia de amenazas contratados.</p>


<h3 id="integraci%C3%B3n-con-fuentes-de-inteligencia-de-amenazas" tabindex="-1">Integración con Fuentes de Inteligencia de Amenazas</h3>


<p>Para integrar fuentes de inteligencia de amenazas con GuardDuty, debe seguir los siguientes pasos:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Paso</th>
<th>Acción</th>
</tr>
</thead>
<tbody>
<tr>
<td>1</td>
<td>Crear un detector de GuardDuty</td>
</tr>
<tr>
<td>2</td>
<td>Configurar un bucket de S3 para almacenar la lista de inteligencia de amenazas</td>
</tr>
<tr>
<td>3</td>
<td>Crear un recurso de ThreatIntelSet de GuardDuty para vincular el bucket de S3 y habilitar la actualización automática de la lista de inteligencia de amenazas</td>
</tr>
</tbody>
</table></figure>


<p>Al agregar fuentes de inteligencia de amenazas a GuardDuty, puede mejorar la detección de amenazas y reducir el riesgo de ataques de seguridad en su entorno de AWS.</p>


<h2 id="3.-administrar-ips-confiables-y-listas-de-amenazas" tabindex="-1">3. Administrar IPs Confiables y Listas de Amenazas</h2>


<p>Para mejorar la eficacia de GuardDuty en la detección de amenazas, es importante administrar adecuadamente las listas de IPs confiables y listas de amenazas. Estas listas permiten a GuardDuty distinguir entre tráfico seguro y tráfico malicioso.</p>


<h3 id="crear-una-lista-de-ips-confiables" tabindex="-1">Crear una lista de IPs confiables</h3>


<p>Una lista de IPs confiables es una colección de direcciones IP que se consideran seguras y no generan alertas de seguridad. Para crear una lista de IPs confiables en GuardDuty, siga los siguientes pasos:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Paso</th>
<th>Acción</th>
</tr>
</thead>
<tbody>
<tr>
<td>1</td>
<td>Crear un archivo de texto que contenga las direcciones IP que desea agregar a la lista de IPs confiables.</td>
</tr>
<tr>
<td>2</td>
<td>Subir el archivo a un bucket de S3.</td>
</tr>
<tr>
<td>3</td>
<td>Crear un recurso de IPSet de GuardDuty y vincularlo al bucket de S3 que contiene la lista de IPs confiables.</td>
</tr>
<tr>
<td>4</td>
<td>Activar la lista de IPs confiables para que GuardDuty la utilice para filtrar tráfico seguro.</td>
</tr>
</tbody>
</table></figure>


<h3 id="crear-una-lista-de-amenazas" tabindex="-1">Crear una lista de amenazas</h3>


<p>Una lista de amenazas es una colección de direcciones IP y otros indicadores de compromiso que se consideran maliciosos y generan alertas de seguridad. Para crear una lista de amenazas en GuardDuty, siga los siguientes pasos:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Paso</th>
<th>Acción</th>
</tr>
</thead>
<tbody>
<tr>
<td>1</td>
<td>Crear un archivo de texto que contenga las direcciones IP y otros indicadores de compromiso que desea agregar a la lista de amenazas.</td>
</tr>
<tr>
<td>2</td>
<td>Subir el archivo a un bucket de S3.</td>
</tr>
<tr>
<td>3</td>
<td>Crear un recurso de ThreatIntelSet de GuardDuty y vincularlo al bucket de S3 que contiene la lista de amenazas.</td>
</tr>
<tr>
<td>4</td>
<td>Activar la lista de amenazas para que GuardDuty la utilice para detectar tráfico malicioso.</td>
</tr>
</tbody>
</table></figure>


<h3 id="actualizar-listas-de-ips-confiables-y-listas-de-amenazas" tabindex="-1">Actualizar listas de IPs confiables y listas de amenazas</h3>


<p>Es importante actualizar regularmente las listas de IPs confiables y listas de amenazas para asegurarse de que GuardDuty tenga la información más actualizada sobre tráfico seguro y malicioso. Puede actualizar estas listas manualmente o configurar GuardDuty para que actualice automáticamente las listas desde fuentes de inteligencia de amenazas externas.</p>


<p>Al administrar adecuadamente las listas de IPs confiables y listas de amenazas, puede mejorar la eficacia de GuardDuty en la detección de amenazas y reducir el riesgo de ataques de seguridad en su entorno de AWS.</p>


<h2 id="4.-automatizar-actualizaciones-de-inteligencia-de-amenazas" tabindex="-1">4. Automatizar Actualizaciones de Inteligencia de Amenazas</h2>


<p>Para mantener sus listas de IPs confiables y listas de amenazas actualizadas, es importante automatizar el proceso de actualización de inteligencia de amenazas. Esto puede lograrse utilizando servicios de AWS como <a href="https://aws.amazon.com/cloudformation/" rel="noopener noreferrer" target="_blank">CloudFormation</a> y Lambda.</p>


<h3 id="crear-una-funci%C3%B3n-lambda" tabindex="-1">Crear una función <a href="https://aws.amazon.com/lambda/" rel="noopener noreferrer" target="_blank">Lambda</a></h3>


<p><figure><img alt="Lambda" src="/assets/blog/c0eb5d69184d1120b29c2a25.jpg"/></figure></p>


<p>Puede crear una función Lambda que descargue las últimas listas de IPs confiables y listas de amenazas de fuentes de inteligencia de amenazas externas. Luego, puede configurar la función Lambda para que se ejecute periódicamente, asegurándose de que sus listas estén siempre actualizadas.</p>


<h3 id="configurar-la-funci%C3%B3n-lambda" tabindex="-1">Configurar la función Lambda</h3>


<p>Puede configurar la función Lambda para que se ejecute:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Opción</th>
<th>Acción</th>
</tr>
</thead>
<tbody>
<tr>
<td>Periódicamente</td>
<td>Utilice un trigger de CloudWatch Events para ejecutar la función Lambda en un intervalo de tiempo específico.</td>
</tr>
<tr>
<td>Manualmente</td>
<td>Ejecute la función Lambda manualmente en caso de eventos de seguridad urgentes, como el descubrimiento de una nueva vulnerabilidad de día cero.</td>
</tr>
</tbody>
</table></figure>


<p>Al automatizar la actualización de inteligencia de amenazas, puede minimizar los esfuerzos manuales y asegurarse de que su entorno de AWS esté siempre protegido contra las últimas amenazas.</p>


<h2 id="5.-verificar-la-integraci%C3%B3n-y-probar" tabindex="-1">5. Verificar la Integración y Probar</h2>


<p>Para asegurarse de que la integración de los feeds de inteligencia de amenazas con GuardDuty sea exitosa, es importante generar y examinar hallazgos de muestra. Esto le permitirá verificar que la configuración de GuardDuty esté funcionando correctamente y detectando las amenazas de manera efectiva.</p>


<h3 id="generar-hallazgos-de-muestra" tabindex="-1">Generar Hallazgos de Muestra</h3>


<p>Puede generar hallazgos de muestra utilizando la función de simulación de ataques de GuardDuty. Esta función le permite simular ataques contra su entorno de AWS, lo que activará las reglas de detección de GuardDuty y generará hallazgos.</p>


<p>Una vez que haya generado los hallazgos de muestra, puede examinarlos en la consola de GuardDuty para asegurarse de que se estén detectando las amenazas correctamente. Asegúrese de revisar los detalles de cada hallazgo, como la fuente de la amenaza, el tipo de ataque y la gravedad del riesgo.</p>


<h3 id="examinar-los-hallazgos" tabindex="-1">Examinar los Hallazgos</h3>


<p>Al examinar los hallazgos, asegúrese de verificar que los feeds de inteligencia de amenazas estén funcionando correctamente y proporcionando información precisa sobre las amenazas. También es importante revisar la configuración de GuardDuty para asegurarse de que esté ajustada correctamente para detectar las amenazas relevantes para su entorno de AWS.</p>


<p>Si encuentra algún problema con la integración o la configuración de GuardDuty, puede utilizar las herramientas de depuración de AWS para identificar y solucionar el problema.</p>


<p><strong>Tabla de Verificación</strong></p>


<figure class="table"><table>
<thead>
<tr>
<th>Paso</th>
<th>Acción</th>
</tr>
</thead>
<tbody>
<tr>
<td>1</td>
<td>Generar hallazgos de muestra utilizando la función de simulación de ataques de GuardDuty</td>
</tr>
<tr>
<td>2</td>
<td>Examinar los hallazgos en la consola de GuardDuty</td>
</tr>
<tr>
<td>3</td>
<td>Verificar que los feeds de inteligencia de amenazas estén funcionando correctamente</td>
</tr>
<tr>
<td>4</td>
<td>Revisar la configuración de GuardDuty para asegurarse de que esté ajustada correctamente</td>
</tr>
</tbody>
</table></figure>


<p>Al verificar la integración y probar los hallazgos de muestra, puede estar seguro de que su entorno de AWS esté protegido contra las últimas amenazas y vulnerabilidades.</p>


<h2 id="conclusi%C3%B3n" tabindex="-1">Conclusión</h2>


<p>En resumen, la integración de GuardDuty de AWS con inteligencia de amenazas es una herramienta poderosa para mejorar la seguridad de su entorno de AWS. Al seguir los pasos descritos en este artículo, puede configurar GuardDuty para detectar y responder a las amenazas de manera efectiva.</p>


<p><strong>Verificar la Integración</strong></p>


<p>Para asegurarse de que la integración de los feeds de inteligencia de amenazas con GuardDuty sea exitosa, es importante generar y examinar hallazgos de muestra. Esto le permitirá verificar que la configuración de GuardDuty esté funcionando correctamente y detectando las amenazas de manera efectiva.</p>


<p><strong>Recomendaciones Finales</strong></p>


<p>Recuerde que la seguridad es un proceso continuo y requiere una vigilancia constante para mantenerse protegido contra las últimas amenazas. Al utilizar GuardDuty con inteligencia de amenazas, puede estar seguro de que su entorno de AWS esté protegido contra las últimas vulnerabilidades y ataques.</p>


<p>Esperamos que este artículo le haya proporcionado la guía y los consejos necesarios para integrar GuardDuty con inteligencia de amenazas de manera efectiva. ¡Si tiene alguna pregunta o necesita más ayuda, no dude en preguntar!</p>


<h2 id="recursos-y-preguntas-frecuentes" tabindex="-1">Recursos y Preguntas Frecuentes</h2>


<p>A continuación, se presentan algunos recursos adicionales y preguntas frecuentes relacionadas con la integración de GuardDuty de AWS con inteligencia de amenazas.</p>


<h3 id="recursos-adicionales" tabindex="-1">Recursos adicionales</h3>


<figure class="table"><table>
<thead>
<tr>
<th>Recurso</th>
<th>Descripción</th>
</tr>
</thead>
<tbody>
<tr>
<td>Documentación de AWS GuardDuty</td>
<td>Información detallada sobre cómo configurar y utilizar GuardDuty</td>
</tr>
<tr>
<td><a href="https://aws.amazon.com/security-hub/" rel="noopener noreferrer" target="_blank">AWS Security Hub</a></td>
<td>Servicio de seguridad que proporciona una visión unificada de la seguridad de su entorno de AWS</td>
</tr>
<tr>
<td><a href="https://flare.io/learn/resources/blog/threat-intelligence-feeds/" rel="noopener noreferrer" target="_blank">Threat Intelligence Feeds</a></td>
<td>Feeds de inteligencia de amenazas de terceros que ofrecen información actualizada sobre las últimas amenazas y vulnerabilidades</td>
</tr>
</tbody>
</table></figure>


<h3 id="preguntas-frecuentes" tabindex="-1">Preguntas frecuentes</h3>


<h4 id="%C2%BFqu%C3%A9-fuentes-de-datos-utiliza-amazon-guardduty-para-analizar-y-detectar-amenazas%3F" tabindex="-1">¿Qué fuentes de datos utiliza Amazon GuardDuty para analizar y detectar amenazas?</h4>


<p>Amazon GuardDuty utiliza varias fuentes de datos, incluyendo registros de eventos de CloudTrail, registros de flujo de VPC, registros de DNS y feeds de inteligencia de amenazas de terceros.</p>


<h4 id="%C2%BFes-guardduty-un-esc%C3%A1ner-de-vulnerabilidades%3F" tabindex="-1">¿Es GuardDuty un escáner de vulnerabilidades?</h4>


<p>No, GuardDuty no es un escáner de vulnerabilidades. En su lugar, se centra en la detección de actividad maliciosa y anomalías en su entorno de AWS.</p>


<p>Esperamos que estos recursos adicionales y preguntas frecuentes le hayan sido útiles. ¡Si tiene alguna otra pregunta o necesita más ayuda, no dude en preguntar!</p>


<h2 id="preguntas-frecuentes-1" tabindex="-1">Preguntas Frecuentes</h2>


<h3 id="%C2%BFqu%C3%A9-fuentes-de-datos-utiliza-amazon-guardduty-para-analizar-y-detectar-amenazas%3F-1" tabindex="-1">¿Qué fuentes de datos utiliza Amazon GuardDuty para analizar y detectar amenazas?</h3>


<p>Amazon GuardDuty utiliza varias fuentes de datos, incluyendo:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Fuente de datos</th>
<th>Descripción</th>
</tr>
</thead>
<tbody>
<tr>
<td>Registros de eventos de CloudTrail</td>
<td>Registros de actividad de AWS</td>
</tr>
<tr>
<td>Registros de flujo de VPC</td>
<td>Registros de tráfico de red</td>
</tr>
<tr>
<td>Registros de DNS</td>
<td>Registros de consultas de nombres de dominio</td>
</tr>
<tr>
<td>Feeds de inteligencia de amenazas de terceros</td>
<td>Información actualizada sobre las últimas amenazas y vulnerabilidades</td>
</tr>
</tbody>
</table></figure>


<p>Estas fuentes de datos permiten a GuardDuty analizar y detectar actividad maliciosa y anomalías en su entorno de AWS.</p>


<h3 id="%C2%BFes-guardduty-un-esc%C3%A1ner-de-vulnerabilidades%3F-1" tabindex="-1">¿Es GuardDuty un escáner de vulnerabilidades?</h3>


<p>No, GuardDuty no es un escáner de vulnerabilidades. En su lugar, se centra en la detección de actividad maliciosa y anomalías en su entorno de AWS. GuardDuty utiliza inteligencia de amenazas y alertas para identificar patrones de actividad sospechosos y proporcionar alertas proactivas sobre posibles amenazas.</p>


<p>
<h2>Related posts</h2>
<ul>
<li><a href="https://dondeaprendoaws.com/blog/mejores-practicas-de-seguridad-en-aws/">Mejores Prácticas de Seguridad en AWS</a></li><li><a href="https://dondeaprendoaws.com/blog/aws-seguridad-fundamentos-esenciales/">AWS Seguridad: Fundamentos Esenciales</a></li><li><a href="https://dondeaprendoaws.com/blog/aws-seguridad-servicios-esenciales/">Seguridad en AWS: Servicios Esenciales</a></li><li><a href="https://dondeaprendoaws.com/blog/seguridad-en-la-nube-aws-estrategias-clave/">Seguridad en la nube AWS: Estrategias clave</a></li>
</ul>
</p>
