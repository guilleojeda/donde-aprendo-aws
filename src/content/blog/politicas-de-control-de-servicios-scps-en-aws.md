---
title: "Políticas de Control de Servicios (SCPs) en AWS"
description: "Descubra cómo las SCPs en AWS mejoran la seguridad y el cumplimiento mediante la gestión de permisos y el control de accesos en la organización."
publishedAt: "2024-05-09"
publishedTimestamp: "2024-05-09T02:00:12.498Z"
cover: "/assets/blog/ae0015b4c4fa992bfdc8c817.jpg"
coverAlt: "Thumbnail for: Políticas de Control de Servicios (SCPs) en AWS"
ogImage: "/assets/blog/ae0015b4c4fa992bfdc8c817.jpg"
related:
  - title: "Monitoreo y Logs de AWS Step Functions: Guía 2024"
    url: "https://dondeaprendoaws.com/blog/monitoreo-y-logs-de-aws-step-functions-guia-2024/"
    image: "/assets/blog/3cdeed308ae19cafa2c58e0d.jpg"
    imageAlt: ""
  - title: "Guía de UEBA para la Seguridad de AWS"
    url: "https://dondeaprendoaws.com/blog/guia-de-ueba-para-la-seguridad-de-aws/"
    image: "/assets/blog/77827c07de64ac355ca01278.jpg"
    imageAlt: ""
  - title: "Opciones para Desplegar Contenedores en AWS: ECS y EKS"
    url: "https://dondeaprendoaws.com/blog/opciones-para-desplegar-contenedores-en-aws-ecs-y-eks/"
    image: "/assets/blog/fce8d84a0c54b5cb44769316.png"
    imageAlt: ""
---

<p>Las Políticas de Control de Servicios (SCPs) son una poderosa herramienta de <a href="https://aws.amazon.com/" rel="noopener noreferrer" target="_blank">AWS</a> para controlar y restringir el acceso a servicios y recursos en una organización. Permiten establecer permisos centralizados para todos los usuarios y roles, mejorando la seguridad y el cumplimiento.</p>


<p><strong>¿Qué son las SCPs?</strong></p>


<ul>
<li>Definen permisos máximos para usuarios y roles de <a href="https://docs.aws.amazon.com/IAM/latest/UserGuide/introduction.html" rel="noopener noreferrer" target="_blank">IAM</a> en una organización</li>
<li>Controlan el acceso a servicios y recursos de AWS</li>
<li>Se aplican a nivel de unidad organizativa (OU) o cuenta</li>
</ul>


<p><strong>Crear y Administrar SCPs</strong></p>


<figure class="table"><table>
<thead>
<tr>
<th>Componente</th>
<th>Descripción</th>
</tr>
</thead>
<tbody>
<tr>
<td>Declaraciones</td>
<td>Definen acciones permitidas o denegadas</td>
</tr>
<tr>
<td>Efectos</td>
<td>Allow o Deny</td>
</tr>
<tr>
<td>Acciones</td>
<td>Operaciones permitidas o denegadas</td>
</tr>
<tr>
<td>Recursos</td>
<td>Objetos afectados por la SCP</td>
</tr>
<tr>
<td>Condiciones</td>
<td>Restricciones adicionales</td>
</tr>
</tbody>
</table></figure>


<p><strong>Casos de Uso</strong></p>


<ul>
<li>Restringir acciones por región</li>
<li>Exigir autenticación multifactor (MFA)</li>
<li>Prevenir cambios no autorizados en configuraciones</li>
</ul>


<p><strong>Mejores Prácticas</strong></p>


<ul>
<li>Probar SCPs antes de implementarlas</li>
<li>Utilizar SCPs específicas por OU o cuenta</li>
<li>Revisar y actualizar SCPs regularmente</li>
<li>Seguir principios de privilegios mínimos</li>
</ul>


<p>Las SCPs son fundamentales para una gobernanza efectiva en AWS, permitiendo controlar el acceso a recursos y servicios de manera centralizada y segura.</p>


<h2 id="crear-pol%C3%ADticas-de-control-de-servicios-efectivas" tabindex="-1">Crear Políticas de Control de Servicios Efectivas</h2>


<p>Crear políticas de control de servicios (SCPs) efectivas es crucial para garantizar la seguridad y el cumplimiento en su <a href="https://dondeaprendoaws.com/blog/gestionando-multiples-cuentas-de-aws-con-aws-organizations/">organización de AWS</a>. En esta sección, se describirán los componentes clave de una SCP y se proporcionarán pasos detallados para crear una nueva SCP.</p>


<h3 id="componentes-de-scp" tabindex="-1">Componentes de SCP</h3>


<p>Las políticas de control de servicios (SCPs) se componen de varias partes clave:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Componente</th>
<th>Descripción</th>
</tr>
</thead>
<tbody>
<tr>
<td><strong>Declaraciones</strong></td>
<td>Definen las acciones permitidas o denegadas. Las declaraciones pueden ser de tipo "Allow" o "Deny".</td>
</tr>
<tr>
<td><strong>Efectos</strong></td>
<td>Determinan el resultado de una declaración. Los efectos pueden ser "Allow" o "Deny".</td>
</tr>
<tr>
<td><strong>Acciones</strong></td>
<td>Son las operaciones que se permiten o deniegan en una SCP. Las acciones pueden ser específicas de un servicio o recurso de AWS.</td>
</tr>
<tr>
<td><strong>Recursos</strong></td>
<td>Son los objetos que se afectan por una SCP. Los recursos pueden ser cuentas, roles, usuarios o recursos de AWS específicos.</td>
</tr>
<tr>
<td><strong>Condiciones</strong></td>
<td>Son restricciones adicionales que se aplican a una SCP. Las condiciones pueden ser basadas en atributos de recursos, como la región o el tipo de recurso.</td>
</tr>
</tbody>
</table></figure>


<h3 id="pasos-para-crear-una-nueva-scp" tabindex="-1">Pasos para crear una nueva SCP</h3>


<p>Para crear una nueva SCP, siga estos pasos:</p>


<p>1. <strong>Determinar el propósito de la SCP</strong>: Defina el propósito de la SCP y qué tipo de acceso quiere controlar.</p>


<p>2. <strong>Elegir el efecto</strong>: Seleccione el efecto deseado para la SCP, ya sea "Allow" o "Deny".</p>


<p>3. <strong>Especificar las acciones</strong>: Especifique las acciones que se permiten o deniegan en la SCP.</p>


<p>4. <strong>Definir los recursos</strong>: Defina los recursos que se afectan por la SCP.</p>


<p>5. <strong>Agregar condiciones (opcional)</strong>: Agregue condiciones adicionales para restringir la SCP según sea necesario.</p>


<p>6. <strong>Probar la SCP</strong>: Pruebe la SCP en un entorno de prueba antes de implementarla en producción.</p>


<p>Recuerde que es importante probar y refinar su SCP antes de implementarla en su organización de AWS.</p>


<h2 id="adjuntar-y-desadjuntar-scps" tabindex="-1">Adjuntar y desadjuntar SCPs</h2>


<p>Adjuntar y desadjuntar Políticas de Control de Servicios (SCPs) es un aspecto crucial para administrar el acceso dentro de las organizaciones de AWS. En esta sección, exploraremos los permisos necesarios para adjuntar y desadjuntar SCPs y el impacto de estos cambios en las cuentas de AWS.</p>


<h3 id="permisos-para-cambios-de-scp" tabindex="-1">Permisos para cambios de SCP</h3>


<p>Para adjuntar o desadjuntar una SCP, se necesita permiso para ejecutar las siguientes acciones:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Acción</th>
<th>Descripción</th>
</tr>
</thead>
<tbody>
<tr>
<td><code class="inline-code">organizations:AttachPolicy</code></td>
<td>Adjuntar una SCP a una cuenta, OU o raíz.</td>
</tr>
<tr>
<td><code class="inline-code">organizations:DetachPolicy</code></td>
<td>Desadjuntar una SCP de una cuenta, OU o raíz.</td>
</tr>
</tbody>
</table></figure>


<p>Estos permisos se pueden otorgar a usuarios de IAM, roles o el usuario raíz en la cuenta de administración de la organización.</p>


<h3 id="adjuntar-scps-a-entidades-de-aws" tabindex="-1">Adjuntar SCPs a entidades de <a href="https://aws.amazon.com/" rel="noopener noreferrer" target="_blank">AWS</a></h3>


<p><figure><img alt="AWS" src="/assets/blog/2ebe3cf8e7ae57e98d3af846.jpg"/></figure></p>


<p>Para adjuntar una SCP a una raíz, OU o cuenta, puede utilizar la Consola de administración de AWS, la CLI de AWS o los SDK de AWS. A continuación, se muestra un ejemplo de cómo adjuntar una SCP utilizando la CLI de AWS:</p>


<pre><code>aws organizations attach-policy \
    --policy-id p-i9j8k7l6m5 \
    --target-id ou-a1b2-f6g7h222
</code></pre>


<p>Este comando adjunta la SCP especificada a la OU especificada. El cambio de política tiene efecto inmediato, afectando los permisos de los usuarios de IAM y roles en la cuenta adjunta o todas las cuentas bajo la raíz o OU adjunta.</p>


<h3 id="desadjuntar-scps%3A-restricciones-y-efectos" tabindex="-1">Desadjuntar SCPs: restricciones y efectos</h3>


<p>Para desadjuntar una SCP de una raíz, OU o cuenta, puede utilizar la Consola de administración de AWS, la CLI de AWS o los SDK de AWS. A continuación, se muestra un ejemplo de cómo desadjuntar una SCP utilizando la CLI de AWS:</p>


<pre><code>aws organizations detach-policy \
    --policy-id p-i9j8k7l6m5 \
    --target-id ou-a1b2-f6g7h222
</code></pre>


<p>Este comando desadjunta la SCP especificada de la OU especificada. El cambio de política tiene efecto inmediato, afectando los permisos de los usuarios de IAM y roles en la cuenta desadjunta o todas las cuentas bajo la raíz o OU desadjunta.</p>


<p>Al desadjuntar una SCP, tenga en cuenta las siguientes restricciones y efectos:</p>


<ul>
<li>No se puede desadjuntar una SCP de una raíz, OU o cuenta si es la única SCP adjunta a esa entidad.</li>
<li>Desadjuntar una SCP no afecta los permisos de los usuarios de IAM y roles que ya han sido otorgados acceso a la entidad desadjunta.</li>
<li>Desadjuntar una SCP puede llevar a acceso no autorizado o violaciones de seguridad si no se planifica y ejecuta adecuadamente.</li>
</ul>


<p>Al entender los permisos y restricciones involucrados en adjuntar y desadjuntar SCPs, puede administrar efectivamente el acceso dentro de su organización de AWS y asegurar la seguridad y el cumplimiento de sus recursos.</p>


<h2 id="mantenimiento-de-pol%C3%ADticas-de-control-de-servicios" tabindex="-1">Mantenimiento de Políticas de Control de Servicios</h2>


<p>El mantenimiento de las Políticas de Control de Servicios (SCPs) es crucial para garantizar la gobernanza y el control continuos dentro de su organización de AWS. A medida que evoluciona la necesidad de su organización, es posible que deba actualizar, etiquetar o incluso eliminar SCPs existentes. Esta sección cubre las mejores prácticas para administrar SCPs con el tiempo.</p>


<h3 id="actualizar-una-scp" tabindex="-1">Actualizar una SCP</h3>


<p>Puede actualizar una SCP existente cambiando su nombre, descripción o contenido de la política. Para actualizar una SCP, necesita los siguientes permisos:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Permiso</th>
<th>Descripción</th>
</tr>
</thead>
<tbody>
<tr>
<td><code class="inline-code">organizations:UpdatePolicy</code></td>
<td>Permite actualizar el nombre, descripción o contenido de la SCP.</td>
</tr>
<tr>
<td><code class="inline-code">organizations:DescribePolicy</code></td>
<td>Permite ver los detalles actuales de la SCP.</td>
</tr>
</tbody>
</table></figure>


<p>Puede actualizar una SCP utilizando la Consola de administración de AWS, la CLI de AWS o los SDK de AWS. Por ejemplo, para renombrar una SCP utilizando la CLI de AWS:</p>


<pre><code>aws organizations update-policy \
    --policy-id p-i9j8k7l6m5 \
    --name "Nueva Política SCP"
</code></pre>


<p>Cuando actualiza el contenido de una SCP, los cambios surten efecto inmediato, afectando los permisos de los usuarios de IAM y roles en todas las cuentas donde se adjunta la SCP.</p>


<h3 id="administrar-etiquetas-de-scp" tabindex="-1">Administrar etiquetas de SCP</h3>


<p>Puede agregar, editar o eliminar etiquetas asociadas con una SCP para ayudar a organizar e identificar sus políticas. Las etiquetas son pares clave-valor que puede utilizar para categorizar y filtrar recursos.</p>


<p>Para administrar etiquetas para una SCP, necesita los siguientes permisos:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Permiso</th>
<th>Descripción</th>
</tr>
</thead>
<tbody>
<tr>
<td><code class="inline-code">organizations:TagResource</code></td>
<td>Permite agregar o actualizar etiquetas para una SCP.</td>
</tr>
<tr>
<td><code class="inline-code">organizations:UntagResource</code></td>
<td>Permite eliminar etiquetas de una SCP.</td>
</tr>
</tbody>
</table></figure>


<p>Puede administrar etiquetas de SCP utilizando la Consola de administración de AWS, la CLI de AWS o los SDK de AWS. Por ejemplo, para agregar una etiqueta a una SCP utilizando la CLI de AWS:</p>


<pre><code>aws organizations tag-resource \
    --resource-id p-i9j8k7l6m5 \
    --tags Key=Entorno,Value=Producción
</code></pre>


<p>Etiquetar SCPs puede ayudar a organizar y administrar mejor sus políticas, especialmente en organizaciones grandes con muchas SCPs.</p>


<h3 id="eliminar-una-scp-de-manera-segura" tabindex="-1">Eliminar una SCP de manera segura</h3>


<p>Si ya no necesita una SCP, puede eliminarla de su organización de AWS. Sin embargo, es importante seguir un proceso de eliminación seguro para evitar consecuencias no deseadas:</p>


<p>1. <strong>Desadjuntar la SCP</strong>: Antes de eliminar una SCP, debe desadjuntarla de todas las unidades organizativas (OUs), cuentas y la raíz. No hacerlo puede resultar en acceso no autorizado o violaciones de seguridad.</p>


<p>2. <strong>Verificar la desadjuntación de la SCP</strong>: Después de desadjuntar la SCP, verifique que ya no esté adjunta a ninguna entidad dentro de su organización.</p>


<p>3. <strong>Eliminar la SCP</strong>: Una vez que haya confirmado que la SCP está desadjunta, puede eliminarla de manera segura utilizando la Consola de administración de AWS, la CLI de AWS o los SDK de AWS.</p>


<p>Para eliminar una SCP utilizando la CLI de AWS:</p>


<pre><code>aws organizations delete-policy \
    --policy-id p-i9j8k7l6m5
</code></pre>


<p>Eliminar una SCP es una acción permanente, por lo que es crucial ser cauteloso y seguir los pasos adecuados para evitar consecuencias no deseadas.</p>


<p>Al mantener regularmente sus SCPs, actualizandolas según sea necesario, administrando etiquetas y eliminando políticas obsoletas de manera segura, puede asegurar que su organización de AWS permanezca bien gobernada y segura.</p>


<h2 id="implementar-scps-de-manera-efectiva" tabindex="-1">Implementar SCPs de manera efectiva</h2>


<p>Para implementar políticas de control de servicios (SCPs) de manera efectiva, es crucial seguir las mejores prácticas y recomendaciones para maximizar la seguridad y minimizar la interrupción operativa dentro de una organización de AWS.</p>


<h3 id="mejores-pr%C3%A1cticas-para-scps" tabindex="-1">Mejores prácticas para SCPs</h3>


<p>A continuación, se presentan algunas de las mejores prácticas para implementar SCPs:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Mejora práctica</th>
<th>Descripción</th>
</tr>
</thead>
<tbody>
<tr>
<td>Aplicar SCPs a nivel de OU</td>
<td>Permite un control más fino sobre los permisos y acceso a los recursos dentro de la organización.</td>
</tr>
<tr>
<td>Exigir autenticación multifactor (MFA)</td>
<td>Protege contra el acceso no autorizado a los recursos.</td>
</tr>
<tr>
<td>Restringir regiones y compartir imágenes de máquina virtual (AMI)</td>
<td>Evita el acceso no autorizado a los recursos.</td>
</tr>
</tbody>
</table></figure>


<h3 id="probar-y-solucionar-problemas-con-scps" tabindex="-1">Probar y solucionar problemas con SCPs</h3>


<p>Antes de implementar SCPs de manera generalizada, es fundamental probarlos en un entorno de prueba para asegurarse de que funcionen correctamente y no causen interrupciones operativas.</p>


<p><strong>Pasos para probar SCPs</strong></p>


<p>1. Crear un entorno de prueba con una OU o cuenta de prueba. 2. Aplicar la SCP a esa entidad. 3. Probar los permisos y acceso a los recursos para asegurarse de que la SCP esté funcionando correctamente. 4. Utilizar herramientas como <a href="https://aws.amazon.com/cloudtrail/" rel="noopener noreferrer" target="_blank">AWS CloudTrail</a> para depurar y solucionar problemas con SCPs.</p>


<p>Al seguir estas prácticas y recomendaciones, puede asegurarse de implementar SCPs de manera efectiva y segura dentro de su organización de AWS.</p>


<h2 id="casos-de-uso-de-scp" tabindex="-1">Casos de uso de SCP</h2>


<p>Las políticas de control de servicios (SCPs) ofrecen varias formas de mejorar la seguridad y el cumplimiento dentro de las organizaciones de AWS. A continuación, se presentan algunos ejemplos de cómo las SCPs pueden ser utilizadas para reforzar la seguridad y el cumplimiento.</p>


<h3 id="control-de-acceso-basado-en-regi%C3%B3n" tabindex="-1">Control de acceso basado en región</h3>


<p>Las SCPs pueden ser utilizadas para restringir las acciones de las cuentas basadas en la región de AWS. Por ejemplo, una SCP puede ser creada para denegar todas las acciones fuera de las regiones específicas, como <code class="inline-code">eu-central-1</code> o <code class="inline-code">eu-west-1</code>. Esto garantiza que las cuentas solo puedan acceder a los recursos y servicios dentro de las regiones permitidas.</p>


<figure class="table"><table>
<thead>
<tr>
<th>Acción</th>
<th>Descripción</th>
</tr>
</thead>
<tbody>
<tr>
<td>Denegar todas las acciones</td>
<td>Fuera de las regiones específicas</td>
</tr>
<tr>
<td>Permitir acciones específicas</td>
<td>Dentro de las regiones permitidas</td>
</tr>
</tbody>
</table></figure>


<h3 id="exigir-autenticaci%C3%B3n-multifactor-con-scps" tabindex="-1">Exigir autenticación multifactor con SCPs</h3>


<p>Las SCPs también pueden ser utilizadas para exigir la autenticación multifactor (MFA) para ejecutar acciones específicas de la API dentro de las cuentas miembro. Por ejemplo, una SCP puede ser creada para denegar las acciones de IAM si no se ha proporcionado una autenticación MFA válida.</p>


<figure class="table"><table>
<thead>
<tr>
<th>Acción</th>
<th>Descripción</th>
</tr>
</thead>
<tbody>
<tr>
<td>Denegar acciones de IAM</td>
<td>Si no se ha proporcionado una autenticación MFA válida</td>
</tr>
<tr>
<td>Permitir acciones de IAM</td>
<td>Si se ha proporcionado una autenticación MFA válida</td>
</tr>
</tbody>
</table></figure>


<h3 id="prevenir-cambios-no-autorizados-en-la-configuraci%C3%B3n-de-las-cuentas-y-los-recursos" tabindex="-1">Prevenir cambios no autorizados en la configuración de las cuentas y los recursos</h3>


<p>Las SCPs también pueden ser utilizadas para prevenir cambios no autorizados en la configuración de las cuentas y los recursos por parte de los principales de IAM. Por ejemplo, una SCP puede ser creada para denegar las acciones de IAM que intentan modificar la configuración de la cuenta o los recursos sin la autorización adecuada.</p>


<figure class="table"><table>
<thead>
<tr>
<th>Acción</th>
<th>Descripción</th>
</tr>
</thead>
<tbody>
<tr>
<td>Denegar cambios en la configuración</td>
<td>Sin la autorización adecuada</td>
</tr>
<tr>
<td>Permitir cambios en la configuración</td>
<td>Con la autorización adecuada</td>
</tr>
</tbody>
</table></figure>


<p>En resumen, las SCPs ofrecen varias formas de mejorar la seguridad y el cumplimiento dentro de las organizaciones de AWS. Al utilizar SCPs para restringir las acciones de las cuentas basadas en la región, exigir la autenticación MFA y prevenir cambios no autorizados en la configuración de las cuentas y los recursos, las organizaciones pueden garantizar un entorno más seguro y cumplir con los requisitos de seguridad y cumplimiento.</p>


<h2 id="conclusi%C3%B3n%3A-uso-de-scps-para-la-gobernanza" tabindex="-1">Conclusión: Uso de SCPs para la Gobernanza</h2>


<p>Las políticas de control de servicios (SCPs) son una herramienta fundamental para garantizar la seguridad y el cumplimiento dentro de las organizaciones de AWS. En este artículo, hemos explorado cómo crear, adjuntar y mantener SCPs efectivas para controlar el acceso a los recursos y servicios de AWS.</p>


<h3 id="resumen-de-caracter%C3%ADsticas-y-administraci%C3%B3n-de-scps" tabindex="-1">Resumen de características y administración de SCPs</h3>


<p>En resumen, las SCPs ofrecen una forma flexible de controlar el acceso a los recursos y servicios de AWS. Al crear SCPs, se pueden definir permisos específicos para las cuentas miembro, restringir las acciones de IAM y exigir la autenticación multifactor. Además, las SCPs pueden ser adjuntadas a las organizaciones unitarias (OUs) o cuentas miembro, lo que facilita la gestión de los permisos y el cumplimiento.</p>


<h3 id="mejores-pr%C3%A1cticas-para-el-uso-de-scps" tabindex="-1">Mejores prácticas para el uso de SCPs</h3>


<p>Para aprovechar al máximo las SCPs, es importante seguir las siguientes mejores prácticas:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Mejora práctica</th>
<th>Descripción</th>
</tr>
</thead>
<tbody>
<tr>
<td>Crear SCPs específicas</td>
<td>Para cada OU o cuenta miembro para garantizar una gestión de permisos precisa.</td>
</tr>
<tr>
<td>Utilizar SCPs para restringir acciones</td>
<td>De IAM y exigir la autenticación multifactor.</td>
</tr>
<tr>
<td>Probar y depurar SCPs</td>
<td>Antes de adjuntarlas a las OUs o cuentas miembro.</td>
</tr>
<tr>
<td>Revisar y actualizar regularmente</td>
<td>Las SCPs para garantizar que se ajusten a los cambios en la organización y los requisitos de seguridad.</td>
</tr>
</tbody>
</table></figure>


<p>Al seguir estas recomendaciones y utilizar las SCPs de manera efectiva, las organizaciones pueden garantizar un entorno más seguro y cumplir con los requisitos de seguridad y cumplimiento.</p>


<h2 id="preguntas-frecuentes" tabindex="-1">Preguntas frecuentes</h2>


<h3 id="%C2%BFqu%C3%A9-es-una-pol%C3%ADtica-de-control-de-servicios-(scp)-de-aws%3F" tabindex="-1">¿Qué es una política de control de servicios (SCP) de AWS?</h3>


<p>Una política de control de servicios (SCP) es un tipo de política de organización que se utiliza para administrar permisos en su organización de AWS. Las SCPs ofrecen control centralizado sobre los permisos máximos disponibles para los usuarios de IAM y los roles de IAM en su organización.</p>


<h3 id="%C2%BFc%C3%B3mo-se-crea-una-pol%C3%ADtica-de-control-de-servicios%3F" tabindex="-1">¿Cómo se crea una política de control de servicios?</h3>


<p><strong>Crear una SCP</strong></p>


<ol>
<li><strong>Crear una organización de AWS</strong>: Establezca su organización de AWS para la gestión centralizada.</li>
<li><strong>Habilitar políticas de control de servicios</strong>: Active las SCPs en la configuración de su organización.</li>
<li><strong>Crear una SCP de AWS</strong>: Defina su SCP, especificando las acciones permitidas o denegadas y los recursos.</li>
</ol>


<h3 id="%C2%BFc%C3%B3mo-se-aplica-una-scp%3F" tabindex="-1">¿Cómo se aplica una SCP?</h3>


<p><strong>Adjuntar una SCP</strong></p>


<figure class="table"><table>
<thead>
<tr>
<th><strong>Paso</strong></th>
<th><strong>Descripción</strong></th>
</tr>
</thead>
<tbody>
<tr>
<td>1</td>
<td>Inicie sesión en la consola de <a href="https://aws.amazon.com/organizations/" rel="noopener noreferrer" target="_blank">AWS Organizations</a>.</td>
</tr>
<tr>
<td>2</td>
<td>Navegue a la raíz, OU o cuenta que desea adjuntar una SCP.</td>
</tr>
<tr>
<td>3</td>
<td>En la pestaña de políticas, seleccione Adjuntar.</td>
</tr>
</tbody>
</table></figure>


<p>
<h2>Related posts</h2>
<ul>
<li><a href="https://dondeaprendoaws.com/blog/mejores-practicas-de-seguridad-en-aws/">Mejores Prácticas de Seguridad en AWS</a></li><li><a href="https://dondeaprendoaws.com/blog/aws-seguridad-servicios-esenciales/">Seguridad en AWS: Servicios Esenciales</a></li><li><a href="https://dondeaprendoaws.com/blog/aws-seguridad-fundamentos-esenciales/">AWS Seguridad: Fundamentos Esenciales</a></li><li><a href="https://dondeaprendoaws.com/blog/gestionando-multiples-cuentas-de-aws-con-aws-organizations/">Gestionando Múltiples Cuentas de AWS con AWS Organizations</a></li>
</ul>
</p>
