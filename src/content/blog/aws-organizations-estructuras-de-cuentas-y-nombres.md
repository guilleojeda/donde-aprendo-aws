---
title: "AWS Organizations: Estructuras de cuentas y nombres"
description: "Aprende a gestionar eficientemente cuentas en AWS Organizations mediante una estructura clara y un sistema de nombres estandarizado."
publishedAt: "2025-02-27"
publishedTimestamp: "2025-02-27T04:44:08.163Z"
cover: "/assets/blog/0bc804415b6cb6339123371f.jpg"
coverAlt: "Thumbnail for: AWS Organizations: Estructuras de cuentas y nombres"
ogImage: "/assets/blog/0bc804415b6cb6339123371f.jpg"
related:
  - title: "Estructuras multi-cuenta AWS para escalar"
    url: "https://dondeaprendoaws.com/blog/estructuras-multi-cuenta-aws-para-escalar/"
    image: "/assets/blog/0e9e4bdd57782b78da6d878e.jpg"
    imageAlt: ""
  - title: "Acuerdos de Nivel de Servicio AWS: Guía Básica"
    url: "https://dondeaprendoaws.com/blog/acuerdos-de-nivel-de-servicio-aws-guia-basica/"
    image: "/assets/blog/a1b4827aff914f24a4598ecc.jpg"
    imageAlt: ""
  - title: "AWS curso certificado: guía básica"
    url: "https://dondeaprendoaws.com/blog/aws-curso-certificado-guia-basica/"
    image: "/assets/blog/35e338eebb5988d204344c86.jpg"
    imageAlt: ""
---

<p><strong><a href="https://docs.aws.amazon.com/organizations/latest/userguide/orgs_introduction.html" rel="noopener noreferrer" target="_blank">AWS Organizations</a></strong> es una herramienta clave para gestionar múltiples cuentas de AWS desde un único lugar. Ofrece control centralizado sobre seguridad, costes y administración, ideal para empresas que necesitan escalar en la nube. Aquí tienes los puntos principales que debes saber para estructurar y nombrar tus cuentas de forma eficiente:</p>


<ul>
<li><strong>Gestión centralizada</strong>: Organiza cuentas en Unidades Organizativas (OUs) y aplica políticas globales.</li>
<li><strong>Control de seguridad</strong>: Usa Service Control Policies (SCPs) para limitar permisos y proteger recursos.</li>
<li><strong>Facturación unificada</strong>: Consolida los gastos de todas las cuentas bajo un único método de pago.</li>
<li><strong>Nombres estandarizados</strong>: Define un esquema uniforme que incluya propósito, entorno y aplicación para identificar cuentas fácilmente.</li>
<li><strong>Etiquetado eficiente</strong>: Aplica etiquetas clave-valor para organizar recursos y controlar costes.</li>
</ul>


<p><strong>¿Por qué es importante?</strong> Una estructura bien diseñada y un sistema de nombres claro facilitan la administración, mejoran la seguridad y optimizan los costes en tu organización de AWS.</p>


<h2 class="sb h2-sbb-cls" id="estructuracion-de-cuentas" tabindex="-1">Estructuración de cuentas</h2>


<p>Con los fundamentos de AWS Organizations definidos, es hora de configurar estructuras de cuentas que permitan una gestión eficiente, mejor seguridad y control de costes.</p>


<h3 id="diseno-de-la-jerarquia-de-cuentas" tabindex="-1">Diseño de la jerarquía de cuentas</h3>


<p>La jerarquía de cuentas debe basarse en funcionalidad y control. Esto asegura una base sólida que permita escalar y adaptarse a nuevas necesidades.</p>


<p>Tipos de cuentas recomendados:</p>


<ul>
<li><strong>Cuenta raíz</strong>: Exclusiva para la gestión de la organización.</li>
<li><strong>Cuentas de soporte</strong>: Para seguridad, redes, servicios compartidos, registros y copias de seguridad.</li>
<li><strong>Cuentas de workload</strong>: Organizadas por ambiente (desarrollo, pruebas, producción).</li>
</ul>


<p>Esta segmentación facilita la aplicación de políticas y el cumplimiento de normas establecidas.</p>


<h3 id="trabajo-con-unidades-organizativas" tabindex="-1">Trabajo con Unidades Organizativas</h3>


<p>Una vez diseñada la jerarquía, utiliza Unidades Organizativas (OUs) para agrupar cuentas y aplicar políticas de forma centralizada. Las OUs permiten organizar cuentas según controles y funcionalidades comunes.</p>


<p>Estructura básica sugerida:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Nivel de OU</th>
<th>Propósito</th>
<th>Características</th>
</tr>
</thead>
<tbody>
<tr>
<td>Fundacional</td>
<td>Infraestructura y seguridad</td>
<td>Control centralizado de políticas esenciales</td>
</tr>
<tr>
<td>Sandbox</td>
<td>Desarrollo y experimentación</td>
<td>Permisos restringidos, presupuestos limitados</td>
</tr>
<tr>
<td>Workloads</td>
<td>Cargas de trabajo productivas</td>
<td>Separación por ambiente y función</td>
</tr>
</tbody>
</table></figure>


<blockquote>
<p>"Las cuentas de AWS son límites naturales para permisos, seguridad, costes y cargas de trabajo." </p>
</blockquote>


<p><strong>Consejos para optimizar las OUs:</strong></p>


<ol>
<li><strong>Aplicación de políticas</strong>: Aplica políticas a nivel de OU en lugar de hacerlo cuenta por cuenta.</li>
<li><strong>Agrupación estratégica</strong>: Coloca cuentas con necesidades similares bajo una misma OU.</li>
<li><strong>Pruebas de cambios</strong>: Antes de aplicar cambios globales, prueba las políticas en entornos no productivos.</li>
</ol>


<p>Una estructura bien planificada asegura un control efectivo sobre seguridad y costes, mientras simplifica la gestión del entorno empresarial.</p>


<h2 class="sb h2-sbb-cls" id="estandares-de-nombres-para-cuentas" tabindex="-1">Estándares de Nombres para Cuentas</h2>


<p>Una vez definida la estructura de cuentas, es importante establecer convenciones de nombres claras para facilitar la administración y el control.</p>


<h3 id="ventajas-de-usar-nombres-estandarizados" tabindex="-1">Ventajas de usar nombres estandarizados</h3>


<p>Definir un sistema uniforme para nombrar las cuentas de AWS ayuda a mantener un entorno más organizado y funcional. Un esquema de nombres bien pensado permite identificar rápidamente el propósito, entorno y función de cada cuenta. Algunas de las principales ventajas incluyen:</p>


<ul>
<li><strong>Identificación rápida</strong>: Facilita reconocer el propósito y entorno de una cuenta al instante.</li>
<li><strong>Gestión más sencilla</strong>: Mejora la administración y el control de accesos.</li>
<li><strong>Menos errores</strong>: Disminuye las confusiones al asignar recursos.</li>
<li><strong>Crecimiento ordenado</strong>: Permite escalar manteniendo la coherencia.</li>
</ul>


<p>Estos puntos son clave para crear un sistema de nombres efectivo y claro.</p>


<h3 id="elementos-clave-en-la-estructura-de-nombres" tabindex="-1">Elementos clave en la estructura de nombres</h3>


<p>Siguiendo la segmentación de cuentas definida, la estructura de nombres debe reflejar la jerarquía organizativa y mantener un patrón uniforme. Se recomienda incluir los siguientes elementos:</p>


<figure class="table"><table>
<thead>
<tr>
<th><strong>Elemento</strong></th>
<th><strong>Descripción</strong></th>
<th><strong>Ejemplo</strong></th>
</tr>
</thead>
<tbody>
<tr>
<td>Propósito principal</td>
<td>Indica el propósito general de la cuenta</td>
<td>Workloads, Security</td>
</tr>
<tr>
<td>Identificador específico</td>
<td>Código del proyecto o aplicación</td>
<td>fooA, fooB</td>
</tr>
<tr>
<td>Entorno</td>
<td>Define el entorno (desarrollo, pruebas, prod.)</td>
<td>Dev, Test, Prod</td>
</tr>
</tbody>
</table></figure>


<p>Además, la dirección de correo asociada debe seguir la misma lógica. Por ejemplo, una cuenta llamada "WorkloadsFooADev" podría usar el correo: <code class="inline-code">Workloads+fooA+dev@dominio.com</code>.</p>


<h3 id="ejemplos-practicos-de-nomenclatura" tabindex="-1">Ejemplos prácticos de nomenclatura</h3>


<p>Con la estructura definida, aquí tienes ejemplos de cómo implementar nombres estandarizados. Para una empresa ficticia como "AnyCompany", se pueden usar etiquetas complementarias como:</p>


<ul>
<li><strong>anycompany:cost-center</strong>: Para identificar el código del centro de costes.</li>
<li><strong>anycompany:environment-type</strong>: Para especificar si el entorno es de desarrollo, pruebas o producción.</li>
<li><strong>anycompany:application-id</strong>: Para asociar recursos con una aplicación concreta.</li>
</ul>


<p>Es importante recordar que las etiquetas no pueden comenzar con "aws:", ya que este prefijo está reservado para AWS. Para mantener consistencia, usa minúsculas y separa las palabras con guiones en las etiquetas.</p>


<p>En el caso de <a href="https://dondeaprendoaws.com/blog/tipos-y-tamanos-de-instancias-ec2-guia-completa/">instancias EC2</a>, aplica un formato como:<br/>
<code class="inline-code">ec2-RegionCode-AvailabilityZoneCode-EnvironmentCode-ApplicationCode</code>.<br/>
Este esquema asegura que los recursos sean fáciles de identificar y estén alineados con la estructura organizativa general.</p>




<h2 class="sb h2-sbb-cls" id="guia-de-etiquetado-de-cuentas" tabindex="-1">Guía de Etiquetado de Cuentas</h2>


<p>El <a href="https://dondeaprendoaws.com/blog/gestionando-multiples-cuentas-de-aws-con-aws-organizations/">etiquetado en AWS Organizations</a> es clave para gestionar recursos y controlar costes. Aquí te mostramos cómo establecer una estrategia de etiquetado clara y funcional.</p>


<h3 id="reglas-de-estructura-para-etiquetas" tabindex="-1">Reglas de Estructura para Etiquetas</h3>


<p>Las etiquetas deben seguir un patrón uniforme que facilite la organización y el seguimiento de los recursos. Estas etiquetas funcionan como pares clave-valor y deben respetar estas reglas básicas:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Componente</th>
<th>Regla</th>
<th>Ejemplo</th>
</tr>
</thead>
<tbody>
<tr>
<td>Clave</td>
<td>Distingue entre mayúsculas y minúsculas</td>
<td>CostCenter</td>
</tr>
<tr>
<td>Valor</td>
<td>Opcional y también distingue entre mayúsculas y minúsculas</td>
<td>EMEA-ES-PROD</td>
</tr>
<tr>
<td>Prefijo</td>
<td>"aws:" está reservado exclusivamente para AWS</td>
<td>user:department</td>
</tr>
</tbody>
</table></figure>


<p>Para mantener un etiquetado eficaz:</p>


<ul>
<li>Crea una taxonomía clara que abarque todas las unidades de negocio.</li>
<li>Usa un formato uniforme para valores similares.</li>
<li>Evita incluir información sensible o confidencial en las etiquetas.</li>
</ul>


<h3 id="etiquetas-para-facturacion-y-acceso" tabindex="-1">Etiquetas para Facturación y Acceso</h3>


<p>Una vez definida la estructura de las etiquetas, es esencial aplicarlas correctamente para un mejor control en facturación y acceso. AWS clasifica las etiquetas en dos categorías principales:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Tipo de Etiqueta</th>
<th>Descripción</th>
<th>Uso Recomendado</th>
</tr>
</thead>
<tbody>
<tr>
<td>Generadas por AWS</td>
<td>Llevan el prefijo "aws:"</td>
<td>Seguimiento automático de recursos</td>
</tr>
<tr>
<td>Definidas por usuario</td>
<td>Llevan el prefijo "user"</td>
<td>Organización personalizada</td>
</tr>
</tbody>
</table></figure>


<p>Para gestionar los costes de manera eficiente, sigue estos pasos:</p>


<ul>
<li><strong>Activa las etiquetas de asignación</strong>: Configúralas en la consola de <a href="https://dondeaprendoaws.com/blog/gestion-de-facturacion-de-aws-guia-completa/">Facturación y Administración de Costes</a> para vincular recursos con centros de coste.</li>
<li><strong>Utiliza <a href="https://docs.aws.amazon.com/config/" rel="noopener noreferrer" target="_blank">AWS Config</a></strong>: Aplica reglas para garantizar que los recursos cumplan con las etiquetas requeridas.</li>
<li><strong>Emplea Tag Editor</strong>: Encuentra y corrige recursos que no tengan etiquetas asignadas.</li>
</ul>


<p>Por ejemplo, puedes configurar políticas de etiquetas para evitar gastos innecesarios. Si alguien intenta crear una <a href="https://dondeaprendoaws.com/blog/mejores-practicas-para-amazon-ec2/">instancia EC2</a> sin incluir la etiqueta obligatoria "CostCenter", el sistema bloqueará la operación. Esto asegura que todos los recursos estén correctamente clasificados desde el principio.</p>


<p>Ten en cuenta que las etiquetas pueden tardar hasta 24 horas en reflejarse en la consola de Facturación y Administración de Costes. Por eso, es importante planificar con suficiente tiempo la implementación de nuevas etiquetas.</p>


<p>Aplicar estas prácticas de etiquetado de manera adecuada sentará una base sólida para gestionar los recursos de forma eficiente en futuras etapas de administración de cuentas.</p>


<h2 class="sb h2-sbb-cls" id="pasos-de-gestion-de-cuentas" tabindex="-1">Pasos de Gestión de Cuentas</h2>


<p>La gestión de cuentas implica supervisar su ciclo de vida, desde la creación inicial hasta su eliminación, garantizando un control adecuado y evitando gastos innecesarios.</p>


<h3 id="configuracion-de-nuevas-cuentas" tabindex="-1">Configuración de Nuevas Cuentas</h3>


<p>Siga estos pasos para configurar una cuenta correctamente:</p>


<ul>
<li>La información de contacto se copia automáticamente desde la cuenta de administración principal.</li>
<li>Se crea el rol IAM <strong>"OrganizationAccountAccessRole"</strong> en la cuenta miembro para facilitar el control centralizado.</li>
<li>Se genera el rol <strong>"AWSServiceRoleForOrganizations"</strong> para integrar servicios de AWS de manera eficiente.</li>
</ul>


<p><strong>Aspectos clave a tener en cuenta</strong>:</p>


<ul>
<li>Las cuentas solo pueden crearse en la raíz de la organización.</li>
<li>Es obligatorio usar un correo electrónico único que no esté vinculado a otras cuentas de AWS.</li>
<li>Durante la creación, puede añadir hasta 50 etiquetas para una mejor organización.</li>
</ul>


<p>Después de configurar una cuenta, es igualmente importante gestionar su desactivación cuando ya no sea necesaria.</p>


<h3 id="proceso-de-limpieza-de-cuentas" tabindex="-1">Proceso de Limpieza de Cuentas</h3>


<p>Para evitar costos innecesarios, asegúrese de realizar una limpieza adecuada de las cuentas que ya no se utilizan. Este proceso consta de tres fases principales:</p>


<p>1. <strong>Preparación previa</strong></p>


<p>Antes de eliminar una cuenta, confirme que tiene toda la información y configuraciones necesarias para operar de forma independiente. Esto incluye el plan de soporte, datos de contacto actualizados y un método de pago válido.</p>


<p>2. <strong>Gestión de recursos activos</strong></p>


<p>Una vez revisada la información, elimine los recursos activos utilizando la consola de <strong>AWS Management</strong> para cada servicio. Para identificar las regiones con servicios activos, consulte la consola de <strong>Facturación y Administración de Costes</strong>.</p>


<p>3. <strong>Proceso de eliminación</strong></p>


<p>Cuando una cuenta se elimina, entra en estado "suspendido" durante 90 días. Pasado este período, se elimina de forma permanente, perdiendo acceso a datos históricos de costes, etiquetas, políticas organizacionales y acuerdos.</p>


<p>Para entornos de desarrollo y pruebas, puede usar <strong><a href="https://github.com/ekristen/aws-nuke" rel="noopener noreferrer" target="_blank">AWS-NUKE</a></strong> para automatizar la limpieza de recursos. Asegúrese de ejecutar siempre el modo <em>DRY RUN</em> antes de proceder, para evitar eliminaciones accidentales.</p>


<h2 class="sb h2-sbb-cls" id="resumen-y-recursos" tabindex="-1">Resumen y Recursos</h2>


<h3 id="revision-de-puntos-principales" tabindex="-1">Revisión de Puntos Principales</h3>


<p>Configurar AWS Organizations requiere entender cómo estructurar cuentas y establecer convenciones de nombres adecuadas. Algunos puntos clave incluyen:</p>


<ul>
<li><strong>Gestión centralizada</strong>: Administrar las cuentas de AWS desde un solo lugar garantiza operaciones consistentes y una separación eficiente de las cargas de trabajo según sus objetivos.</li>
<li><strong>Aislamiento de entornos</strong>: Usar Unidades Organizativas (OUs) específicas para cada entorno mejora la seguridad y el control.</li>
</ul>


<p>Para optimizar la estructura, ten en cuenta lo siguiente:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Aspecto</th>
<th>Ventaja Principal</th>
<th>Implementación Sugerida</th>
</tr>
</thead>
<tbody>
<tr>
<td><strong>Seguridad</strong></td>
<td>Separación clara entre entornos</td>
<td>Uso de OUs específicas</td>
</tr>
<tr>
<td><strong>Facturación</strong></td>
<td>Mayor visibilidad de costos</td>
<td>Etiquetas unificadas</td>
</tr>
<tr>
<td><strong>Gestión</strong></td>
<td>Administración más sencilla</td>
<td>Convenciones de nombres estándar</td>
</tr>
</tbody>
</table></figure>


<h3 id="recursos-adicionales" tabindex="-1">Recursos Adicionales</h3>


<p>Si quieres profundizar más en estos temas, aquí tienes algunas fuentes útiles:</p>


<ol>
<li>
<strong>Documentación Oficial</strong><br/>
La <a href="https://dondeaprendoaws.com/blog/aws-curso-certificado-guia-basica/">guía oficial de AWS Organizations</a> ofrece información detallada sobre configuración y administración.
</li>
<li>
<strong>Recursos en Español</strong><br/>
Visita <a href="https://dondeaprendoaws.com">Dónde Aprendo AWS</a> para explicaciones completas sobre AWS Organizations en español.
</li>
<li>
<strong><a href="https://dondeaprendoaws.com/blog/mejores-practicas-aws-para-devops/">Mejores Prácticas</a></strong><br/>
Explora el artículo "Best Practices for Organizational Units with AWS Organizations" en el Centro de Conocimiento de AWS.
</li>
</ol>


<p><strong>Herramientas Clave</strong>:</p>


<ul>
<li><strong>AWS CLI Reference</strong>: Ideal para gestionar AWS mediante comandos.</li>
<li><strong>AWS Account Management Reference Guide</strong>: Una guía completa para la administración de cuentas.</li>
<li><strong><a href="https://aws.amazon.com/training/digital/" rel="noopener noreferrer" target="_blank">AWS Skill Builder</a></strong>: Plataforma de formación digital para mejorar tus habilidades.</li>
</ul>


<h2>Publicaciones de blog relacionadas</h2>
<ul><li><a href="https://dondeaprendoaws.com/blog/gestionando-multiples-cuentas-de-aws-con-aws-organizations/">Gestionando Múltiples Cuentas de AWS con AWS Organizations</a></li><li><a href="https://dondeaprendoaws.com/blog/mejores-practicas-de-seguridad-en-aws/">Mejores Prácticas de Seguridad en AWS</a></li><li><a href="https://dondeaprendoaws.com/blog/politicas-de-confianza-aws-acceso-entre-cuentas/">Políticas de Confianza AWS: Acceso Entre Cuentas</a></li><li><a href="https://dondeaprendoaws.com/blog/checklist-para-automatizar-cumplimiento-en-aws/">Checklist para automatizar cumplimiento en AWS</a></li></ul>
