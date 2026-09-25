---
title: "Pipeline CI/CD con Terraform y AWS CodePipeline"
description: "Automatiza tus despliegues en AWS con un pipeline CI/CD usando Terraform y CodePipeline, optimizando seguridad, escalabilidad y eficiencia."
publishedAt: "2025-02-13"
publishedTimestamp: "2025-02-13T00:13:18.43Z"
cover: "/assets/blog/8c8805d819a48bf8b59f25eb.jpg"
coverAlt: "Thumbnail for: Pipeline CI/CD con Terraform y AWS CodePipeline"
ogImage: "/assets/blog/8c8805d819a48bf8b59f25eb.jpg"
related:
  - title: "10 Preguntas Frecuentes sobre Machine Learning en AWS"
    url: "https://dondeaprendoaws.com/blog/10-preguntas-frecuentes-sobre-machine-learning-en-aws/"
    image: "/assets/blog/5152d1b598aa9df8aaa8e72c.jpg"
    imageAlt: ""
  - title: "Grupos de Estudio AWS en Reddit 2024"
    url: "https://dondeaprendoaws.com/blog/grupos-de-estudio-aws-en-reddit-2024/"
    image: "/assets/blog/5aabd355c99039c456c8249b.jpg"
    imageAlt: ""
  - title: "Comprendiendo Kubernetes y Amazon EKS"
    url: "https://dondeaprendoaws.com/blog/comprendiendo-kubernetes-y-amazon-eks/"
    image: "/assets/blog/066e0f22ea88769f71d0c039.png"
    imageAlt: ""
---

<p><strong>¿Quieres automatizar tus despliegues en AWS de forma eficiente y segura?</strong> Configurar un pipeline CI/CD con <a href="https://www.terraform.io/" rel="noopener noreferrer" target="_blank">Terraform</a> y <a href="https://docs.aws.amazon.com/codepipeline/latest/userguide/welcome.html" rel="noopener noreferrer" target="_blank">AWS CodePipeline</a> es la solución. Este enfoque combina <a href="https://dondeaprendoaws.com/blog/como-crear-infraestructura-como-codigo-en-aws-con-aws-cloudformation/">infraestructura como código</a> y servicios administrados para acelerar el desarrollo.</p>


<h3 id="resumen-rapido" tabindex="-1">Resumen rápido:</h3>


<ul>
<li><strong>Herramientas necesarias</strong>: AWS CLI (≥2.0), Terraform (≥1.0.0), Git (2.x).</li>
<li><strong>Componentes clave</strong>:
<ul>
<li><strong>Terraform</strong>: Gestiona la infraestructura.</li>
<li><strong>AWS CodePipeline</strong>: Orquesta el flujo de despliegue.</li>
<li><strong><a href="https://docs.aws.amazon.com/codebuild/latest/userguide/welcome.html" rel="noopener noreferrer" target="_blank">AWS CodeBuild</a></strong>: Valida y aplica cambios de Terraform.</li>
</ul>
</li>
<li><strong>Etapas del pipeline</strong>:
<ol>
<li><strong>Origen</strong>: Detecta cambios en el repositorio.</li>
<li><strong>Validación</strong>: Ejecuta <code class="inline-code">terraform validate</code> y <code class="inline-code">terraform fmt</code>.</li>
<li><strong>Planificación</strong>: Genera un plan con <code class="inline-code">terraform plan</code>.</li>
<li><strong>Aprobación</strong>: Paso manual para entornos críticos.</li>
<li><strong>Aplicación</strong>: Implementa cambios con <code class="inline-code">terraform apply</code>.</li>
</ol>
</li>
</ul>


<h3 id="beneficios" tabindex="-1">Beneficios:</h3>


<ul>
<li><strong>Automatización</strong>: Menos errores y despliegues más rápidos.</li>
<li><strong>Seguridad</strong>: Uso de KMS, IAM, y MFA.</li>
<li><strong>Escalabilidad</strong>: Modularidad y soporte multi-cuenta.</li>
</ul>


<p>Con esta guía, aprenderás a configurar y optimizar un pipeline CI/CD paso a paso, integrando validaciones, seguridad y <a href="https://www.andmore.dev/es/blog/getting-started-portman/" rel="noopener noreferrer" target="_blank">pruebas automatizadas</a>. ¡Comienza a transformar tus procesos de despliegue hoy!</p>


<h2 class="sb" id="configuracion-del-entorno" tabindex="-1">Configuración del Entorno</h2>


<p>Prepara tu entorno con las herramientas y configuraciones necesarias para garantizar un flujo de trabajo eficiente.</p>


<h3 id="herramientas-y-accesos-requeridos" tabindex="-1">Herramientas y Accesos Requeridos</h3>


<p>Asegúrate de contar con las siguientes herramientas instaladas:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Herramienta</th>
<th>Versión</th>
</tr>
</thead>
<tbody>
<tr>
<td>AWS CLI</td>
<td>≥2.0</td>
</tr>
<tr>
<td>Terraform</td>
<td>≥1.0.0</td>
</tr>
<tr>
<td>Git</td>
<td>2.x</td>
</tr>
</tbody>
</table></figure>


<p>Si usas <a href="https://docs.aws.amazon.com/cloudshell/latest/userguide/welcome.html" rel="noopener noreferrer" target="_blank">AWS CloudShell</a>, estas herramientas ya vienen preinstaladas.</p>


<p>Además, necesitarás acceso a un repositorio en <strong><a href="https://docs.aws.amazon.com/codecommit/" rel="noopener noreferrer" target="_blank">AWS CodeCommit</a></strong> o <strong>GitHub</strong>. Una vez que tengas todo listo, el siguiente paso será configurar los permisos IAM.</p>


<h3 id="configuracion-de-roles-iam" tabindex="-1">Configuración de Roles IAM</h3>


<p>Para cumplir con las <a href="https://dondeaprendoaws.com/blog/aws-seguridad-mejores-practicas/">prácticas de seguridad recomendadas</a>, deberás crear un rol IAM específico para CodePipeline:</p>


<ul>
<li><strong>Paso 1:</strong> Crea un rol IAM para CodePipeline.</li>
<li><strong>Paso 2:</strong> Adjunta las políticas necesarias: <code class="inline-code">AWSCodePipelineFullAccess</code> y <code class="inline-code">AWSCodeBuildAdminAccess</code>.</li>
<li><strong>Paso 3:</strong> Agrega una política personalizada para gestionar el acceso a S3 y KMS:</li>
</ul>


<pre><code class="language-hcl">data "aws_iam_policy_document" "pipeline_policy" {
  statement {
    effect = "Allow"
    actions = [
      "s3:GetObject",
      "s3:GetObjectVersion",
      "s3:PutObject"
    ]
    resources = ["${aws_s3_bucket.artifacts.arn}/*"]
  }

  statement {
    effect = "Allow"
    actions = [
      "kms:Decrypt",
      "kms:GenerateDataKey"
    ]
    resources = [aws_kms_key.pipeline_key.arn]
  }
}
</code></pre>


<p>No olvides habilitar la <strong>autenticación multifactor (MFA)</strong> para añadir una capa adicional de seguridad <a href="https://aws.plainenglish.io/how-to-set-up-aws-codepipeline-using-terraform-code-4a732364212" rel="noopener noreferrer" target="_blank"><sup>[1]</sup></a>.</p>


<h3 id="configuracion-de-terraform" tabindex="-1">Configuración de <a href="https://www.terraform.io/" rel="noopener noreferrer" target="_blank">Terraform</a></h3>


<p><figure><img alt="Terraform" src="/assets/blog/4e3b1c8d6bf25353076fb7b4.jpg"/></figure></p>


<p>Terraform será clave para gestionar la infraestructura. A continuación, te mostramos cómo configurarlo:</p>


<ol>
<li><strong>Estructura del Proyecto</strong></li>
</ol>


<p>Organiza los archivos de tu proyecto de la siguiente manera:</p>


<pre><code>terraform-pipeline/
├── main.tf
├── variables.tf
├── outputs.tf
└── backend.tf
</code></pre>


<ol start="2">
<li><strong>Backend de Terraform</strong></li>
</ol>


<p>Configura el backend para almacenar el <a href="https://dev.to/aws-builders/como-gestionar-el-estado-de-terraform-en-aws-51n1" rel="noopener noreferrer" target="_blank">estado de Terraform</a> en S3:</p>


<pre><code class="language-hcl">terraform {
  backend "s3" {
    bucket = "${var.project_name}-terraform-state"
    key    = "pipeline/terraform.tfstate"
    region = "us-west-2"
    encrypt = true
  }
}
</code></pre>


<ol start="3">
<li><strong><a href="https://dondeaprendoaws.com/blog/aws-curso-certificado-guia-basica/">Credenciales AWS</a></strong></li>
</ol>


<p>Define las credenciales de AWS usando variables de entorno o configura AWS Single Sign-On (SSO). Para entornos de producción, es recomendable usar roles IAM con credenciales temporales para mayor seguridad <a href="https://aws.plainenglish.io/how-to-set-up-aws-codepipeline-using-terraform-code-4a732364212" rel="noopener noreferrer" target="_blank"><sup>[1]</sup></a>.</p>


<h2 class="sb" id="arquitectura-del-pipeline" tabindex="-1">Arquitectura del Pipeline</h2>


<p>Después de configurar el entorno, diseñamos una arquitectura que combina servicios de AWS con <a href="https://dondeaprendoaws.com/blog/como-crear-infraestructura-como-codigo-en-aws-con-terraform/">flujos de trabajo de Terraform</a>.</p>


<h3 id="componentes-principales" tabindex="-1">Componentes Principales</h3>


<p>La arquitectura se basa en servicios de AWS que trabajan en conjunto con Terraform:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Componente</th>
<th>Función Principal</th>
<th>Relación con Terraform</th>
</tr>
</thead>
<tbody>
<tr>
<td><strong>AWS CodePipeline</strong></td>
<td>Orquestador del pipeline</td>
<td>Coordina la ejecución de comandos de Terraform</td>
</tr>
<tr>
<td><strong>AWS CodeCommit</strong></td>
<td>Repositorio de código</td>
<td>Almacena y versiona archivos <code class="inline-code">.tf</code></td>
</tr>
<tr>
<td><strong>AWS CodeBuild</strong></td>
<td>Motor de ejecución de builds</td>
<td>Ejecuta <code class="inline-code">terraform validate</code>, <code class="inline-code">plan</code> y <code class="inline-code">apply</code></td>
</tr>
</tbody>
</table></figure>


<h3 id="etapas-del-pipeline" tabindex="-1">Etapas del Pipeline</h3>


<p>El pipeline está organizado en pasos secuenciales que aseguran calidad y control en los despliegues:</p>


<ul>
<li><strong>Origen</strong>: El pipeline se activa automáticamente cuando hay cambios en la rama principal del repositorio.</li>
<li><strong>Validación</strong>: En esta etapa, CodeBuild ejecuta:
<ul>
<li><code class="inline-code">terraform validate</code></li>
<li><code class="inline-code">terraform fmt -check</code></li>
</ul>
</li>
<li><strong>Planificación</strong>: Genera un plan de ejecución utilizando <code class="inline-code">terraform plan</code>.</li>
<li><strong>Aprobación</strong>: Paso crucial para entornos de producción, que requiere una aprobación manual antes de proceder.</li>
<li><strong>Aplicación</strong>: Aplica los cambios con el comando <code class="inline-code">terraform apply --auto-approve</code>.</li>
</ul>


<p>Esta estructura establece los fundamentos necesarios para la implementación detallada que se desarrollará en la próxima sección.</p>


<h2 class="sb" id="construccion-del-pipeline" tabindex="-1">Construcción del Pipeline</h2>


<p>Después de definir la arquitectura, el siguiente paso es implementar el pipeline utilizando recursos de Terraform.</p>


<h3 id="despliegue-de-recursos" tabindex="-1">Despliegue de Recursos</h3>


<p>El recurso principal del pipeline, CodePipeline, se configura con Terraform de la siguiente manera:</p>


<pre><code class="language-terraform">resource "aws_codepipeline" "pipeline" {
  name     = "terraform-pipeline"
  role_arn = aws_iam_role.codepipeline_role.arn

  artifact_store {
    location = aws_s3_bucket.artifact_store.bucket
    type     = "S3"

    encryption_key {
      id   = aws_kms_key.artifact_key.arn
      type = "KMS"
    }
  }
}
</code></pre>


<p>Este recurso se complementa con las etapas detalladas en la arquitectura previamente definida.</p>


<h3 id="configuracion-de-etapas" tabindex="-1">Configuración de Etapas</h3>


<p>Cada etapa del pipeline utiliza un archivo <em>buildspec</em> para definir los comandos necesarios. Aquí tienes un ejemplo:</p>


<pre><code class="language-yaml">version: 0.2

phases:
  pre_build:
    commands:
      - wget https://releases.hashicorp.com/terraform/1.0.0/terraform_1.0.0_linux_amd64.zip
      - unzip terraform_1.0.0_linux_amd64.zip
      - mv terraform /usr/local/bin/
  build:
    commands:
      - terraform init
      - terraform validate
</code></pre>


<p>Este archivo asegura que las herramientas necesarias estén disponibles antes de ejecutar las validaciones y otros procesos de construcción.</p>


<h3 id="implementacion-de-seguridad" tabindex="-1">Implementación de Seguridad</h3>


<p>La seguridad del pipeline se gestiona mediante encriptación con KMS y políticas IAM específicas. Aquí tienes un ejemplo de configuración:</p>


<pre><code class="language-terraform">resource "aws_kms_key" "artifact_key" {
  description             = "Clave KMS para artefactos del pipeline"
  deletion_window_in_days = 10
  enable_key_rotation     = true
}

resource "aws_iam_role_policy" "codepipeline_kms_policy" {
  role = aws_iam_role.codepipeline_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "kms:Decrypt",
          "kms:DescribeKey",
          "kms:Encrypt",
          "kms:ReEncrypt*",
          "kms:GenerateDataKey*"
        ]
        Resource = aws_kms_key.artifact_key.arn
      }
    ]
  })
}
</code></pre>


<p>Estas configuraciones refuerzan el principio de privilegios mínimos, asegurando que el pipeline solo tenga acceso a los recursos necesarios para su operación. Además, la rotación automática de claves KMS agrega una capa adicional de seguridad.</p>




<h2 class="sb" id="pruebas-del-pipeline" tabindex="-1">Pruebas del Pipeline</h2>


<p>Después de configurar la infraestructura del pipeline, realizamos pruebas automatizadas en tres niveles para asegurar su correcto funcionamiento.</p>


<h3 id="validacion-de-codigo" tabindex="-1">Validación de Código</h3>


<p>Usamos herramientas como <strong><a href="https://github.com/terraform-linters/tflint" rel="noopener noreferrer" target="_blank">TFLint</a></strong> (para análisis de Terraform) y <strong><a href="https://www.checkov.io/" rel="noopener noreferrer" target="_blank">Checkov</a></strong> (para seguridad). Aquí tienes un ejemplo de configuración en YAML:</p>


<pre><code class="language-yaml">version: 0.2
phases:
  install:
    commands:
      - curl -s https://raw.githubusercontent.com/terraform-linters/tflint/master/install_linux.sh | bash
      - pip install checkov
  build:
    commands:
      - tflint --format=compact
      - checkov -d . --framework terraform --output cli
</code></pre>


<p>Además, personalizamos reglas específicas en el archivo <code class="inline-code">.tflint.hcl</code> para ajustar las validaciones a nuestras necesidades:</p>


<pre><code class="language-hcl">plugin "aws" {
  enabled = true
  version = "0.21.1"
  source  = "github.com/terraform-linters/tflint-ruleset-aws"
}

rule "aws_instance_invalid_type" {
  enabled = true
}
</code></pre>


<h3 id="verificacion-del-despliegue" tabindex="-1">Verificación del Despliegue</h3>


<p>Para validar la infraestructura implementada, integramos pruebas que abarcan tres áreas clave:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Nivel de Prueba</th>
<th>Herramienta</th>
<th>Propósito</th>
</tr>
</thead>
<tbody>
<tr>
<td>Infraestructura</td>
<td><a href="https://docs.aws.amazon.com/config/" rel="noopener noreferrer" target="_blank">AWS Config</a> Rules</td>
<td>Revisión de conformidad y configuración</td>
</tr>
<tr>
<td>Funcional</td>
<td>Scripts de prueba</td>
<td>Validación de operaciones básicas</td>
</tr>
<tr>
<td>Monitoreo</td>
<td>CloudWatch Alarms</td>
<td>Seguimiento de métricas importantes</td>
</tr>
</tbody>
</table></figure>


<p>En el pipeline, incluimos scripts que automatizan esta verificación:</p>


<pre><code class="language-yaml">post_build: # Verificación automatizada
  commands:
    - python scripts/verify_infrastructure.py
    - aws cloudwatch put-metric-alarm --alarm-name PipelineHealth --metric-name DeploymentStatus --namespace AWS/CodePipeline --statistic Average --period 300 --threshold 1 --comparison-operator GreaterThanThreshold
</code></pre>


<p>Si ocurre un fallo durante el despliegue, ejecutamos un rollback automático:</p>


<pre><code class="language-yaml">on_failure:
  commands:
    - terraform destroy -auto-approve -var-file="rollback.tfvars"
    - aws sns publish --topic-arn ${SNS_TOPIC} --message "Despliegue fallido - Rollback ejecutado"
</code></pre>


<p>Este enfoque combina validaciones de código y pruebas de despliegue, garantizando que cada implementación cumpla con los estándares de calidad y seguridad necesarios. Esto reduce el riesgo de problemas en producción y refuerza el control de calidad en el pipeline CI/CD.</p>


<h2 class="sb" id="configuracion-avanzada" tabindex="-1">Configuración Avanzada</h2>


<p>En proyectos que necesitan operar en múltiples entornos, es clave implementar ajustes específicos para garantizar escalabilidad y seguridad.</p>


<h3 id="configuracion-multi-cuenta" tabindex="-1">Configuración Multi-Cuenta</h3>


<p>Gestionar múltiples cuentas en AWS requiere una arquitectura bien definida. Un elemento esencial es un bucket S3 compartido para almacenar el estado de Terraform de manera centralizada.</p>


<p>Para manejar despliegues entre cuentas, se utilizan roles IAM diseñados bajo el principio de privilegios mínimos:</p>


<ul>
<li><strong>Cuenta de Desarrollo</strong>: Rol <code class="inline-code">TerraformDev</code> (para despliegues en el entorno de desarrollo).</li>
<li><strong>Cuenta de Pruebas</strong>: Rol <code class="inline-code">TerraformTest</code> (para validaciones en staging).</li>
<li><strong>Cuenta de Producción</strong>: Rol <code class="inline-code">TerraformProd</code> (para implementaciones en producción).</li>
</ul>


<p>La configuración del proveedor AWS para cada cuenta se define de esta manera:</p>


<pre><code class="language-hcl">provider "aws" {
  region = "us-west-2"
  assume_role {
    role_arn = "arn:aws:iam::TARGET_ACCOUNT_ID:role/RolDespliegue"
  }
}
</code></pre>


<h3 id="desarrollo-de-modulos" tabindex="-1">Desarrollo de Módulos</h3>


<p>Los módulos reutilizables son clave para mantener el código organizado y fácil de gestionar. Aquí hay un ejemplo de cómo estructurar módulos para componentes comunes en un pipeline:</p>


<pre><code class="language-hcl">module "source_pipeline" {
  source = "./modules/pipeline_source"
  repository_name = var.repo_name
  branch_name = var.branch_name
}

module "build_project" {
  source = "./modules/build"
  project_name = var.project_name
  build_spec = var.build_spec
}
</code></pre>


<p>Para manejar secretos y configuraciones sensibles, se utiliza AWS Secrets Manager, lo que permite centralizar el acceso a credenciales y tokens necesarios para el pipeline.</p>


<p>Además, se habilitan <a href="https://docs.aws.amazon.com/cloudtrail/" rel="noopener noreferrer" target="_blank">AWS CloudTrail</a> y AWS Config para auditoría y monitoreo centralizados. Estas herramientas complementan las políticas de cifrado con KMS y las configuraciones IAM ya implementadas, asegurando un entorno seguro y preparado para manejar la complejidad de múltiples entornos.</p>


<h2 class="sb" id="resumen" tabindex="-1">Resumen</h2>


<p>Configurar pipelines CI/CD con Terraform y AWS CodePipeline simplifica y automatiza los procesos de despliegue. Este tutorial práctico mostró cómo llevarlo a cabo de manera eficiente.</p>


<h3 id="puntos-clave" tabindex="-1">Puntos Clave</h3>


<p>Integrar Terraform con AWS CodePipeline aporta beneficios claros: automatización confiable usando IaC, mayor seguridad con herramientas como KMS e IAM, y la posibilidad de escalar fácilmente gracias a módulos reutilizables.</p>


<p><strong>Automatización y Consistencia</strong></p>


<ul>
<li>Definir infraestructura como código permite un control de versiones preciso.</li>
<li>Los <a href="https://dondeaprendoaws.com/blog/aws-opsworks-automatiza-despliegues-con-chef/">despliegues automatizados</a> agilizan el proceso, como se destacó en las etapas de validación y aplicación.</li>
</ul>


<p><strong>Seguridad y Cumplimiento</strong></p>


<ul>
<li>Artefactos cifrados con AWS KMS.</li>
<li>Supervisión centralizada mediante AWS CloudTrail y Config.</li>
</ul>


<p><strong>Escalabilidad</strong></p>


<ul>
<li>Uso de módulos reutilizables para componentes comunes.</li>
</ul>


<p>Consulta más guías prácticas en <a href="https://dondeaprendoaws.com">Dónde Aprendo AWS</a>.</p>


<p>Para mantener tu pipeline funcionando correctamente, recuerda realizar revisiones de configuración (sección 2.2), actualizar dependencias (sección 4.2) y seguir <a href="https://dondeaprendoaws.com/blog/mejores-practicas-de-seguridad-en-aws/">prácticas de seguridad</a> (sección 4.3). Si quieres implementar este flujo en tus proyectos, revisa las configuraciones detalladas en las secciones anteriores y la guía práctica del FAQ.</p>


<h2 class="sb" id="faqs" tabindex="-1">FAQs</h2>


<h3 id="como-configurar-aws-codepipeline-usando-codigo-terraform" tabindex="-1">¿Cómo configurar <a href="https://docs.aws.amazon.com/codepipeline/latest/userguide/welcome.html" rel="noopener noreferrer" target="_blank">AWS CodePipeline</a> usando código Terraform?</h3>


<p><figure><img alt="AWS CodePipeline" src="/assets/blog/7aaedc74a537945a64cbb016.jpg"/></figure></p>


<p>La configuración básica sigue los pasos descritos en las secciones anteriores. Este proceso implica coordinar tres elementos clave mencionados en la arquitectura (sección 3):</p>


<ul>
<li><strong>Repositorio de código</strong></li>
<li><strong>Proyecto de construcción</strong></li>
<li><strong>Definición del pipeline</strong></li>
</ul>


<p>El enfoque principal se divide en dos fases:</p>


<ol>
<li>
<strong>Definir los Componentes Principales</strong>
<ul>
<li>Configurar el origen del código de acuerdo con la arquitectura establecida.</li>
<li>Establecer los parámetros necesarios para la construcción.</li>
<li>Implementar políticas de seguridad según lo indicado en la sección 4.3.</li>
</ul>
</li>
<li>
<strong>Integrar el Pipeline</strong>
Aquí tienes un ejemplo de cómo se podría definir un pipeline básico usando Terraform:
<pre><code class="language-hcl">resource "aws_codepipeline" "pipeline" {
  name     = "pipeline-aplicacion"
  role_arn = aws_iam_role.rol_pipeline.arn

  artifact_store {
    location = aws_s3_bucket.artefactos.bucket
    type     = "S3"
  }

  stage {
    name = "Source"
    action {
      name             = "Source"
      category         = "Source"
      owner            = "AWS"
      provider         = "CodeCommit"
      version          = "1"
      output_artifacts = ["codigo_fuente"]
      configuration = {
        RepositoryName = aws_codecommit_repository.repositorio.repository_name
        BranchName     = "main"
      }
    }
  }
}
</code></pre>
</li>
</ol>


<p>Es importante complementar estos pasos con las políticas de seguridad detalladas en la sección "Implementación de Seguridad". En implementaciones más complejas, se recomienda usar módulos (sección 6.2) y definir políticas IAM estrictas (sección 2.2) <a href="https://aws.plainenglish.io/how-to-set-up-aws-codepipeline-using-terraform-code-4a732364212" rel="noopener noreferrer" target="_blank"><sup>[1]</sup></a><a href="https://docs.aws.amazon.com/es_es/prescriptive-guidance/latest/patterns/create-a-ci-cd-pipeline-to-validate-terraform-configurations-by-using-aws-codepipeline.html" rel="noopener noreferrer" target="_blank"><sup>[2]</sup></a>.</p>


<h2>Publicaciones de blog relacionadas</h2>
<ul><li><a href="https://dondeaprendoaws.com/blog/mejores-practicas-aws-para-devops/">Mejores prácticas AWS para DevOps</a></li><li><a href="https://dondeaprendoaws.com/blog/como-crear-infraestructura-como-codigo-en-aws-con-terraform/">Cómo crear Infraestructura como Código en AWS con Terraform</a></li><li><a href="https://dondeaprendoaws.com/blog/como-crear-infraestructura-como-codigo-en-aws-con-aws-cloudformation/">Cómo crear Infraestructura como Código en AWS con AWS CloudFormation</a></li><li><a href="https://dondeaprendoaws.com/blog/como-integrar-terraform-con-cicd-en-aws/">Cómo integrar Terraform con CI/CD en AWS</a></li></ul>
