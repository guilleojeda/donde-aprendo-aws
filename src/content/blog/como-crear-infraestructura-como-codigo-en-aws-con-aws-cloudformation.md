---
title: "Cómo crear Infraestructura como Código en AWS con AWS CloudFormation"
description: "Aprende a crear infraestructura como código en AWS con AWS CloudFormation. Descubre los beneficios, conceptos básicos, pasos previos necesarios y mejores prácticas para automatizar y gestionar tus recursos en la nube."
publishedAt: "2024-03-18"
publishedTimestamp: "2024-03-18T00:54:16.195Z"
cover: "/assets/blog/7b36649641ff19d02f4e3551.jpg"
coverAlt: "Thumbnail for: Cómo crear Infraestructura como Código en AWS con AWS CloudFormation"
ogImage: "/assets/blog/7b36649641ff19d02f4e3551.jpg"
related:
  - title: "Cómo Optimizar la Transferencia de Datos en API Gateway"
    url: "https://dondeaprendoaws.com/blog/como-optimizar-la-transferencia-de-datos-en-api-gateway/"
    image: "/assets/blog/e9e708a78c62050c9930cce4.jpg"
    imageAlt: ""
  - title: "Guía para Crear APIs Serverless con AWS Lambda y API Gateway"
    url: "https://dondeaprendoaws.com/blog/guia-para-crear-apis-serverless-con-aws-lambda-y-api-gateway/"
    image: "/assets/blog/919d108a9faabfb32e4a011d.jpg"
    imageAlt: ""
  - title: "Microservicios en AWS Utilizando AWS Lambda"
    url: "https://dondeaprendoaws.com/blog/microservicios-en-aws-utilizando-aws-lambda/"
    image: "/assets/blog/7db368f44486be089c66ca22.jpg"
    imageAlt: ""
---

<p>En este artículo, exploraremos cómo utilizar <a href="https://aws.amazon.com/es/cloudformation/" rel="noopener noreferrer" target="_blank">AWS CloudFormation</a> para crear y gestionar tu infraestructura en la nube como código (IaC), una práctica que simplifica y automatiza el despliegue de recursos en AWS. Aprenderás los conceptos básicos, beneficios, y cómo empezar con CloudFormation, incluyendo:</p>


<ul>
<li><strong>Automatización y gestión de cambios</strong>: Cómo CloudFormation te permite automatizar la infraestructura y gestionar cambios de forma ordenada.</li>
<li><strong>Consistencia y eficiencia</strong>: La importancia de mantener una infraestructura consistente y cómo CloudFormation mejora la eficiencia en el despliegue de recursos.</li>
<li><strong>Escalabilidad y portabilidad</strong>: Cómo CloudFormation facilita la escalabilidad y portabilidad de tu infraestructura.</li>
<li><strong>Conceptos básicos</strong>: Entenderás qué son las plantillas, pilas, y cómo utilizarlas para crear tu infraestructura.</li>
<li><strong>Pasos previos necesarios</strong>: Desde tener una cuenta de AWS hasta conocimientos básicos de YAML/JSON.</li>
<li><strong>Creación de una plantilla sencilla</strong>: Aprenderás a definir recursos como buckets de S3 y políticas de IAM en una plantilla.</li>
<li><strong>Despliegue y actualización de la plantilla</strong>: Instrucciones para desplegar y actualizar tu infraestructura utilizando tanto la consola de AWS como AWS CLI.</li>
<li><strong>Mejores prácticas con AWS CloudFormation</strong>: Consejos para reutilizar plantillas, separar entornos, realizar pruebas y más.</li>
</ul>


<p>Este artículo es una guía completa para empezar con Infraestructura como Código en AWS usando CloudFormation, dirigido a aquellos que buscan automatizar y optimizar la gestión de sus recursos en la nube.</p>


<h3 id="consistencia" tabindex="-1">Consistencia</h3>


<p>Con CloudFormation, defines todo lo que necesitas para tu proyecto en archivos especiales. Esto ayuda a que todo sea igual cada vez que lo usas, y si hay problemas, es fácil ver qué cambió de una versión a otra. Como todo se hace con estos archivos, no hay errores por hacer cosas a mano.</p>


<h3 id="eficiencia" tabindex="-1">Eficiencia</h3>


<p>CloudFormation hace todo el trabajo pesado por ti. En vez de armar cada parte de tu proyecto paso a paso, usas una plantilla que lo hace todo de una vez. Esto te ahorra un montón de tiempo.</p>


<h3 id="escalabilidad" tabindex="-1">Escalabilidad</h3>


<p>Si necesitas que tu proyecto sea más grande o más pequeño, solo cambias un par de cosas en la plantilla y listo. Esto significa que puedes ajustar tu proyecto rápidamente sin tener que hacerlo todo manualmente.</p>


<h3 id="portabilidad" tabindex="-1">Portabilidad</h3>


<p>Puedes usar las mismas plantillas para poner en marcha tu proyecto en diferentes lugares dentro de AWS. Esto es genial si estás probando cosas o si necesitas tener una copia de seguridad lista para usar.</p>


<p>En resumen, CloudFormation te hace la vida más fácil si trabajas con AWS, ayudándote a automatizar, mantener todo organizado, crecer cuando lo necesitas y mover tu proyecto donde quieras.</p>


<h2 id="conceptos-b%C3%A1sicos-de-aws-cloudformation" tabindex="-1">Conceptos básicos de AWS CloudFormation</h2>


<p>AWS CloudFormation te ayuda a poner en marcha y organizar tus servicios en AWS de manera fácil. Aquí tienes algunos puntos clave que debes conocer:</p>


<h3 id="plantillas" tabindex="-1">Plantillas</h3>


<p>Las plantillas de CloudFormation son como recetas que te dicen cómo armar tus servicios en AWS. Pueden estar en formato JSON o YAML y en ellas especificas:</p>


<ul>
<li>Los servicios o recursos que necesitas (como servidores virtuales, espacios de almacenamiento, etc).</li>
<li>Cómo quieres que sean esos servicios (por ejemplo, qué tan grandes, quién puede acceder a ellos, etc).</li>
<li>Si un servicio depende de otro para funcionar.</li>
</ul>


<p>Cuando creas algo usando una plantilla, CloudFormation se encarga de preparar todo por ti, respetando el orden y las dependencias.</p>


<h3 id="pilas" tabindex="-1">Pilas</h3>


<p>Una pila es simplemente un grupo de servicios de AWS que manejas juntos.</p>


<p>Al usar una plantilla para crear una pila en CloudFormation, estás armando un conjunto de servicios definidos en esa plantilla. Esto es útil porque:</p>


<ul>
<li>Puedes montar, actualizar o quitar todos los servicios de una aplicación de una sola vez.</li>
<li>Es fácil copiar y usar la misma configuración en diferentes partes de AWS.</li>
<li>Te ayuda a llevar un registro de los cambios en tus servicios.</li>
</ul>


<p>En resumen, las pilas hacen que sea mucho más sencillo manejar infraestructuras complejas en la nube.</p>


<h2 id="requisitos-previos" tabindex="-1">Requisitos previos</h2>


<p>Antes de empezar a usar AWS CloudFormation para crear tu infraestructura como código, hay algunas cosas que necesitas tener listas:</p>


<h3 id="cuenta-de-aws" tabindex="-1">Cuenta de AWS</h3>


<p>Primero que nada, necesitas una cuenta en AWS. Puedes elegir entre una cuenta gratis o una de pago, dependiendo de lo que necesites. Si eliges la opción gratuita, podrás usar algunos servicios de AWS sin costo durante 12 meses.</p>


<p>Una vez que tengas tu cuenta, crea un usuario en IAM (el servicio de gestión de identidades y accesos de AWS) y dale los permisos necesarios para trabajar con CloudFormation. Esto incluye permisos para crear, cambiar y borrar pilas.</p>


<h3 id="aws-cli" tabindex="-1">AWS CLI</h3>


<p>La AWS CLI es una herramienta que te permite controlar los servicios de AWS desde la línea de comandos, lo que es genial para automatizar procesos con CloudFormation.</p>


<p>Instala la AWS CLI en tu computadora y configúrala con tus credenciales de AWS. Así podrás empezar a usar comandos de CloudFormation.</p>


<h3 id="sdk-de-aws" tabindex="-1">SDK de AWS</h3>


<p>Si planeas usar CloudFormation con código, como en un programa, necesitarás el SDK de AWS para el lenguaje de programación que estés usando (como Java, Python o JavaScript).</p>


<p>El SDK te da acceso a las funciones de CloudFormation para que puedas crear, cambiar y borrar pilas desde tu código.</p>


<h3 id="editor-de-texto" tabindex="-1">Editor de texto</h3>


<p>Para escribir tus plantillas de CloudFormation, usa un editor de texto como Visual Studio Code. Hay una extensión para CloudFormation que te ayuda con el resaltado de sintaxis y el autocompletado, haciéndote la vida más fácil.</p>


<h3 id="conocimientos-b%C3%A1sicos-de-yaml%2Fjson" tabindex="-1">Conocimientos básicos de YAML/JSON</h3>


<p>Es importante saber un poco de YAML o JSON, ya que son los formatos en los que escribirás tus plantillas de CloudFormation. Si no estás familiarizado con ellos, sería bueno aprender un poco sobre su sintaxis antes de empezar.</p>


<p>Con estos pasos cubiertos, estarás listo para empezar a trabajar con infraestructura como código en AWS usando CloudFormation.</p>


<h2 id="creaci%C3%B3n-de-una-plantilla-sencilla" tabindex="-1">Creación de una plantilla sencilla</h2>


<h3 id="estructura-de-la-plantilla" tabindex="-1">Estructura de la plantilla</h3>


<p>Una plantilla de CloudFormation es como una receta que AWS sigue para crear tu infraestructura. Se divide en cuatro partes importantes:</p>


<ul>
<li><strong>AWSTemplateFormatVersion:</strong> Es como decirle a AWS qué idioma hablas. Por lo general, se usa la versión más reciente.</li>
<li><strong>Description:</strong> Aquí escribes para qué sirve tu plantilla, como una breve explicación.</li>
<li><strong>Resources:</strong> El corazón de la plantilla. Aquí le dices a AWS qué cosas necesitas, como servidores o espacios para guardar archivos.</li>
<li><strong>Outputs:</strong> Son los resultados que obtienes, como el nombre o la dirección de lo que creaste.</li>
</ul>


<h3 id="definici%C3%B3n-de-recursos" tabindex="-1">Definición de recursos</h3>


<p>Veamos un ejemplo simple de cómo crear un espacio para guardar archivos (bucket de S3) y una regla de seguridad (política de IAM) usando YAML:</p>


<pre><code>Resources:

  S3Bucket:
    Type: AWS::S3::Bucket
    Properties:
      BucketName: mi-bucket-unico

  BucketPolicy:
    Type: AWS::S3::BucketPolicy
    Properties:
      Bucket: !Ref S3Bucket
      PolicyDocument:
        Version: 2012-10-17
        Statement:
          - Sid: PublicReadForGetBucketObjects
            Effect: Allow
            Principal: "*"
            Action: "s3:GetObject"
            Resource: !Join ["", ["arn:aws:s3:::", !Ref S3Bucket, /*]]
</code></pre>


<h3 id="validaci%C3%B3n-de-la-plantilla" tabindex="-1">Validación de la plantilla</h3>


<p>Antes de poner en marcha tu plantilla, es buena idea asegurarte de que está bien escrita. Puedes hacerlo con este comando:</p>


<pre><code>aws cloudformation validate-template --template-body file://plantilla.yml
</code></pre>


<p>Esto te ayuda a encontrar y arreglar errores antes de crear algo con ella.</p>


<h2 id="despliegue-de-la-plantilla" tabindex="-1">Despliegue de la plantilla</h2>


<p>Para poner en marcha la plantilla de CloudFormation que hemos preparado, podemos hacerlo de dos maneras: a través de la página web de AWS o usando comandos en la computadora. Vamos a ver cómo se hace en cada caso:</p>


<h3 id="despliegue-mediante-la-consola" tabindex="-1">Despliegue mediante la consola</h3>


<ul>
<li>Primero, entramos a la página de AWS y buscamos el servicio de CloudFormation.</li>
<li>Luego, hacemos clic en "Crear pila".</li>
<li>Seleccionamos "Cargar un archivo de plantilla" y escogemos el archivo que contiene nuestra plantilla, ya sea en formato YAML o JSON.</li>
<li>Completamos la información que se nos pide y damos clic en "Siguiente".</li>
<li>Le ponemos un nombre a nuestra pila y, si es necesario, ajustamos algunas configuraciones adicionales.</li>
<li>Finalmente, hacemos clic en "Siguiente" y luego en "Crear pila" para empezar el proceso.</li>
</ul>


<p>Después de un rato, podremos ver en la página de CloudFormation cómo va todo y qué se ha creado.</p>


<h3 id="despliegue-mediante-aws-cli" tabindex="-1">Despliegue mediante AWS CLI</h3>


<p>Si preferimos usar la línea de comandos, podemos hacerlo con el siguiente comando:</p>


<pre><code>aws cloudformation create-stack --stack-name mi-pila \
                               --template-body file://plantilla.yml \
                               --parameters ParameterKey=NombreParametro,ParameterValue=valor \
                               --region us-east-1
</code></pre>


<p>Lo que necesitamos saber aquí es:</p>


<ul>
<li><strong>stack-name</strong>: Cómo queremos llamar a nuestra pila</li>
<li><strong>template-body</strong>: Dónde está el archivo de nuestra plantilla</li>
<li><strong>parameters</strong>: Los detalles específicos que nuestra plantilla necesita</li>
<li><strong>region</strong>: En qué parte de AWS queremos que esto se ejecute</li>
</ul>


<p>Una vez que damos este comando, podemos seguir el progreso directamente desde la línea de comandos o revisar en la página de CloudFormation para ver cómo va todo.</p>




<h2 id="actualizaci%C3%B3n-de-la-plantilla" tabindex="-1">Actualización de la plantilla</h2>


<p>Después de que ya tengas tu plantilla de AWS CloudFormation funcionando y los recursos creados en AWS, puede que necesites hacer algunos cambios más adelante. Por ejemplo, si creaste un espacio de almacenamiento (bucket de S3) para un sitio web, tal vez luego quieras agregarle un nombre de dominio para que la gente pueda encontrar tu sitio fácilmente.</p>


<p>Para hacer estos cambios, tienes dos opciones:</p>


<ul>
<li>Editar directamente la plantilla que ya usaste, añadiendo los cambios necesarios y luego actualizar la infraestructura que ya tienes.</li>
<li>Hacer una nueva plantilla solo con los cambios y luego combinarla con lo que ya tienes.</li>
</ul>


<h3 id="opci%C3%B3n-1%3A-editar-la-plantilla-original" tabindex="-1">Opción 1: Editar la plantilla original</h3>


<p>Editar la plantilla original es práctico porque mantienes todo organizado en un solo lugar. Los pasos a seguir serían:</p>


<ul>
<li>Abre la plantilla en tu editor de texto.</li>
<li>Añade un nuevo recurso. Por ejemplo, para añadir un nombre de dominio con Route 53 que apunte a tu espacio de S3, lo harías así:</li>
</ul>


<pre><code>Recursos:

  SitioWeb:
    Type: AWS::Route53::RecordSet
    Properties:
      HostedZoneName: mi-dominio.com
      Name: mi-sitio.mi-dominio.com
      Type: CNAME
      TTL: '900'
      ResourceRecords:
        - !GetAtt S3Bucket.DomainName
</code></pre>


<ul>
<li>Guarda los cambios.</li>
<li>Actualiza tu infraestructura con este comando:</li>
</ul>


<pre><code>aws cloudformation update-stack --stack-name mi-pila --template-body file://plantilla-editada.yml
</code></pre>


<ul>
<li>AWS CloudFormation se encargará de hacer los cambios por ti, incluyendo añadir el nombre de dominio.</li>
</ul>


<h3 id="opci%C3%B3n-2%3A-unir-pilas" tabindex="-1">Opción 2: Unir pilas</h3>


<p>Si prefieres, puedes dejar tu infraestructura como está y crear una nueva plantilla con solo los cambios. Después, puedes hacer que ambas trabajen juntas. Esto sería así:</p>


<ul>
<li>Haz una nueva plantilla llamada <code class="inline-code">plantilla-dns.yml</code> con el recurso de Route 53 que quieres añadir.</li>
<li>Usa esta nueva plantilla para crear una nueva infraestructura llamada <code class="inline-code">mi-pila-dns</code>.</li>
<li>Une esta nueva parte con la anterior usando este comando:</li>
</ul>


<pre><code>aws cloudformation stack-set operation start --operation-preferences RegionConcurrencyType=parallel --operation-id unirPilas

--stack-set-name mi-pila-unida --accounts 123456789012 --regions us-east-1
</code></pre>


<ul>
<li>Esto hará que los recursos de ambas partes trabajen juntos, como el nombre de dominio apuntando al espacio de S3.</li>
</ul>


<p>En resumen, puedes elegir entre actualizar una sola infraestructura o combinar varias para manejar los cambios. Ambas son buenas opciones, así que elige la que mejor se ajuste a lo que necesitas.</p>


<h2 id="eliminaci%C3%B3n-de-recursos" tabindex="-1">Eliminación de recursos</h2>


<p>Cuando ya no necesitas los recursos que creaste con AWS CloudFormation, es una buena idea borrarlos para evitar gastos que no necesitas. Afortunadamente, eliminar estos recursos es fácil gracias a cómo CloudFormation maneja la infraestructura.</p>


<p>Para borrar una pila de CloudFormation y todos los recursos que contiene, tienes dos opciones principales:</p>


<h3 id="1.-eliminar-la-pila-desde-la-consola-de-aws" tabindex="-1">1. Eliminar la pila desde la consola de AWS</h3>


<p>Para hacerlo desde el sitio web de AWS, sigue estos pasos:</p>


<ul>
<li>Entra a la consola de CloudFormation</li>
<li>Escoge la pila que quieres eliminar</li>
<li>Haz clic en "Eliminar"</li>
<li>Confirma que realmente quieres borrar la pila</li>
</ul>


<p>CloudFormation se encargará de deshacerse de todos los recursos que creó esa pila de forma ordenada.</p>


<h3 id="2.-usar-aws-cli" tabindex="-1">2. Usar AWS CLI</h3>


<p>Si prefieres, puedes borrar una pila usando la línea de comandos con este comando:</p>


<pre><code>aws cloudformation delete-stack --stack-name mi-pila
</code></pre>


<p>Solo tienes que indicar el nombre de la pila que creaste.</p>


<p>El proceso de borrado puede tardar un poco, ya que CloudFormation necesita terminar cada recurso correctamente antes de eliminarlo. Puedes ver cómo va el proceso desde la consola o usando el comando <code class="inline-code">describe-stacks</code>.</p>


<p>Una vez que termine, la pila y todos sus recursos desaparecerán de tu cuenta de AWS. Así de fácil es mantener todo bajo control con infraestructura como código.</p>


<h2 id="mejores-pr%C3%A1cticas-con-aws-cloudformation" tabindex="-1">Mejores prácticas con AWS CloudFormation</h2>


<p>Usar AWS CloudFormation puede hacerte la vida mucho más fácil cuando trabajas con infraestructura en AWS. Pero, como cualquier herramienta, hay formas de usarla que te dan mejores resultados. Aquí van algunos consejos sencillos:</p>


<h3 id="reutiliza-plantillas-y-c%C3%B3digo" tabindex="-1">Reutiliza plantillas y código</h3>


<ul>
<li>Intenta tener plantillas básicas que puedas usar varias veces. Por ejemplo, una plantilla para armar una red virtual o crear permisos de acceso.</li>
<li>Aprovecha los <a href="https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/modules.html" rel="noopener noreferrer" target="_blank">módulos</a> para agrupar partes de tus plantillas que usas mucho y así usarlas en diferentes lugares sin repetir código.</li>
<li>Para compartir código entre plantillas, puedes usar <a href="https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-stack.html" rel="noopener noreferrer" target="_blank">pilas anidadas</a>.</li>
</ul>


<h3 id="separaci%C3%B3n-de-entornos" tabindex="-1">Separación de entornos</h3>


<ul>
<li>Es buena idea tener pilas separadas para cada etapa de tu proyecto, como desarrollo, pruebas y producción. Esto te ayuda a evitar errores en lugares donde no deberían pasar.</li>
<li>Utiliza parámetros para ajustar detalles que cambian entre un entorno y otro, como el tamaño de los servidores o los nombres de los recursos.</li>
</ul>


<h3 id="pruebas" tabindex="-1">Pruebas</h3>


<ul>
<li>Antes de poner en marcha tus plantillas, usa el comando <code class="inline-code">aws cloudformation validate-template</code> para asegurarte de que todo está correcto.</li>
<li>Prueba tus plantillas en entornos de prueba antes de usarlas en producción.</li>
<li>Piensa en incluir pruebas automáticas para tus plantillas.</li>
</ul>


<h3 id="par%C3%A1metros" tabindex="-1">Parámetros</h3>


<ul>
<li>Intenta que tus plantillas tengan muchos parámetros para que puedas usarlas en diferentes situaciones.</li>
<li>Define valores por defecto para esos parámetros y así hacer más fácil el uso de las plantillas.</li>
<li>Cuando puedas, limita los valores que se pueden elegir para los parámetros y así evitar errores.</li>
</ul>


<p>Siguiendo estos consejos, podrás sacarle más provecho a CloudFormation y hacer tu trabajo con AWS más seguro y eficiente.</p>


<h2 id="resumen" tabindex="-1">Resumen</h2>


<p>Hemos aprendido cómo usar CloudFormation de AWS para manejar nuestra infraestructura en la nube usando código, en lugar de hacerlo manualmente. Aquí hay un repaso rápido:</p>


<ul>
<li>Con CloudFormation, podemos describir lo que necesitamos en AWS (como servidores o bases de datos) en archivos de texto.</li>
<li>Una 'plantilla' es básicamente un archivo que dice qué y cómo queremos nuestros recursos.</li>
<li>Cuando creamos una 'pila', estamos poniendo en marcha todo lo que describimos en la plantilla.</li>
<li>Podemos actualizar o combinar plantillas para hacer cambios en nuestra infraestructura.</li>
<li>Si ya no necesitamos esos recursos, podemos eliminar la pila y todo se borrará de forma ordenada.</li>
</ul>


<p>Usar CloudFormation nos ayuda a trabajar más rápido, asegurarnos de que todo se hace de la misma manera cada vez, y facilita el crecimiento o la duplicación de nuestros entornos.</p>


<p>Algunos consejos importantes son:</p>


<ul>
<li>Trata de usar las mismas plantillas para diferentes proyectos.</li>
<li>Mantén separados los ambientes de desarrollo, prueba y producción.</li>
<li>Siempre revisa tus plantillas antes de usarlas para evitar errores.</li>
<li>Usa parámetros en tus plantillas para que sean más flexibles.</li>
</ul>


<p>En pocas palabras, CloudFormation nos permite manejar nuestra infraestructura en AWS de una manera organizada y eficiente, siguiendo las prácticas de Infraestructura como Código.</p>


<h2 id="preguntas-relacionadas" tabindex="-1">Preguntas Relacionadas</h2>


<h3 id="%C2%BFqu%C3%A9-servicio-de-aws-permite-administrar-la-infraestructura-usando-c%C3%B3digo%3F" tabindex="-1">¿Qué servicio de AWS permite administrar la infraestructura usando código?</h3>


<p>AWS CloudFormation te ayuda a crear y manejar recursos de AWS usando archivos de texto, lo cual es mucho más rápido que hacerlo a mano. Esto es parte de lo que llamamos infraestructura como código.</p>


<h3 id="%C2%BFqu%C3%A9-significa-infraestructura-como-c%C3%B3digo%3F" tabindex="-1">¿Qué significa infraestructura como código?</h3>


<p>Infraestructura como código es una forma de configurar y manejar computadoras y otros dispositivos de red usando archivos de texto, en lugar de hacerlo manualmente. Esto hace que todo el proceso sea más rápido y menos propenso a errores.</p>


<h3 id="%C2%BFqu%C3%A9-formatos-de-archivo-puedo-usar-con-aws-cloudformation%3F" tabindex="-1">¿Qué formatos de archivo puedo usar con AWS CloudFormation?</h3>


<p>Con AWS CloudFormation, puedes usar JSON o YAML, que son dos tipos de archivos de texto, para describir cómo quieres que sea tu infraestructura de AWS.</p>


<h3 id="%C2%BFqu%C3%A9-papel-juega-la-infraestructura-como-c%C3%B3digo-en-devops%3F" tabindex="-1">¿Qué papel juega la infraestructura como código en DevOps?</h3>


<p>En DevOps, la infraestructura como código permite usar archivos de texto para definir y configurar la infraestructura necesaria para desarrollar, probar y lanzar software. Esto ayuda a automatizar procesos y hacer todo más eficiente.</p>


<p>
<h2>Related posts</h2>
<ul>
<li><a href="https://dondeaprendoaws.com/blog/nube-aws-guia-de-inicio-rapido/">Nube AWS: Guía de Inicio Rápido</a></li><li><a href="https://dondeaprendoaws.com/blog/mejores-practicas-aws-para-devops/">Mejores prácticas AWS para DevOps</a></li><li><a href="https://dondeaprendoaws.com/blog/introduccion-a-serverless-en-aws/">Introducción a Serverless en AWS</a></li><li><a href="https://dondeaprendoaws.com/blog/aws-aprender-guia-inicial/">Aprender AWS: guía inicial</a></li>
</ul>
</p>
