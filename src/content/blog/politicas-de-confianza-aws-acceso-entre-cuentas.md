---
title: "Políticas de Confianza AWS: Acceso Entre Cuentas"
description: "Aprende a configurar políticas de confianza en AWS para permitir el acceso seguro entre cuentas y optimizar la colaboración."
publishedAt: "2024-11-26"
publishedTimestamp: "2024-11-26T20:13:42.04Z"
cover: "/assets/blog/6d11bddb1995c82265977259.jpg"
coverAlt: "Thumbnail for: Políticas de Confianza AWS: Acceso Entre Cuentas"
ogImage: "/assets/blog/6d11bddb1995c82265977259.jpg"
related:
  - title: "Pipeline CI/CD con Terraform y AWS CodePipeline"
    url: "https://dondeaprendoaws.com/blog/pipeline-cicd-con-terraform-y-aws-codepipeline/"
    image: "/assets/blog/8c8805d819a48bf8b59f25eb.jpg"
    imageAlt: ""
  - title: "AWS DeepLens: Introducción al Aprendizaje Profundo"
    url: "https://dondeaprendoaws.com/blog/aws-deeplens-introduccion-al-aprendizaje-profundo/"
    image: "/assets/blog/711eae34c71ed3b53e765f69.jpg"
    imageAlt: ""
  - title: "Mejores Prácticas Para Amazon RDS y Aurora"
    url: "https://dondeaprendoaws.com/blog/mejores-practicas-para-amazon-rds-y-aurora/"
    image: "/assets/blog/c147658e3887f6dc27b94b8d.jpg"
    imageAlt: ""
---

<p>Las <strong>políticas de confianza en <a href="https://aws.amazon.com/">AWS</a></strong> son reglas que controlan quién puede acceder a recursos en tu cuenta y bajo qué condiciones. Si necesitas conectar cuentas de AWS para compartir recursos, las políticas de confianza son esenciales. Aquí tienes lo básico:</p>
<ul><li><strong>Permiten acceso seguro entre cuentas.</strong> Por ejemplo, una cuenta puede usar roles para acceder a recursos como buckets S3 de otra cuenta.</li><li><strong>Tres elementos clave:</strong><ul><li><strong>Principal:</strong> Quién puede acceder (usuario, rol, servicio).</li><li><strong>Acción:</strong> Qué puede hacer (<code>sts:AssumeRole</code>, etc.).</li><li><strong>Condición:</strong> Cómo o bajo qué reglas (MFA, IPs específicas, etc.).</li></ul></li><li><strong>Beneficios:</strong><ul><li>Evitas duplicar recursos, ahorrando costos.</li><li>Controlas exactamente quién puede hacer qué.</li><li>Facilitas el trabajo colaborativo entre equipos.</li></ul></li></ul>
<h3 id="ejemplo-r%C3%A1pido%3A">Ejemplo rápido:</h3>
<p>Para que una cuenta A acceda a un bucket S3 en la cuenta B:</p>
<ol><li><strong>Cuenta B:</strong> Crea un rol IAM con una política de confianza.</li><li><strong>Cuenta A:</strong> Configura permisos para asumir ese rol.</li><li><strong>Bucket S3:</strong> Ajusta su política para aceptar accesos específicos.</li></ol>
<p><strong>¿Quieres aprender más?</strong> Sigue leyendo para configurar políticas de confianza paso a paso, mejorar la seguridad con MFA y aplicar el principio de privilegios mínimos.</p>
<h2 id="video-relacionado-de-youtube">Video relacionado de YouTube</h2>
<div><iframe allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen="" height="315" loading="lazy" src="https://www.youtube-nocookie.com/embed/Qrm84k9vRXg" title="Video de YouTube" width="560"></iframe></div>
<h2 id="c%C3%B3mo-funciona-el-acceso-entre-cuentas-en-aws">Cómo Funciona el Acceso Entre Cuentas en <a href="https://aws.amazon.com/">AWS</a></h2>
<p><img alt="AWS" src="/assets/blog/2ebe3cf8e7ae57e98d3af846.jpg"/></p>
<p>El acceso entre cuentas en AWS es como establecer un puente seguro entre dos organizaciones. Necesitas tres elementos clave: políticas de identidad, recursos y confianza. Veamos cómo hacer que trabajen juntos.</p>
<h3 id="configuraci%C3%B3n-del-acceso-entre-cuentas">Configuración del Acceso Entre Cuentas</h3>
<p>¿Te preguntas cómo configurar todo esto? Aquí está el proceso paso a paso:</p>
<p>1. <strong>Crear un Rol de IAM en la Cuenta Confiada</strong></p>
<p>En la cuenta B, necesitas crear un rol de IAM. Este rol es como un pase VIP que dice "la cuenta A puede entrar". Así se ve la política de confianza:</p>
<pre><code>{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {
                "AWS": "arn:aws:iam::123456789012:root"
            },
            "Action": "sts:AssumeRole"
        }
    ]
}
</code></pre>
<p>2. <strong>Definir Permisos en la Cuenta de Confianza</strong></p>
<p>Ahora, en la cuenta A, defines qué puede hacer quien tenga acceso:</p>
<pre><code>{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": "sts:AssumeRole",
            "Resource": "arn:aws:iam::098765432109:role/ExampleRole"
        }
    ]
}
</code></pre>
<p>3. <strong>Adjuntar una Política Basada en Recursos</strong></p>
<p>Para servicios como S3, puedes añadir una capa extra de control:</p>
<pre><code>{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {
                "AWS": "arn:aws:iam::123456789012:role/ExampleRole"
            },
            "Action": "s3:GetObject",
            "Resource": "arn:aws:s3:::example-bucket/*"
        }
    ]
}
</code></pre>
<h3 id="ejemplo-pr%C3%A1ctico%3A-acceso-a-un-bucket-s3">Ejemplo Práctico: Acceso a un Bucket S3</h3>
<p>Imagina que tienes dos empresas: la Empresa A necesita ver archivos en el bucket S3 de la Empresa B. Es como dar una llave temporal a un colega de otra oficina.</p>
<p>El proceso es simple: la cuenta B crea un rol especial, la cuenta A obtiene permiso para usarlo, y el bucket S3 recibe instrucciones sobre quién puede acceder y qué puede hacer.</p>
<p>Este sistema es como tener un guardia de seguridad que verifica tres cosas: quién eres, qué permiso tienes, y qué puedes hacer. Todo esto mientras mantiene los recursos seguros y bajo control.</p>
<h2 id="pasos-para-configurar-pol%C3%ADticas-de-confianza-para-acceso-entre-cuentas">Pasos para Configurar Políticas de Confianza para Acceso Entre Cuentas</h2>
<p>Las <a href="https://dondeaprendoaws.com/blog/seguridad-en-la-nube-aws-estrategias-clave/">políticas de confianza en AWS</a> son la clave para permitir que diferentes cuentas trabajen juntas de forma segura. Veamos cómo hacerlo paso a paso.</p>
<h3 id="c%C3%B3mo-crear-pol%C3%ADticas-de-confianza">Cómo Crear Políticas de Confianza</h3>
<p>Para crear una política de confianza efectiva, necesitas dos cosas: saber qué cuentas pueden acceder y qué acciones específicas pueden realizar.</p>
<p>El proceso es directo: usa la <a href="https://dondeaprendoaws.com/blog/aws-fundamentos-guia-de-inicio-rapido/">Consola de AWS</a>, la CLI o los SDKs para implementar tu política. Lo importante es ser específico con los permisos que otorgas.</p>
<h4 id="ejemplo-de-pol%C3%ADtica-de-confianza">Ejemplo de Política de Confianza</h4>
<p>Aquí tienes un ejemplo práctico que muestra cómo permitir que otra cuenta asuma un rol en tu cuenta:</p>
<pre><code>{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::111111111111:root"
      },
      "Action": "sts:AssumeRole",
      "Resource": "arn:aws:iam::999999999999:role/UpdateData"
    }
  ]
}
</code></pre>
<h3 id="c%C3%B3mo-aws-eval%C3%BAa-las-pol%C3%ADticas">Cómo AWS Evalúa las Políticas</h3>
<p>AWS usa un sistema de doble verificación: revisa tanto la política de confianza como la política del recurso. Es como tener dos cerraduras - necesitas que ambas digan "sí" para obtener acceso. Si cualquiera dice "no", no hay acceso.</p>
<h3 id="ejemplo%3A-escribiendo-una-pol%C3%ADtica-de-confianza">Ejemplo: Escribiendo una Política de Confianza</h3>
<p>Mira este ejemplo para compartir un bucket S3 entre cuentas:</p>
<pre><code>{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::111111111111:root"
      },
      "Action": "s3:*",
      "Resource": "arn:aws:s3:::amzn-s3-demo-bucket-shared-container"
    }
  ]
}
</code></pre>
<p><strong>Consejo de seguridad:</strong> Otorga solo los permisos mínimos necesarios. Es más fácil agregar permisos después que tener que lidiar con un problema de seguridad.</p>
<p>No olvides revisar tus políticas regularmente. La <a href="https://dondeaprendoaws.com/blog/aws-seguridad-servicios-esenciales/">seguridad en la nube</a> es un proceso continuo, no algo que configuras y olvidas.</p>
<h2 id="tips-para-un-acceso-seguro-entre-cuentas">Tips para un Acceso Seguro Entre Cuentas</h2>
<p>La seguridad en el acceso entre cuentas de AWS es clave para proteger tus recursos. Veamos cómo puedes implementar medidas efectivas que realmente funcionen.</p>
<h3 id="aplicando-el-principio-de-privilegios-m%C3%ADnimos">Aplicando el Principio de Privilegios Mínimos</h3>
<p>Piensa en los privilegios mínimos como dar a cada persona solo las llaves que necesita - ni más, ni menos. Es simple pero poderoso.</p>
<p><strong>¿Cómo hacerlo bien?</strong> En vez de dar permisos generales como <code>s3:*</code> o <code>ec2:*</code>, sé específico. Por ejemplo, si alguien solo necesita leer archivos, dale <code>s3:GetObject</code>. Si solo necesita ver instancias EC2, asigna <code>ec2:DescribeInstances</code>.</p>
<p><strong>Tip práctico</strong>: Haz una auditoría mensual de tus políticas IAM. ¿Hay permisos que nadie usa? Elimínalos. ¿Alguien necesita acceso temporal? Establece una fecha de caducidad.</p>
<h3 id="mfa%3A-tu-segunda-l%C3%ADnea-de-defensa">MFA: Tu Segunda Línea de Defensa</h3>
<p>La autenticación multifactorial (MFA) es como tener un guardia de seguridad extra. Es especialmente importante para roles que manejan datos sensibles.</p>
<p>Así puedes configurar MFA para roles críticos:</p>
<pre><code>{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::123456789012:root"
      },
      "Action": "sts:AssumeRole",
      "Condition": {
        "Bool": {
          "aws:MultiFactorAuthPresent": true
        }
      }
    }
  ]
}
</code></pre>
<h3 id="mant%C3%A9n-los-ojos-bien-abiertos">Mantén los Ojos Bien Abiertos</h3>
<p>¿Cómo sabes si alguien está usando mal sus permisos? AWS te da las herramientas:</p>
<ul><li><strong><a href="https://docs.aws.amazon.com/IAM/latest/UserGuide/what-is-access-analyzer.html">Access Analyzer</a></strong>: Es como tu detector de riesgos personal. Te avisa si hay políticas que podrían exponer tus recursos.</li><li><strong><a href="https://docs.aws.amazon.com/cloudtrail/">CloudTrail</a></strong>: Piensa en él como una cámara de seguridad. Registra cada acción en tu cuenta.</li></ul>
<p><strong>Caso real</strong>: Imagina que compartes un bucket S3 con otra cuenta. Con CloudTrail, puedes ver exactamente quién accedió y qué hizo. Si algo no cuadra, puedes actuar rápido y ajustar los permisos.</p>
<p>La <a href="https://dondeaprendoaws.com/blog/aws-seguridad-mejores-practicas/">seguridad en AWS</a> no tiene que ser complicada. Con estas tres prácticas - privilegios mínimos, MFA y monitoreo constante - ya tienes una base sólida para proteger tus recursos.</p>
<h2 id="escenarios-avanzados-y-herramientas-para-el-acceso-entre-cuentas">Escenarios Avanzados y Herramientas para el Acceso Entre Cuentas</h2>
<h3 id="uso-de-aws-organizations-para-la-gesti%C3%B3n-de-acceso">Uso de <a href="https://docs.aws.amazon.com/organizations/latest/userguide/orgs_introduction.html">AWS Organizations</a> para la Gestión de Acceso</h3>
<p><img alt="AWS Organizations" src="/assets/blog/8b3a76c554ad5b4818166eb5.jpg"/></p>
<p>AWS Organizations te permite manejar varias cuentas de AWS desde un solo lugar. Su característica más poderosa son las <strong>políticas de control de servicio (SCPs)</strong>, que actúan como guardianes de los permisos en tu organización.</p>
<p>Imagina esto: tienes tres cuentas - desarrollo, pruebas y producción. Con SCPs, puedes LIMITAR lo que cada equipo puede hacer. Por ejemplo, los desarrolladores no podrán crear instancias EC2 costosas, mientras que el equipo de producción tendrá los permisos necesarios para su trabajo.</p>
<p>Los números hablan por sí solos: una startup tech redujo sus errores de configuración en un 40% después de usar SCPs para administrar 10 cuentas de AWS. ¿Por qué funcionó? Simple: las reglas se aplican automáticamente desde arriba, sin chance de saltárselas.</p>
<h3 id="ejemplos-de-recursos-compartidos">Ejemplos de Recursos Compartidos</h3>
<p>Compartir recursos entre cuentas de AWS es como crear puentes seguros entre diferentes equipos. Veamos cómo funciona en la práctica:</p>
<p><strong>Buckets de S3</strong> Puedes dar diferentes niveles de acceso a tus buckets. Es como tener una biblioteca donde algunos pueden leer y escribir libros, mientras otros solo pueden leerlos. Mira este ejemplo de política:</p>
<pre><code>{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::123456789012:root"
      },
      "Action": ["s3:GetObject", "s3:PutObject"],
      "Resource": "arn:aws:s3:::example-bucket/*"
    }
  ]
}
</code></pre>
<p><strong>Funciones Lambda y Roles IAM</strong> Las funciones Lambda pueden compartirse entre cuentas - piensa en ellas como pequeños ayudantes que pueden trabajar para diferentes equipos. Y los roles de IAM? Son como pases VIP que permiten acceder a recursos específicos de forma segura.</p>
<p>Esta combinación de herramientas te ayuda a crear un ambiente de trabajo colaborativo sin comprometer la seguridad. Es como tener las llaves correctas para cada puerta, asegurando que cada equipo pueda hacer su trabajo sin tropezar con los demás.</p>
<h2 id="resumen-y-recursos-adicionales">Resumen y Recursos Adicionales</h2>
<p>Las políticas de confianza son la base para controlar el acceso entre cuentas en AWS. Con ellas, puedes definir qué usuarios y roles pueden acceder a recursos específicos en otras cuentas.</p>
<p><strong>Lo que necesitas saber:</strong></p>
<ul><li>Para conectar cuentas, crea roles de IAM con políticas de confianza específicas</li><li>AWS revisa dos tipos de políticas: las basadas en identidad y las basadas en recursos</li><li>Mantén tus políticas actualizadas y revisa los accesos con frecuencia</li><li>Usa MFA y aplica permisos mínimos para mayor seguridad</li></ul>
<p>¿Buscas aprender más sobre AWS en español?</p>
<p><a href="https://dondeaprendoaws.com/">Dónde Aprendo AWS</a> es tu mejor recurso. Este blog está diseñado para la comunidad hispanohablante, desde principiantes hasta usuarios intermedios. Encontrarás:</p>
<ul><li>Guías paso a paso sobre políticas de confianza</li><li>Tutoriales para gestionar accesos entre cuentas</li><li>Ejemplos prácticos con código</li><li>Explicaciones claras de conceptos complejos</li></ul>
<p>El blog se enfoca en crear contenido de calidad para desarrolladores e ingenieros que prefieren aprender AWS en español. La plataforma fomenta el aprendizaje colaborativo y ofrece recursos actualizados para la comunidad.</p>
<h2 id="faqs">FAQs</h2>
<h3 id="%C2%BFes-posible-acceder-a-recursos-entre-cuentas-en-aws%3F">¿Es posible acceder a recursos entre cuentas en AWS?</h3>
<p>¡Claro que sí! AWS te permite compartir recursos entre cuentas. Todo se reduce a dos tipos de políticas: las basadas en recursos (que controlan quién puede usar el recurso compartido) y las basadas en identidad (que definen qué puede hacer cada usuario).</p>
<p>Piensa en esto como dar llaves de tu casa: decides quién puede entrar (política basada en recursos) y qué habitaciones puede usar cada persona (política basada en identidad).</p>
<h3 id="%C2%BFqu%C3%A9-es-una-pol%C3%ADtica-de-acceso-entre-cuentas-en-aws%3F">¿Qué es una política de acceso entre cuentas en AWS?</h3>
<p>Es como crear un "pase VIP" entre cuentas de AWS. Usando roles de IAM y políticas de confianza, puedes dar permisos específicos de una cuenta a otra.</p>
<p><strong>Ejemplo práctico</strong>: Imagina que tienes un bucket S3 en la cuenta A y quieres que ciertos usuarios de la cuenta B puedan usarlo. Creas un rol que actúa como ese "pase VIP", definiendo exactamente qué pueden hacer estos usuarios - como ver archivos, pero no borrarlos.</p>
<h3 id="%C2%BFqu%C3%A9-es-una-pol%C3%ADtica-de-confianza-en-aws%3F">¿Qué es una política de confianza en AWS?</h3>
<p>Una política de confianza es el documento que dice "estas personas pueden usar este rol". Es diferente de otras políticas porque se centra en WHO puede asumir un rol, no en WHAT pueden hacer una vez que lo tienen.</p>
<p><strong>Tip de seguridad</strong>: Para roles importantes, puedes exigir MFA. Es como pedir una segunda llave además del pase VIP - más seguridad nunca está de más.</p>
<hr/>
<p>¿Necesitas más detalles sobre cómo configurar todo esto? Revisa las secciones anteriores donde explicamos paso a paso cómo crear y gestionar estas políticas.</p>
<h2 id="related-posts">Related posts</h2>
<ul><li><a href="https://dondeaprendoaws.com/blog/aws-seguridad-servicios-esenciales/">Seguridad en AWS: Servicios Esenciales</a></li><li><a href="https://dondeaprendoaws.com/blog/gestionando-multiples-cuentas-de-aws-con-aws-organizations/">Gestionando Múltiples Cuentas de AWS con AWS Organizations</a></li><li><a href="https://dondeaprendoaws.com/blog/mejores-practicas-de-seguridad-en-aws/">Mejores Prácticas de Seguridad en AWS</a></li><li><a href="https://dondeaprendoaws.com/blog/como-usar-aws-transfer-family-con-amazon-efs/">Cómo Usar AWS Transfer Family con Amazon EFS</a></li></ul>
