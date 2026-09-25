---
title: "Cómo integrar Terraform con CI/CD en AWS"
description: "Aprende a automatizar la gestión de infraestructura en AWS utilizando Terraform y CI/CD con prácticas seguras y eficientes."
publishedAt: "2025-02-10"
publishedTimestamp: "2025-02-10T00:20:47.716Z"
cover: "/assets/blog/455f2eb1c408f11b2e18115c.jpg"
coverAlt: "Thumbnail for: Cómo integrar Terraform con CI/CD en AWS"
ogImage: "/assets/blog/455f2eb1c408f11b2e18115c.jpg"
related:
  - title: "Visualiza Costos con AWS Cost and Usage Reports y QuickSight"
    url: "https://dondeaprendoaws.com/blog/visualiza-costos-con-aws-cost-and-usage-reports-y-quicksight/"
    image: "/assets/blog/bcf6fecd181e12cedeeed88a.jpg"
    imageAlt: ""
  - title: "Guía para Implementar Machine Learning con Amazon SageMaker"
    url: "https://dondeaprendoaws.com/blog/guia-para-implementar-machine-learning-con-amazon-sagemaker/"
    image: "/assets/blog/57b9e13953de77f8b6210bc2.jpg"
    imageAlt: ""
  - title: "AWS HealthScribe: IA Generativa para Diagnósticos Médicos"
    url: "https://dondeaprendoaws.com/blog/aws-healthscribe-ia-generativa-para-diagnosticos-medicos/"
    image: "/assets/blog/cac2ef4bd724a0e8247e5e35.jpg"
    imageAlt: ""
---

<p><strong>¿Quieres automatizar la gestión de infraestructura en AWS con <a href="https://www.terraform.io/" rel="noopener noreferrer" target="_blank">Terraform</a> y CI/CD? Aquí te explico cómo hacerlo paso a paso.</strong></p>


<ol>
<li><strong>Terraform y AWS</strong>: Usa Terraform para manejar <a href="https://dondeaprendoaws.com/blog/como-crear-infraestructura-como-codigo-en-aws-con-aws-cloudformation/">infraestructura como código</a> (IaC) y configúralo con servicios de AWS como CodePipeline, CodeBuild, CodeCommit, S3 y KMS.</li>
<li><strong>Pipeline CI/CD</strong>: Construye un pipeline con etapas clave: <em>Source</em>, <em>Validate/Plan</em> y <em>Apply</em>, asegurando despliegues seguros y controlados.</li>
<li><strong>Seguridad y estado</strong>: Protege el <a href="https://dev.to/aws-builders/como-gestionar-el-estado-de-terraform-en-aws-51n1" rel="noopener noreferrer" target="_blank">estado de Terraform</a> con S3, <a href="https://docs.aws.amazon.com/dynamodb/" rel="noopener noreferrer" target="_blank">DynamoDB</a> (para bloqueo) y cifrado KMS. Implementa roles IAM con permisos mínimos.</li>
<li><strong>Optimización</strong>: Mejora tiempos con caché en CodeBuild y despliegues paralelos. Monitorea errores con <a href="https://docs.aws.amazon.com/cloudwatch/" rel="noopener noreferrer" target="_blank">CloudWatch</a> y automatiza alertas con SNS.</li>
</ol>


<p><strong>Tabla rápida de herramientas:</strong></p>


<figure class="table"><table>
<thead>
<tr>
<th>Herramienta</th>
<th>Función</th>
<th>Beneficio</th>
</tr>
</thead>
<tbody>
<tr>
<td><strong>CodePipeline</strong></td>
<td>Orquestar flujos de trabajo</td>
<td>Automatización de despliegues</td>
</tr>
<tr>
<td><strong>CodeBuild</strong></td>
<td>Ejecutar comandos de Terraform</td>
<td>Entornos reproducibles</td>
</tr>
<tr>
<td><strong>CodeCommit</strong></td>
<td>Controlar versiones</td>
<td>Almacenamiento seguro</td>
</tr>
<tr>
<td><strong>S3 y KMS</strong></td>
<td>Guardar estado de Terraform</td>
<td>Cifrado y protección de datos</td>
</tr>
</tbody>
</table></figure>


<p><strong>¿Listo para empezar? Sigue leyendo para conocer los detalles técnicos y <a href="https://dondeaprendoaws.com/blog/mejores-practicas-aws-para-devops/">mejores prácticas</a>.</strong></p>


<h2 class="sb" id="requisitos-de-configuracion" tabindex="-1">Requisitos de Configuración</h2>


<h3 id="configuracion-de-la-cuenta-aws" tabindex="-1">Configuración de la Cuenta AWS</h3>


<p>Cree tres roles IAM con permisos específicos: uno para <strong>CodePipeline</strong> (orquestación), otro para <strong>CodeBuild</strong> (ejecución) y un tercero para <strong>Cross-account</strong> (despliegues multi-cuenta). Para mejorar la seguridad, implemente federación OIDC en lugar de usar credenciales estáticas <a href="https://dev.to/aws-builders/building-secure-cicd-with-terraform-on-aws-43lf" rel="noopener noreferrer" target="_blank"><sup>[4]</sup></a>. Asegúrese de que estos roles estén alineados con las políticas descritas en la sección 'Configuración de Credenciales Seguras'.</p>


<h3 id="configuracion-de-terraform" tabindex="-1">Configuración de <a href="https://www.terraform.io/" rel="noopener noreferrer" target="_blank">Terraform</a></h3>


<p><figure><img alt="Terraform" src="/assets/blog/4e3b1c8d6bf25353076fb7b4.jpg"/></figure></p>


<p>Para instalar Terraform en CodeBuild, ejecute los siguientes comandos:</p>


<pre><code class="language-bash">curl -LO https://releases.hashicorp.com/terraform/1.5.7/terraform_1.5.7_linux_amd64.zip
sudo yum install -y unzip
unzip terraform_*.zip &amp;&amp; sudo mv terraform /usr/local/bin/
</code></pre>


<p>Luego, configure el proveedor AWS en el archivo <code class="inline-code">providers.tf</code> con este código:</p>


<pre><code class="language-hcl">provider "aws" {
  region = "us-west-2"
}
</code></pre>


<h3 id="configuracion-del-repositorio-codecommit" tabindex="-1">Configuración del Repositorio CodeCommit</h3>


<p>Organice el repositorio con la siguiente estructura para facilitar el control de versiones y la gestión de entornos:</p>


<pre><code>├── environments/
│   ├── dev/
│   └── prod/
├── modules/
├── main.tf
├── variables.tf
└── outputs.tf
</code></pre>


<p>Configure el backend en S3 para almacenar el estado de Terraform, utilizando DynamoDB para el bloqueo. Aquí tienes un ejemplo del archivo de configuración:</p>


<pre><code class="language-hcl">terraform {
  backend "s3" {
    bucket         = "tf-state-2025"
    key            = "global/s3/terraform.tfstate"
    region         = "us-west-2"
    dynamodb_table = "tf-state-locking"
    encrypt        = true
  }
}
</code></pre>


<h2 class="sb" id="arquitectura-del-pipeline" tabindex="-1">Arquitectura del Pipeline</h2>


<p>El pipeline CI/CD para Terraform en AWS está diseñado con etapas clave que aseguran despliegues seguros y controlados de infraestructura como código.</p>


<h3 id="etapas-del-pipeline" tabindex="-1">Etapas del Pipeline</h3>


<p>Este pipeline sigue una estructura clara, donde cada etapa se alinea con los directorios de entorno definidos en el repositorio (por ejemplo, <em>dev</em> y <em>prod</em>). Se utiliza CodePipeline y CodeBuild para implementar estas etapas, como se detalla a continuación.</p>


<figure class="table"><table>
<thead>
<tr>
<th><strong>Etapa</strong></th>
<th><strong>Función</strong></th>
<th><strong>Acciones Clave</strong></th>
</tr>
</thead>
<tbody>
<tr>
<td>Source</td>
<td>Control de código</td>
<td>Gestión y versionado del código</td>
</tr>
<tr>
<td>Validate/Plan</td>
<td>Verificación</td>
<td>Valida la sintaxis HCL y genera un plan de ejecución para revisión</td>
</tr>
<tr>
<td>Apply</td>
<td>Implementación</td>
<td>Aplica los cambios según el entorno especificado en el directorio <em>environments/</em></td>
</tr>
</tbody>
</table></figure>


<h3 id="control-de-acceso" tabindex="-1">Control de Acceso</h3>


<p>El control de acceso se gestiona a través de roles específicos que complementan los tres roles IAM definidos en la <a href="https://dondeaprendoaws.com/blog/configurar-aws-para-comunicacion-en-equipo-7-pasos/">configuración de la cuenta AWS</a>.</p>


<p>1. <strong>Rol de Servicio CodePipeline</strong></p>


<p>Este rol requiere permisos para:</p>


<ul>
<li>Acceder a repositorios en CodeCommit para obtener el código.</li>
<li>Interactuar con buckets S3 para manejar artefactos.</li>
<li>Ejecutar proyectos en CodeBuild.</li>
</ul>


<p>2. <strong><a href="https://dondeaprendoaws.com/blog/como-crear-infraestructura-como-codigo-en-aws-con-terraform/">Rol de Ejecución Terraform</a></strong></p>


<p>Este rol incluye políticas IAM que restringen:</p>


<ul>
<li>Aprovisionamiento de recursos específicos según las necesidades del entorno.</li>
<li>Acceso a <a href="https://docs.aws.amazon.com/systems-manager/latest/userguide/systems-manager-parameter-store.html" rel="noopener noreferrer" target="_blank">Parameter Store</a> para manejar variables sensibles.</li>
<li>Gestión segura de los archivos de estado en S3.</li>
</ul>


<h3 id="gestion-de-archivos-de-estado" tabindex="-1">Gestión de Archivos de Estado</h3>


<p>La configuración del estado de Terraform en S3 debe ser sólida para evitar problemas. Se recomienda:</p>


<ul>
<li>Usar bloqueo automático mediante DynamoDB para evitar conflictos.</li>
<li>Habilitar el versionado y <a href="https://dondeaprendoaws.com/blog/cifrado-de-datos-con-aws-kms-guia-practica/">cifrado con KMS</a>, siguiendo las configuraciones del backend.</li>
</ul>


<h2 class="sb" id="construccion-del-pipeline" tabindex="-1">Construcción del Pipeline</h2>


<p>Crear un pipeline CI/CD para Terraform en <a href="https://docs.aws.amazon.com/codepipeline/latest/userguide/welcome.html" rel="noopener noreferrer" target="_blank">AWS CodePipeline</a> y CodeBuild requiere una configuración detallada de varios componentes.</p>


<h3 id="especificaciones-de-build" tabindex="-1">Especificaciones de Build</h3>


<p>El primer paso es crear archivos buildspec específicos para cada etapa del pipeline. Estos archivos contienen las instrucciones que CodeBuild ejecutará.</p>


<p>Por ejemplo, el archivo para la validación podría verse así:</p>


<pre><code class="language-yaml"># buildspec_validate.yml
phases:
  install:
    commands:
      - curl -LO https://releases.hashicorp.com/terraform/1.5.7/terraform_1.5.7_linux_amd64.zip
      - sudo yum install -y unzip
      - unzip terraform_*.zip &amp;&amp; sudo mv terraform /usr/local/bin/
  build:
    commands:
      - terraform init
      - terraform validate
      - tflint
  post_build:
    commands:
      - checkov -d . --soft-fail
artifacts:
  files:
    - '**/*'
</code></pre>


<h3 id="configuracion-de-etapas-del-pipeline" tabindex="-1">Configuración de Etapas del Pipeline</h3>


<p>El pipeline en AWS CodePipeline se organiza en etapas, cada una con una función específica. Aquí tienes un ejemplo de configuración:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Etapa</th>
<th>Función</th>
<th>Buildspec</th>
</tr>
</thead>
<tbody>
<tr>
<td>Source</td>
<td>Obtención del código</td>
<td>N/A</td>
</tr>
<tr>
<td>Validate/Plan</td>
<td>Validación y planificación</td>
<td>buildspec_validate.yml</td>
</tr>
<tr>
<td>Apply</td>
<td>Ejecución de cambios</td>
<td>buildspec_apply.yml</td>
</tr>
</tbody>
</table></figure>


<p>Es importante asignar permisos adecuados a través de roles IAM, siguiendo el principio de mínimo privilegio. Por ejemplo, para acceder a un bucket S3 que almacena el estado de Terraform:</p>


<pre><code class="language-json">{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:ListBucket"],
      "Resource": "arn:aws:s3:::tfstate-bucket/*"
    }
  ]
}
</code></pre>


<h3 id="gestion-de-errores" tabindex="-1">Gestión de Errores</h3>


<p>Para garantizar que el pipeline funcione de manera estable, se deben implementar varias prácticas de manejo de errores:</p>


<ul>
<li><strong>Monitoreo detallado</strong>: Usa filtros métricos en CloudWatch para identificar fallos en las etapas del pipeline.</li>
<li><strong>Notificaciones automáticas</strong>: Configura Amazon SNS para enviar alertas cuando ocurra un error.</li>
</ul>


<p>Ejemplo de comando para registrar un fallo:</p>


<pre><code class="language-bash">aws codepipeline put-job-failure-result --error-message "Validación fallida" --failure-details type=JobFailed
</code></pre>


<ul>
<li><strong>Rollback automático</strong>: Implementa funciones Lambda que detecten errores durante la etapa de Apply y reviertan los cambios automáticamente si es necesario.</li>
</ul>


<p>Si necesitas más información sobre cómo configurar roles IAM de manera segura, puedes explorar recursos en español en <a href="https://dondeaprendoaws.com">Dónde Aprendo AWS</a>.</p>




<h2 class="sb" id="seguridad-y-rendimiento" tabindex="-1">Seguridad y Rendimiento</h2>


<p>Mantener la seguridad y el rendimiento del pipeline implica gestionar credenciales, aplicar políticas y optimizar la ejecución. Esto se logra ajustando y ampliando las configuraciones existentes.</p>


<h3 id="gestion-segura-de-credenciales" tabindex="-1">Gestión Segura de Credenciales</h3>


<p>Para reforzar la seguridad, se usan herramientas como <strong>Parameter Store</strong>, que permite almacenar secretos y variables de configuración de forma segura. Además, la integración con los servicios de AWS asegura que las credenciales se gestionen de manera centralizada y protegida, complementando los roles IAM previamente definidos.</p>


<h3 id="aplicacion-de-politicas" tabindex="-1">Aplicación de Políticas</h3>


<p>Las políticas, junto con herramientas como OPA, permiten establecer reglas específicas para la infraestructura, similares al monitoreo realizado en <strong>CloudWatch</strong>. Estas políticas ayudan a mantener el control sobre diferentes aspectos clave.</p>


<figure class="table"><table>
<thead>
<tr>
<th>Tipo de Política</th>
<th>Ejemplo de Regla</th>
<th>Propósito</th>
</tr>
</thead>
<tbody>
<tr>
<td>Seguridad</td>
<td>Requiere cifrado en buckets S3</td>
<td>Protección de datos</td>
</tr>
<tr>
<td>Costos</td>
<td>Limita los tipos de instancias EC2</td>
<td>Control de gastos</td>
</tr>
<tr>
<td>Cumplimiento</td>
<td>Exige etiquetado específico</td>
<td>Organización y gestión</td>
</tr>
</tbody>
</table></figure>


<h3 id="optimizacion-del-rendimiento" tabindex="-1">Optimización del Rendimiento</h3>


<p>El uso de caché en los archivos <strong>buildspec</strong> puede ser llevado más allá al integrar almacenamiento de proveedores. Esto permite acelerar procesos como el inicializado de Terraform.</p>


<blockquote>
<p>"La implementación de caché de proveedores en CodeBuild puede reducir el tiempo de terraform init entre un 60-70% en la mayoría de los casos" <a href="https://www.chrisfarris.com/post/tf-codepipeline/" rel="noopener noreferrer" target="_blank"><sup>[1]</sup></a>.</p>
</blockquote>


<p>Otra estrategia es dividir la infraestructura en módulos para realizar despliegues paralelos, mejorando así la velocidad general. Además, configurar métricas en <strong>CloudWatch</strong> sobre duración de etapas, errores de concurrencia y actividad IAM inusual te ayudará a monitorear y resolver problemas de manera ágil, manteniendo un pipeline eficiente y seguro.</p>


<h2 class="sb" id="proximos-pasos" tabindex="-1">Próximos Pasos</h2>


<h3 id="resumen" tabindex="-1">Resumen</h3>


<p>Según los datos, el 68% de los fallos en pipelines provienen de desajustes en el manejo de estado <a href="https://www.cloudoptimo.com/blog/terraform-for-aws-in-practice-part-3-ci-cd-security-and-scaling-strategies/" rel="noopener noreferrer" target="_blank"><sup>[5]</sup></a>. Las prácticas mencionadas aquí complementan las estrategias de manejo de errores discutidas anteriormente y deben integrarse con los componentes ya existentes.</p>


<p>Para mantener un pipeline confiable, es clave implementar un calendario de mantenimiento que abarque el backend S3 configurado y los roles IAM definidos:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Frecuencia</th>
<th>Actividad clave</th>
</tr>
</thead>
<tbody>
<tr>
<td>Semanal</td>
<td>Revisión del estado</td>
</tr>
<tr>
<td>Mensual</td>
<td>Auditoría de accesos</td>
</tr>
<tr>
<td>Trimestral</td>
<td>Actualización de políticas</td>
</tr>
</tbody>
</table></figure>


<h3 id="recursos-adicionales" tabindex="-1">Recursos Adicionales</h3>


<p>Si buscas aprender más sobre la automatización de infraestructura con AWS, <strong>Dónde Aprendo AWS</strong> ofrece materiales en español enfocados en integraciones de Terraform y CI/CD. Puedes acceder a ellos aquí: <a href="https://dondeaprendoaws.com/modulos-terraform">https://dondeaprendoaws.com/modulos-terraform</a>. Estos recursos complementan la <a href="https://dondeaprendoaws.com/blog/aws-fundamentos-guia-de-inicio-rapido/">documentación oficial de AWS</a> con ejemplos prácticos diseñados para usuarios hispanohablantes.</p>


<p>Además, la comunidad hispanohablante cuenta con varias herramientas útiles:</p>


<ul>
<li><a href="https://dondeaprendoaws.com/blog/grupos-de-estudio-aws-en-reddit-2024/">Grupos de usuarios AWS</a> con foros técnicos especializados.</li>
<li>Documentación traducida al español.</li>
<li>Repositorios con patrones adaptados a contextos locales.</li>
</ul>


<p>Para mejorar continuamente, considera integrar las <a href="https://dondeaprendoaws.com/blog/10-metricas-clave-de-devops-en-aws/">métricas de CloudWatch</a> configuradas con <a href="https://dondeaprendoaws.com/blog/automatizar-alertas-de-costos-aws-en-5-pasos/">alertas automatizadas</a>. Esto facilitará el monitoreo y la respuesta ante posibles problemas.</p>


<h2 class="sb" id="preguntas-frecuentes" tabindex="-1">Preguntas Frecuentes</h2>


<h3 id="que-es-el-manejo-de-estado-en-terraform" tabindex="-1">¿Qué es el manejo de estado en Terraform?</h3>


<p>El manejo de estado en Terraform es clave para rastrear y gestionar los recursos creados en AWS. Este registro se almacena en S3, con bloqueo a través de DynamoDB y cifrado mediante KMS. Para más detalles, revisa la sección <strong>Gestión de Archivos de Estado</strong>.</p>


<h3 id="como-se-implementan-los-controles-de-seguridad" tabindex="-1">¿Cómo se implementan los controles de seguridad?</h3>


<p>La federación OIDC para credenciales temporales ha logrado reducir un 85% los incidentes de seguridad relacionados con credenciales expuestas <a href="https://dev.to/aws-builders/building-secure-cicd-with-terraform-on-aws-43lf" rel="noopener noreferrer" target="_blank"><sup>[4]</sup></a>. Según lo explicado en <strong>Configuración de Credenciales Seguras</strong>, los roles IAM deben configurarse con políticas de mínimo privilegio y los archivos de estado deben estar protegidos con cifrado KMS.</p>


<h3 id="cuales-son-las-mejores-practicas-para-pruebas" tabindex="-1">¿Cuáles son las mejores prácticas para pruebas?</h3>


<p>Las <a href="https://www.andmore.dev/es/blog/getting-started-portman/" rel="noopener noreferrer" target="_blank">pruebas automatizadas</a> son fundamentales para garantizar la calidad del código de infraestructura. Esto incluye validación HCL, análisis con <a href="https://www.checkov.io/" rel="noopener noreferrer" target="_blank">Checkov</a> y estimación de costos usando herramientas como <a href="https://www.infracost.io/" rel="noopener noreferrer" target="_blank">Infracost</a> dentro del buildspec.</p>


<h3 id="como-optimizar-el-rendimiento-del-pipeline" tabindex="-1">¿Cómo optimizar el rendimiento del pipeline?</h3>


<p>Para mejorar el rendimiento, es importante reducir los tiempos de ejecución. Las técnicas descritas en <strong>Optimización del Rendimiento</strong> incluyen despliegues incrementales y un uso eficiente de la caché.</p>


<h3 id="que-metricas-deben-monitorearse" tabindex="-1">¿Qué métricas deben monitorearse?</h3>


<p>Un monitoreo efectivo implica rastrear indicadores clave como tiempos de ejecución, tasas de éxito y latencia en el aprovisionamiento de recursos <a href="https://www.tecracer.com/blog/2023/05/build-terraform-ci/cd-pipelines-using-aws-codepipeline.html" rel="noopener noreferrer" target="_blank"><sup>[2]</sup></a><a href="https://docs.aws.amazon.com/prescriptive-guidance/latest/devops-pipeline-accelerator/using-codepipeline.html" rel="noopener noreferrer" target="_blank"><sup>[3]</sup></a>. Estas métricas complementan las estrategias de monitoreo mencionadas en secciones anteriores.</p>


<h2>Publicaciones de blog relacionadas</h2>
<ul><li><a href="https://dondeaprendoaws.com/blog/mejores-practicas-aws-para-devops/">Mejores prácticas AWS para DevOps</a></li><li><a href="https://dondeaprendoaws.com/blog/como-crear-infraestructura-como-codigo-en-aws-con-terraform/">Cómo crear Infraestructura como Código en AWS con Terraform</a></li><li><a href="https://dondeaprendoaws.com/blog/como-crear-infraestructura-como-codigo-en-aws-con-aws-cloudformation/">Cómo crear Infraestructura como Código en AWS con AWS CloudFormation</a></li><li><a href="https://dondeaprendoaws.com/blog/9-mejores-practicas-de-seguridad-para-iac-en-aws/">9 Mejores Prácticas de Seguridad para IaC en AWS</a></li></ul>
