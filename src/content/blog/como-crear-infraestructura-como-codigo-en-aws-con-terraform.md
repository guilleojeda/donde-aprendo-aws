---
title: "Cómo crear Infraestructura como Código en AWS con Terraform"
description: "Aprende a crear Infraestructura como Código en AWS con Terraform. Descubre los conceptos básicos, la instalación, la configuración de credenciales y más. Conoce cómo desplegar un servidor web en AWS con ejemplos prácticos."
publishedAt: "2024-03-18"
publishedTimestamp: "2024-03-18T00:48:17.194Z"
cover: "/assets/blog/e70ea85183c2a0917d33154f.png"
coverAlt: "Thumbnail for: Cómo crear Infraestructura como Código en AWS con Terraform"
ogImage: "/assets/blog/e70ea85183c2a0917d33154f.png"
related:
  - title: "Mejores Prácticas de Seguridad en AWS"
    url: "https://dondeaprendoaws.com/blog/mejores-practicas-de-seguridad-en-aws/"
    image: "/assets/blog/b986394b769bbf12716343e5.jpg"
    imageAlt: ""
  - title: "AWS Fundamentos: Guía de Inicio Rápido"
    url: "https://dondeaprendoaws.com/blog/aws-fundamentos-guia-de-inicio-rapido/"
    image: "/assets/blog/945b48235c5e1f4c1d3cc3ae.jpg"
    imageAlt: ""
  - title: "AWS Seguridad: Mejores Prácticas"
    url: "https://dondeaprendoaws.com/blog/aws-seguridad-mejores-practicas/"
    image: "/assets/blog/58bea5d60c133d57e4a0bdbf.jpg"
    imageAlt: ""
---

<p>Crear infraestructura en AWS con Terraform te permite gestionar tus recursos en la nube de manera eficiente y automatizada. Terraform utiliza la Infraestructura como Código (IaC) para facilitar la creación, actualización y mantenimiento de tus sistemas. Aquí te mostraremos cómo empezar, desde los conceptos básicos hasta consejos avanzados:</p>
<ul><li><strong>Conceptos Básicos</strong>: <a href="https://www.terraform.io/intro/">Terraform</a> te permite versionar tu infraestructura, desplegarla rápidamente y garantizar su consistencia.</li><li><strong>Preparación</strong>: Necesitarás conocimientos básicos en nube, AWS, programación y manejo de sistemas. Además, es esencial tener una cuenta de AWS y AWS CLI instalado.</li><li><strong>Instalación de Terraform</strong>: Disponible para Linux, Windows y macOS. Te enseñamos cómo instalarlo en cada sistema operativo.</li><li><strong>Configuración de Credenciales de AWS</strong>: Cómo usar IAM para crear un usuario para Terraform y configurar sus credenciales.</li><li><strong>Archivos de Configuración</strong>: Crea archivos <code>.tf</code> usando el lenguaje HCL para describir tu infraestructura.</li><li><strong>Flujo de Trabajo de Terraform</strong>: Pasos básicos para desplegar tu infraestructura: <code>terraform init</code>, <code>terraform plan</code>, <code>terraform apply</code> y <code>terraform destroy</code>.</li><li><strong>Módulos en Terraform</strong>: Aprovecha los módulos para reutilizar configuraciones comunes.</li><li><strong>Manejo del Estado de Terraform</strong>: Importancia de gestionar correctamente el estado de Terraform para evitar inconsistencias.</li><li><strong>Consejos y Mejores Prácticas</strong>: Recomendaciones para estructurar tus archivos, seguridad y más.</li><li><strong>Recursos Adicionales</strong>: Dónde aprender más sobre Terraform y profundizar tus conocimientos.</li></ul>
<p>Con estos pasos y consejos, estarás listo para comenzar a usar Terraform para gestionar tu infraestructura en AWS de manera eficaz y eficiente.</p>
<h3 id="conocimientos-b%C3%A1sicos">Conocimientos Básicos</h3>
<p>Es útil saber algo sobre:</p>
<ul><li><strong>La nube y AWS</strong>: Entender qué es una VPC, subnets, security groups, etc., te ayudará mucho.</li><li><strong>Programación</strong>: No necesitas ser un experto, pero si sabes algo de Python, Go o Ruby, te será más fácil agarrarle el truco a Terraform.</li><li><strong>Manejo de sistemas Linux y Windows</strong>: Cosas como instalar programas y manejar servicios te serán útiles.</li></ul>
<p>No te preocupes si no eres un experto en estos temas. Con tener una idea general ya estás bien para empezar.</p>
<h3 id="cuenta-en-aws">Cuenta en AWS</h3>
<p>Para poder usar Terraform con AWS, necesitas una cuenta en Amazon Web Services. Si no tienes una, puedes registrarte para obtener una cuenta gratuita que te da acceso limitado a algunos recursos por 12 meses. También hay opciones de pago si necesitas más recursos.</p>
<h3 id="aws-cli">AWS CLI</h3>
<p>La <a href="https://aws.amazon.com/es/cli/">interfaz de línea de comandos de AWS</a> es una herramienta que te permite manejar los servicios y recursos de AWS desde la terminal. Aunque no es obligatorio tenerla, te puede facilitar la vida para algunas tareas, como crear usuarios para Terraform o encontrar IDs de recursos. Te recomendamos tenerla instalada y lista para usar antes de empezar con Terraform.</p>
<h2 id="%C2%BFqu%C3%A9-es-terraform%3F">¿Qué es <a href="https://www.terraform.io/intro/">Terraform</a>?</h2>
<p><img alt="Terraform" src="/assets/blog/c2a5f05676acace2e8868f86.jpg"/></p>
<p>Terraform es una herramienta gratuita que te ayuda a configurar y administrar tu infraestructura de tecnología. Piensa en ello como un asistente que organiza y pone en marcha todo lo que necesitas para que tus aplicaciones en la nube, como las de Amazon Web Services (AWS), funcionen sin problemas.</p>
<p>Con Terraform, en lugar de hacer clics y más clics en una interfaz de usuario o escribir comandos complicados, simplemente describes en un archivo de texto cómo quieres que sea tu infraestructura. Terraform luego toma ese archivo, entiende lo que quieres hacer y lo hace realidad.</p>
<h3 id="caracter%C3%ADsticas-clave">Características clave</h3>
<p>Aquí hay algunas cosas geniales sobre Terraform:</p>
<ul><li><strong>Infraestructura como código</strong>: Escribes lo que necesitas en un archivo de texto usando un lenguaje fácil de entender. Esto hace que sea más sencillo hacer cambios y mantener todo organizado.</li><li><strong>Planes de ejecución</strong>: Terraform te muestra qué va a hacer antes de hacerlo. Esto te ayuda a evitar sorpresas o errores.</li><li><strong>Gráficos de recursos</strong>: Terraform entiende cómo se relacionan tus servicios y recursos entre sí, así que puede hacer las cosas en el orden correcto y rápido.</li><li><strong>Cambios incrementales</strong>: Terraform solo actualiza lo que ha cambiado desde la última vez que lo usaste, lo que significa que las cosas se hacen más rápido.</li></ul>
<h3 id="ventajas-sobre-otras-herramientas">Ventajas sobre otras herramientas</h3>
<p>Comparado con otras herramientas como CloudFormation de AWS o scripts en Bash, Terraform tiene algunas ventajas:</p>
<ul><li>Puedes usarlo con muchos proveedores de servicios en la nube, no solo con uno. Esto es genial si usas servicios de diferentes compañías.</li><li>Te da un plan de lo que va a hacer antes de hacerlo, te muestra cómo se conectan tus recursos y solo cambia lo que necesita cambiar. Esto te da más control.</li><li>Es fácil de usar en cualquier computadora porque viene en un solo paquete sin necesidad de instalar otras cosas.</li><li>Tiene un lenguaje sencillo y claro que hace más fácil trabajar en equipo y reutilizar lo que ya has hecho.</li></ul>
<p>En resumen, Terraform te facilita mucho la vida cuando se trata de configurar y manejar tu infraestructura en la nube, haciéndolo una opción muy buena para trabajar con Infraestructura como Código.</p>
<h2 id="c%C3%B3mo-instalar-terraform">Cómo instalar Terraform</h2>
<h3 id="en-linux">En Linux</h3>
<p>Si usas Linux, como Ubuntu, Debian o CentOS, lo mejor es usar el administrador de paquetes propio de tu sistema.</p>
<h4 id="ubuntu-%2F-debian">Ubuntu / Debian</h4>
<p>Para instalar Terraform, simplemente abre la terminal y escribe:</p>
<pre><code>sudo apt update
sudo apt install terraform
</code></pre>
<h4 id="centos-%2F-rhel">CentOS / RHEL</h4>
<p>En estos sistemas, los comandos son un poco diferentes:</p>
<pre><code>sudo yum update
sudo yum install terraform
</code></pre>
<p>Si prefieres, puedes descargar Terraform directamente de su <a href="https://www.terraform.io/downloads.html">página web</a> y hacer la instalación manualmente:</p>
<pre><code>curl -O https://releases.hashicorp.com/terraform/X.X.X/terraform_X.X.X_linux_amd64.zip
unzip terraform_X.X.X_linux_amd64.zip
sudo mv terraform /usr/local/bin/
</code></pre>
<h3 id="en-windows">En Windows</h3>
<p>Para los que usan Windows, la opción más fácil es usar Chocolatey:</p>
<pre><code>choco install terraform
</code></pre>
<p>O descargar el instalador <code>.exe</code> desde la <a href="https://www.terraform.io/downloads.html">página de descargas</a> y seguir las instrucciones.</p>
<h3 id="en-macos">En macOS</h3>
<p>Si tienes macOS, puedes usar Homebrew para instalar Terraform fácilmente:</p>
<pre><code>brew install terraform
</code></pre>
<p>O, si prefieres, descarga el archivo <code>.zip</code> desde la <a href="https://www.terraform.io/downloads.html">página de descargas</a>, descomprímelo y colócalo en un lugar que tu computadora pueda encontrar.</p>
<h3 id="c%C3%B3mo-saber-si-se-instal%C3%B3-bien">Cómo saber si se instaló bien</h3>
<p>Para estar seguro de que Terraform se instaló correctamente, abre la terminal y escribe:</p>
<pre><code>terraform --version
</code></pre>
<p>Si ves un número de versión, significa que todo está listo para usar.</p>
<h2 id="configuraci%C3%B3n-de-credenciales-para-aws">Configuración de credenciales para AWS</h2>
<p>Para que Terraform pueda hablar con AWS y crear o modificar cosas allí, necesita saber quién eres. Esto se hace usando unas claves especiales llamadas credenciales. Aquí te explicamos cómo preparar todo:</p>
<h3 id="crear-usuarios-de-iam">Crear usuarios de IAM</h3>
<p>Lo más seguro es crear un usuario especial solo para Terraform en IAM, que es como el departamento de seguridad de AWS. A este usuario le das solo los permisos que necesita para hacer su trabajo y nada más. Aquí van los pasos:</p>
<ul><li>Entra a la consola de IAM en AWS</li><li>Ve a la sección de Usuarios y elige "Agregar usuario"</li><li>Ponle un nombre y marca la opción de "Acceso programático"</li><li>Después, crea un grupo para este usuario y selecciona los permisos que necesita</li><li>Antes de terminar, revisa todo y dale a "Crear usuario"</li><li><strong>Importante</strong>: apunta bien el access key ID y secret access key que te dan</li></ul>
<h3 id="variables-de-entorno">Variables de entorno</h3>
<p>Con las claves del usuario de IAM, ponlas como variables de entorno en tu computadora. Esto es como dejarle una nota a Terraform diciéndole cómo entrar a AWS:</p>
<pre><code>export AWS_ACCESS_KEY_ID=\"TU_ACCESS_KEY\"
export AWS_SECRET_ACCESS_KEY=\"TU_SECRET_KEY\"
</code></pre>
<p>Así, Terraform puede usar estas claves cada vez que necesita hacer algo en AWS.</p>
<h3 id="archivo-de-configuraci%C3%B3n">Archivo de configuración</h3>
<p>Otra opción es escribir las claves en un archivo especial llamado <code>.aws/credentials</code>, que se guarda en tu computadora. Aquí es donde lo pones:</p>
<pre><code>[default]
aws_access_key_id = TU_ACCESS_KEY
aws_secret_access_key = TU_SECRET_KEY
</code></pre>
<h2 id="archivos-de-configuraci%C3%B3n-de-terraform">Archivos de configuración de Terraform</h2>
<p>Los archivos de configuración de Terraform son los documentos donde se describe qué es lo que quieres que Terraform haga en tu infraestructura en la nube, como en AWS. Estos archivos terminan en <code>.tf</code> y están escritos en un lenguaje especial llamado HCL, que es bastante sencillo de entender.</p>
<h3 id="formato">Formato</h3>
<ul><li>Terminan en <code>.tf</code></li><li>Son declarativos, es decir, tú dices qué quieres lograr</li><li>Puedes poner comentarios con <code>#</code></li><li>Son fáciles de leer</li></ul>
<h3 id="estructura">Estructura</h3>
<p>En estos archivos puedes incluir distintas partes:</p>
<ul><li><code>terraform</code>: ajustes generales de Terraform</li><li><code>provider</code>: aquí se pone con qué servicio en la nube estás trabajando, como AWS</li><li><code>resource</code>: son los elementos que quieres crear, como servidores o espacios de almacenamiento</li><li><code>data</code>: información sobre recursos que ya existen</li><li><code>module</code>: piezas de código que puedes reusar</li><li><code>output</code>: información que Terraform te da después de hacer su trabajo</li></ul>
<h3 id="sintaxis">Sintaxis</h3>
<p>La manera de escribir en estos archivos es simple:</p>
<pre><code>resource "tipo_recurso" "nombre" {
  atributo1 = "valor"
  atributo2 = "valor"
}
</code></pre>
<p>Por ejemplo, para una máquina virtual en AWS sería algo así:</p>
<pre><code>resource "aws_instance" "mi_servidor" {
  ami           = "ami-0c55b159cbfafe1f0"
  instance_type = "t2.micro"
}
</code></pre>
<p>O para un espacio de almacenamiento S3:</p>
<pre><code>resource "aws_s3_bucket" "mi_bucket" {
  bucket = "nombre-bucket-unico"
  acl    = "private"
}
</code></pre>
<p>Así puedes describir cualquier recurso de AWS que quieras usar.</p>
<h2 id="flujo-de-trabajo-de-terraform">Flujo de trabajo de Terraform</h2>
<p>El proceso para usar Terraform con AWS se divide en pasos claros:</p>
<h3 id="terraform-init"><code>terraform init</code></h3>
<p>Este primer paso prepara tu proyecto. Cuando ejecutas <code>terraform init</code>, Terraform se pone listo descargando lo necesario para trabajar con AWS. Piensa en ello como preparar tu caja de herramientas antes de empezar un proyecto.</p>
<p>Lo que hace este comando incluye:</p>
<ul><li>Baja e instala lo necesario para que Terraform y AWS puedan comunicarse.</li><li>Revisa que los archivos de tu proyecto estén escritos correctamente.</li><li>Prepara un archivo donde guarda información de tu infraestructura.</li></ul>
<p>Es el punto de partida para cualquier cosa que quieras hacer con Terraform.</p>
<h3 id="terraform-plan"><code>terraform plan</code></h3>
<p>Con <code>terraform plan</code>, Terraform te muestra un resumen de lo que va a hacer antes de hacerlo. Esto te permite revisar que los cambios que se van a aplicar son realmente los que quieres.</p>
<p>En este resumen puedes ver:</p>
<ul><li>Cuáles recursos se van a añadir, cambiar o quitar.</li><li>El orden en que Terraform va a hacer los cambios.</li><li>Si los cambios propuestos exceden algún límite de AWS.</li></ul>
<p>Es como darle un vistazo al plano antes de construir algo, para asegurarte de que todo esté correcto.</p>
<h3 id="terraform-apply"><code>terraform apply</code></h3>
<p>Si el plan se ve bien, el siguiente paso es <code>terraform apply</code>. Este comando hace todos los cambios que Terraform te mostró en el plan. Crea, cambia o elimina recursos en AWS para que tu infraestructura sea exactamente como la definiste en tus archivos.</p>
<p>Después de aplicar los cambios, Terraform actualiza su archivo de información para recordar qué hizo. Así, tu proyecto de AWS está al día con tus archivos de Terraform.</p>
<h3 id="terraform-destroy"><code>terraform destroy</code></h3>
<p>Finalmente, cuando ya no necesitas los recursos que Terraform creó, puedes usar <code>terraform destroy</code>. Este comando elimina todo lo que Terraform había configurado, dejando limpio tu espacio en AWS.</p>
<p>Es útil para cuando estás experimentando o terminaste un proyecto y no quieres dejar cosas sin usar que te podrían costar dinero.</p>
<p>En resumen, Terraform te ayuda a gestionar tu infraestructura en AWS de una manera organizada, paso a paso, desde la preparación hasta la limpieza final.</p>
<h2 id="ejemplo%3A-desplegando-un-servidor-web-en-aws">Ejemplo: Desplegando un servidor web en AWS</h2>
<h3 id="archivos-de-configuraci%C3%B3n">Archivos de configuración</h3>
<p>Para poner en marcha un servidor web en AWS usando Terraform, primero debemos definir qué queremos construir en unos archivos de texto llamados archivos de configuración.</p>
<p>Vamos a necesitar varios recursos como:</p>
<ul><li>Una red privada virtual (VPC) y subredes</li><li>Un grupo de seguridad</li><li>Una máquina virtual EC2 con el servidor web Apache</li></ul>
<p>Podemos organizar el código en diferentes archivos <code>.tf</code>. Por ejemplo:</p>
<p><strong>vpc.tf</strong></p>
<pre><code>resource "aws_vpc" "mi_vpc" {
  cidr_block = "10.0.0.0/16"
}

resource "aws_subnet" "mi_subnet" {
  vpc_id = aws_vpc.mi_vpc.id
  cidr_block = "10.0.1.0/24"
}
</code></pre>
<p><strong>servidor.tf</strong></p>
<pre><code>resource "aws_instance" "mi_servidor" {
  ami           = "ami-0c55b159cbfafe1f0"
  instance_type = "t2.micro"

  # Para instalar Apache
  user_data = &lt;&lt;-EOF
              #!/bin/bash
              yum update -y
              yum install -y httpd
              systemctl start httpd
              EOF

  vpc_security_group_ids = [aws_security_group.sg_web.id]

  subnet_id = aws_subnet.mi_subnet.id

  tags = {
    Name = "Mi servidor web"
  }
}
</code></pre>
<h3 id="inicializaci%C3%B3n">Inicialización</h3>
<p>Una vez que tenemos todo listo, preparamos Terraform con:</p>
<pre><code>terraform init
</code></pre>
<p>Esto prepara el terreno para trabajar con AWS.</p>
<h3 id="planificaci%C3%B3n">Planificación</h3>
<p>Después, creamos un plan para ver qué cambios se harán:</p>
<pre><code>terraform plan
</code></pre>
<p>Nos aseguramos de que todo esté correcto.</p>
<h3 id="aplicaci%C3%B3n">Aplicación</h3>
<p>Si estamos de acuerdo con el plan, lo ponemos en marcha:</p>
<pre><code>terraform apply
</code></pre>
<p>Terraform nos mostrará cómo va creando los recursos en AWS.</p>
<h3 id="actualizaci%C3%B3n">Actualización</h3>
<p>Si queremos mejorar nuestro servidor, por ejemplo, cambiarlo a uno más grande, modificamos <code>servidor.tf</code>:</p>
<pre><code>resource "aws_instance" "mi_servidor" {

  # otras configuraciones...

  instance_type = "t2.large" # Cambiamos a una instancia más grande

}
</code></pre>
<p>Y repetimos el proceso de planificación y aplicación:</p>
<pre><code>terraform plan # Para revisar los cambios
terraform apply # Para hacer el cambio
</code></pre>
<h3 id="limpieza">Limpieza</h3>
<p>Al final, si queremos eliminar todo, usamos:</p>
<pre><code>terraform destroy
</code></pre>
<p>Así, dejamos AWS sin los recursos que habíamos creado.</p>
<h2 id="m%C3%B3dulos-en-terraform">Módulos en Terraform</h2>
<p>Los módulos en Terraform son como cajas de herramientas que agrupan configuraciones que puedes usar más de una vez. Esto ayuda a mantener tu código ordenado y facilita compartir configuraciones útiles.</p>
<h3 id="creando-m%C3%B3dulos">Creando módulos</h3>
<p>Si tienes una parte de tu configuración de Terraform que piensas usar en varios lugares, puedes convertirla en un módulo. Por ejemplo, si tienes un grupo de seguridad que quieres reutilizar, puedes hacerlo así:</p>
<pre><code>module "security_group" {
  source = "./security_group"
  vpc_id = aws_vpc.main.id

  ingress_rules = [{
    port        = 443
    description = "Permitir tráfico HTTPS"
  }]
}
</code></pre>
<p>Y defines el módulo en <code>./security_group</code>:</p>
<pre><code>variable "vpc_id" {}

variable "ingress_rules" {
  type = list(object({
    port        = number
    description = string
  }))
}

resource "aws_security_group" "this" {
  vpc_id = var.vpc_id

  dynamic "ingress" {
    for_each = var.ingress_rules

    content {
      description = ingress.value.description
      from_port   = ingress.value.port
      to_port     = ingress.value.port
      protocol    = "tcp"
    }
  }
}
</code></pre>
<p>De esta forma, puedes reusar esta configuración sin tener que escribirla de nuevo.</p>
<h3 id="consumiendo-m%C3%B3dulos">Consumiendo módulos</h3>
<p>Terraform tiene un lugar donde la gente comparte módulos que han hecho, llamado <a href="https://registry.terraform.io/browse/modules">registro público de módulos</a>. Aquí puedes encontrar módulos para cosas como poner en marcha un clúster EKS en AWS:</p>
<pre><code>module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "18.0.4"

  cluster_name    = "mi-cluster"
  cluster_version = "1.21"

  vpc_id  = "vpc-1234556abcdef"

  subnet_ids = [
    "subnet-abcde012",
    "subnet-bcde012a"
  ]

  node_groups = {
    example = {
      desired_capacity = 2
      max_capacity     = 10
      min_capacity     = 1

      instance_types = ["t3.medium"]
    }
  }
}
</code></pre>
<p>Esto te ahorra mucho tiempo porque no tienes que configurar todo desde cero.</p>
<h3 id="mejores-pr%C3%A1cticas">Mejores prácticas</h3>
<p>Cuando creas tus propios módulos, es importante:</p>
<ul><li>Documentar bien lo que hace cada parte</li><li>Mantener un código limpio y ordenado</li><li>Probar bien antes de usarlos en proyectos importantes</li></ul>
<p>Y si decides compartir tus módulos:</p>
<ul><li>Escoge una licencia que permita a otros usarlos libremente</li><li>Proporciona una buena documentación</li><li>Usa versiones de forma clara</li><li>Automatiza pruebas y actualizaciones</li></ul>
<p>Así, no solo te beneficias tú, sino que también ayudas a otros.</p>
<h2 id="estado-de-terraform">Estado de Terraform</h2>
<p>Manejar bien el estado es super importante para que Terraform haga su trabajo correctamente. El estado es básicamente un archivo que guarda información sobre los recursos que tienes en tu infraestructura y cómo están configurados. Aquí te explicamos algunas formas de manejar el estado:</p>
<h3 id="almacenamiento-local">Almacenamiento local</h3>
<p>Normalmente, Terraform guarda el estado en un archivo en tu computadora llamado <code>terraform.tfstate</code>. Esto está bien para proyectos pequeños o de prueba, pero tiene sus problemas cuando trabajas en equipo:</p>
<ul><li>El estado solo se guarda en tu máquina, así que no lo pueden ver los demás.</li><li>Hay riesgo de que los datos se mezclen o se pierdan si varias personas intentan hacer cambios al mismo tiempo.</li></ul>
<h3 id="backend-remoto">Backend remoto</h3>
<p>Una mejor idea es usar un <strong>backend remoto</strong> para guardar el estado. Esto tiene varias ventajas:</p>
<ul><li><strong>Compartir</strong> el estado para que todos en el equipo puedan acceder a la misma información.</li><li><strong>Ejecutar</strong> Terraform desde diferentes lugares sin problemas con el estado.</li><li>Guardar el estado en un lugar seguro como S3 para evitar perderlo.</li></ul>
<p>Configurar esto es sencillo, solo tienes que añadir un bloque <code>backend</code> en tu configuración de Terraform:</p>
<pre><code>terraform {
  backend "s3" {
    bucket = "mi-bucket-terraform"
    key    = "estado/mi-app.tfstate"
    region = "us-east-1"
  }
}
</code></pre>
<h3 id="bloqueo-de-estado">Bloqueo de estado</h3>
<p>Si en tu equipo varias personas pueden hacer cambios al mismo tiempo, es buena idea usar el <strong>bloqueo de estado</strong>.</p>
<p>Esto previene que los datos se dañen porque alguien más está haciendo cambios mientras tú trabajas. Terraform puede "bloquear" el estado mientras se hacen cambios para que nadie más pueda modificarlo al mismo tiempo.</p>
<p>Para activarlo, solo usa la opción <code>-lock=true</code>:</p>
<pre><code>terraform apply -lock=true
</code></pre>
<p>En resumen, manejar bien el estado de Terraform ayuda a que todo funcione de manera consistente, segura y facilita el trabajo en equipo.</p>
<h2 id="consejos-y-mejores-pr%C3%A1cticas">Consejos y mejores prácticas</h2>
<h3 id="estructura-de-archivos">Estructura de archivos</h3>
<p>Para que sea más fácil manejar tus archivos de Terraform, te sugerimos lo siguiente:</p>
<ul><li>Organiza los archivos según su propósito, como <code>vpc.tf</code> para la red virtual, <code>servidores.tf</code> para las máquinas virtuales, y <code>bases_de_datos.tf</code> para las bases de datos.</li><li>Elige nombres que expliquen claramente qué contiene cada archivo o recurso. Por ejemplo, usa <code>servidor_web.tf</code> en vez de solo <code>instancia.tf</code>.</li><li>Mantén un archivo <code>variables.tf</code> donde declares todas las variables que utilices en tu proyecto.</li><li>Guarda los módulos reutilizables en una carpeta separada llamada <code>modulos/</code>.</li></ul>
<p>Esto te ayudará a saber dónde está cada cosa y a facilitar el entendimiento del proyecto a otras personas.</p>
<h3 id="formateo">Formateo</h3>
<p>Para que tus archivos sean fáciles de leer y entender:</p>
<ul><li>Usa espacios (2 o 4) para hacer sangrías en el código, evita los tabuladores.</li><li>Si tienes líneas muy largas, divídelas para que sean más fáciles de leer.</li><li>Escribe comentarios para explicar qué hace cada recurso o sección importante.</li><li>Usa espacios y saltos de línea para separar diferentes secciones del código.</li></ul>
<p>Con estos consejos, cualquiera podrá entender tu código más rápidamente.</p>
<h3 id="seguridad">Seguridad</h3>
<p>Aquí van algunos tips para mantener tus proyectos seguros:</p>
<ul><li>Evita poner contraseñas directamente en los archivos. Mejor usa variables de entorno o los secretos de AWS.</li><li>Dale a tus recursos solo los permisos que realmente necesiten para funcionar.</li><li>Si puedes, encripta los discos y volúmenes para proteger los datos.</li><li>Prefiere usar roles y políticas de IAM antes que claves de acceso directas.</li></ul>
<p>Siguiendo estos pasos, minimizarás los riesgos de que alguien no autorizado acceda a tu infraestructura o de que se filtren datos sensibles.</p>
<h2 id="preguntas-relacionadas">Preguntas Relacionadas</h2>
<h3 id="%C2%BFqu%C3%A9-es-aws-terraform%3F">¿Qué es AWS Terraform?</h3>
<p>Terraform es una herramienta que te permite manejar tu infraestructura de tecnología con archivos de texto. Imagina que puedes escribir en un documento cómo quieres que sea tu sistema en la nube, y Terraform lo hace realidad. Funciona con AWS (Amazon Web Services) y otros proveedores de nube, permitiéndote hacer cambios de manera segura y colaborar con tu equipo.</p>
<h3 id="%C2%BFc%C3%B3mo-sabe-terraform-lo-que-tiene-que-hacer-con-mi-infraestructura%3F">¿Cómo sabe Terraform lo que tiene que hacer con mi infraestructura?</h3>
<p>Terraform lleva un registro de todo lo que maneja en un archivo especial llamado "estado". Este archivo le dice a Terraform cómo está configurado todo en la nube. Cuando quieres hacer un cambio, Terraform mira este archivo para saber desde dónde empezar y qué necesita actualizar. Esto ayuda a que los cambios sean precisos y a que varias personas puedan trabajar juntas sin problemas.</p>
<h3 id="%C2%BFqu%C3%A9-tipo-de-lenguaje-utiliza-terraform%3F">¿Qué tipo de lenguaje utiliza Terraform?</h3>
<p>Terraform usa un lenguaje llamado HCL, que es bastante fácil de entender. Con este lenguaje, describes lo que quieres hacer en la nube, como crear una máquina virtual o un espacio de almacenamiento, usando bloques de texto simples. Por ejemplo, para hacer una máquina virtual en AWS, escribirías algo así:</p>
<pre><code>resource "aws_instance" "mi_servidor" {
  ami           = "ami-0c55b159cbfafe1f0"
  instance_type = "t2.micro"
}
</code></pre>
<p>Esto hace que trabajar con infraestructura compleja sea mucho más sencillo.</p>
<h3 id="%C2%BFc%C3%B3mo-implementar-terraform%3F">¿Cómo implementar Terraform?</h3>
<p>Aquí tienes algunos consejos para usar Terraform de manera efectiva:</p>
<ul><li>Divide tu configuración en módulos que puedas usar más de una vez.</li><li>Usa nombres claros y descriptivos para todo.</li><li>Solo usa las variables necesarias y no más.</li><li>Comparte información importante usando salidas.</li><li>Usa fuentes de datos para obtener detalles de la infraestructura existente.</li><li>Trata de no usar scripts personalizados a menos que sea absolutamente necesario.</li><li>Mantén cualquier script adicional bien organizado y separado.</li></ul>
<p>Siguiendo estos pasos, te aseguras de que tu configuración sea fácil de manejar, entender y compartir con otros.</p>
<h2 id="related-posts">Related posts</h2>
<ul><li><a href="https://dondeaprendoaws.com/blog/aws-fundamentos-guia-de-inicio-rapido/">AWS Fundamentos: Guía de Inicio Rápido</a></li><li><a href="https://dondeaprendoaws.com/blog/como-crear-infraestructura-como-codigo-en-aws-con-aws-cloudformation/">Cómo crear Infraestructura como Código en AWS con AWS CloudFormation</a></li><li><a href="https://dondeaprendoaws.com/blog/introduccion-a-serverless-en-aws/">Introducción a Serverless en AWS</a></li><li><a href="https://dondeaprendoaws.com/blog/aws-aprender-guia-inicial/">Aprender AWS: guía inicial</a></li></ul>
