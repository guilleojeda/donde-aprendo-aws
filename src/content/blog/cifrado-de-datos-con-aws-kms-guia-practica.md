---
title: "Cifrado de datos con AWS KMS: Guía práctica"
description: "Aprende a cifrar y descifrar datos de forma segura en la nube con AWS Key Management Service (KMS). Sigue los pasos detallados y las mejores prácticas para proteger tus datos con AWS KMS."
publishedAt: "2024-05-16"
publishedTimestamp: "2024-05-16T14:36:00.762Z"
cover: "/assets/blog/8879f0457d281038d09e5222.png"
coverAlt: "Thumbnail for: Cifrado de datos con AWS KMS: Guía práctica"
ogImage: "/assets/blog/8879f0457d281038d09e5222.png"
related:
  - title: "Crear un Cluster en Amazon Redshift"
    url: "https://dondeaprendoaws.com/blog/crear-un-cluster-en-amazon-redshift/"
    image: "/assets/blog/2ce2762453f46a717ff15e81.jpg"
    imageAlt: ""
  - title: "10 Preguntas Frecuentes sobre Machine Learning en AWS"
    url: "https://dondeaprendoaws.com/blog/10-preguntas-frecuentes-sobre-machine-learning-en-aws/"
    image: "/assets/blog/5152d1b598aa9df8aaa8e72c.jpg"
    imageAlt: ""
  - title: "Mejores Prácticas Para Amazon EKS"
    url: "https://dondeaprendoaws.com/blog/mejores-practicas-para-amazon-eks/"
    image: "/assets/blog/5db43c07fa6733b870313471.jpg"
    imageAlt: ""
---

<p><a href="https://aws.amazon.com/kms/" rel="noopener noreferrer" target="_blank">AWS Key Management Service</a> (KMS) es un servicio administrado de AWS que permite cifrar y descifrar datos de forma segura en la nube. Esta guía práctica te enseñará cómo configurar y utilizar AWS KMS para proteger tus datos, siguiendo estos pasos:</p>


<ol>
<li>
<p><strong>Configurar AWS KMS</strong></p>
<ul>
<li>
<p>Crear una Clave Maestra del Cliente (CMK)</p>
</li>
<li>
<p>Configurar políticas de clave para controlar el acceso</p>
</li>
<li>
<p>Entender el contexto de cifrado</p>
</li>
</ul>
</li>
<li>
<p><strong>Cifrar datos con AWS KMS</strong></p>
<ul>
<li>
<p>Utilizar la <a href="https://dondeaprendoaws.com/blog/aws-fundamentos-guia-de-inicio-rapido/">Consola de AWS</a></p>
</li>
<li>
<p>Cifrar datos con código (ejemplos en Python y CLI)</p>
</li>
</ul>
</li>
<li>
<p><strong>Descifrar datos con AWS KMS</strong></p>
<ul>
<li>
<p>Utilizar la Consola de AWS</p>
</li>
<li>
<p>Descifrar datos con código (ejemplos en Python y CLI)</p>
</li>
</ul>
</li>
<li>
<p><a href="https://dondeaprendoaws.com/blog/mejores-practicas-aws-para-devops/"><strong>Mejores prácticas</strong></a></p>
<ul>
<li>
<p>Gestión de claves</p>
</li>
<li>
<p><a href="https://dondeaprendoaws.com/blog/aws-seguridad-mejores-practicas/">Prácticas de seguridad</a></p>
</li>
<li>
<p>Optimización del rendimiento</p>
</li>
<li>
<p>Monitoreo y auditoría</p>
</li>
</ul>
</li>
</ol>


<p>Con AWS KMS, puedes cifrar y descifrar datos de forma sencilla y segura, cumpliendo con estándares de seguridad como <a href="https://en.wikipedia.org/wiki/Payment_Card_Industry_Data_Security_Standard" rel="noopener noreferrer" target="_blank">PCI-DSS</a>, <a href="https://en.wikipedia.org/wiki/Health_Insurance_Portability_and_Accountability_Act" rel="noopener noreferrer" target="_blank">HIPAA/HITECH</a> y <a href="https://en.wikipedia.org/wiki/General_Data_Protection_Regulation" rel="noopener noreferrer" target="_blank">GDPR</a>. Sigue las mejores prácticas para proteger tus claves y datos cifrados.</p>


<h2 id="related-video-from-youtube" tabindex="-1">Related video from YouTube</h2>


<iframe allowfullscreen="" loading="lazy" src="https://www.youtube.com/embed/f3APF1dP8w0" title="Video de YouTube"></iframe>
<h2 id="setting-up-aws-kms" tabindex="-1">Setting Up <a href="https://aws.amazon.com/kms/" rel="noopener noreferrer" target="_blank">AWS KMS</a></h2>


<p><figure><img alt="AWS KMS" src="/assets/blog/80d600fcce31a9aa372404ae.jpg"/></figure></p>


<h3 id="crear-una-clave-administrada-por-el-cliente" tabindex="-1">Crear una clave administrada por el cliente</h3>


<p>Para usar AWS KMS, primero debes crear una clave administrada por el cliente (CMK). Puedes hacerlo desde la Consola de administración de AWS o usando las API de AWS KMS.</p>


<p><strong>Crear una clave administrada por el cliente mediante la Consola de administración de AWS</strong></p>


<ol>
<li>
<p>Inicia sesión en la Consola de administración de AWS y ve a la página de AWS KMS.</p>
</li>
<li>
<p>Haz clic en "Crear clave" y selecciona "Clave administrada por el cliente".</p>
</li>
<li>
<p>Elige el tipo de clave (simétrica o asimétrica).</p>
</li>
<li>
<p>Proporciona un nombre y una descripción para la clave.</p>
</li>
<li>
<p>Selecciona la región donde deseas crear la clave.</p>
</li>
<li>
<p>Haz clic en "Crear clave".</p>
</li>
</ol>


<p><strong>Crear una clave administrada por el cliente mediante las API de AWS KMS</strong></p>


<p>Puedes usar las API de AWS KMS para crear una clave administrada por el cliente. Debes proporcionar el tipo de clave, el nombre y la descripción.</p>


<p>Una vez creada la clave, anota el ARN de la clave para futuras operaciones.</p>


<h3 id="configurar-pol%C3%ADticas-de-clave" tabindex="-1">Configurar políticas de clave</h3>


<p>Después de crear una clave administrada por el cliente, debes configurar políticas de clave para controlar quién puede usar la clave y cómo se puede usar.</p>


<p><strong>Crear una política de clave</strong></p>


<p>Puedes crear una política de clave desde la Consola de administración de AWS o usando las API de AWS KMS.</p>


<p><strong>Ejemplo de política de clave</strong></p>


<p>La siguiente política permite a un usuario específico cifrar y descifrar datos:</p>


<pre><code>{
  "Version": "2012-10-17",
  "Id": "key-policy-1",
  "Statement": [
    {
      "Sid": "Enable IAM User Permissions",
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::123456789012:user/username"
      },
      "Action": [
        "kms:Encrypt",
        "kms:Decrypt"
      ],
      "Resource": "*"
    }
  ]
}
</code></pre>


<h3 id="entender-el-contexto-de-cifrado" tabindex="-1">Entender el contexto de cifrado</h3>


<p>El contexto de cifrado es información adicional usada para cifrar y descifrar datos. AWS KMS lo utiliza para autenticar la integridad de los datos cifrados.</p>


<p><strong>Ejemplo de contexto de cifrado</strong></p>


<p>El siguiente es un ejemplo de contexto de cifrado para un objeto en <a href="https://aws.amazon.com/s3/" rel="noopener noreferrer" target="_blank">Amazon S3</a>:</p>


<pre><code>{
  "aws:s3:arn": "arn:aws:s3:::my-bucket/my-object"
}
</code></pre>


<p>Puedes proporcionar un contexto de cifrado adicional usando el encabezado <code class="inline-code">x-amz-server-side-encryption-context</code> en una solicitud de cifrado.</p>


<p>Para resumir, configurar AWS KMS implica:</p>


<ul>
<li>
<p>Crear una clave administrada por el cliente</p>
</li>
<li>
<p>Configurar políticas de clave</p>
</li>
<li>
<p>Entender el contexto de cifrado</p>
</li>
</ul>


<p>Estos pasos son clave para proteger tus datos en la nube.</p>


<h2 id="cifrado-de-datos-con-aws-kms" tabindex="-1">Cifrado de datos con AWS KMS</h2>


<h3 id="usando-la-consola-de-aws" tabindex="-1">Usando la Consola de AWS</h3>


<ol>
<li>
<p>Inicia sesión en la Consola de Administración de AWS y ve a AWS Key Management Service (KMS).</p>
</li>
<li>
<p>En el panel de navegación, selecciona la clave administrada por el cliente que deseas usar.</p>
</li>
<li>
<p>Haz clic en la pestaña "Cifrar" y selecciona "Cifrar datos".</p>
</li>
<li>
<p>Ingresa los datos que deseas cifrar o selecciona un archivo.</p>
</li>
<li>
<p>Opcionalmente, agrega un contexto de cifrado.</p>
</li>
<li>
<p>Haz clic en "Cifrar datos".</p>
</li>
<li>
<p>Copia y guarda el texto cifrado de manera segura.</p>
</li>
</ol>


<h3 id="cifrado-de-datos-con-c%C3%B3digo" tabindex="-1">Cifrado de datos con código</h3>


<p>AWS KMS ofrece SDKs para varios lenguajes de programación. Aquí hay un ejemplo en Python:</p>


<pre><code class="language-python">import boto3

# Crear un cliente de AWS KMS
kms_client = boto3.client('kms')

# Especificar la clave de KMS a utilizar
key_id = 'arn:aws:kms:us-west-2:111122223333:key/1234abcd-12ab-34cd-56ef-1234567890ab'

# Datos a cifrar
plaintext = b'Datos confidenciales'

# Cifrar los datos
response = kms_client.encrypt(
    KeyId=key_id,
    Plaintext=plaintext
)

# El texto cifrado está en la respuesta
ciphertext = response['CiphertextBlob']
</code></pre>


<p>Este código crea un cliente de AWS KMS, especifica la clave, define los datos a cifrar y llama al método <code class="inline-code">encrypt</code> para cifrarlos. El texto cifrado se devuelve en la respuesta.</p>


<h3 id="cifrado-con-la-cli-de-aws" tabindex="-1">Cifrado con la CLI de AWS</h3>


<p>Puedes usar la AWS Command Line Interface (CLI) para cifrar datos con AWS KMS. Aquí hay un ejemplo:</p>


<pre><code>aws kms encrypt \
    --key-id arn:aws:kms:us-west-2:111122223333:key/1234abcd-12ab-34cd-56ef-1234567890ab \
    --plaintext "Datos confidenciales" \
    --output text \
    --query CiphertextBlob
</code></pre>


<p>Este comando usa la clave de KMS especificada para cifrar el texto "Datos confidenciales". El resultado es el texto cifrado en formato base64, que puedes guardar y usar posteriormente para descifrar los datos.</p>


<p>Al cifrar datos con AWS KMS, sigue las mejores prácticas de seguridad, como usar políticas de clave adecuadas, proteger tus claves y datos cifrados, y monitorear el uso de las claves.</p>




<h2 id="decrypting-data-with-aws-kms" tabindex="-1">Decrypting Data with AWS KMS</h2>


<h3 id="using-the-aws-console" tabindex="-1">Using the AWS Console</h3>


<ol>
<li>
<p>Inicia sesión en la Consola de Administración de AWS y ve a AWS Key Management Service (KMS).</p>
</li>
<li>
<p>En el panel de navegación, selecciona la clave que usaste para cifrar los datos.</p>
</li>
<li>
<p>Haz clic en la pestaña "Descifrar" y selecciona "Descifrar datos".</p>
</li>
<li>
<p>Ingresa el texto cifrado o selecciona el archivo cifrado.</p>
</li>
<li>
<p>Si utilizaste un contexto de cifrado, ingrésalo también.</p>
</li>
<li>
<p>Haz clic en "Descifrar datos".</p>
</li>
<li>
<p>Copia y guarda el texto descifrado de manera segura.</p>
</li>
</ol>


<h3 id="decrypting-data-with-code" tabindex="-1">Decrypting Data with Code</h3>


<p>Para descifrar datos con AWS KMS mediante código, puedes utilizar los SDKs de AWS para diferentes lenguajes de programación. Aquí hay un ejemplo en Python:</p>


<pre><code class="language-python">import boto3

# Crear un cliente de AWS KMS
kms_client = boto3.client('kms')

# Texto cifrado
ciphertext = b'...' # Reemplaza con tu texto cifrado

# Descifrar los datos
response = kms_client.decrypt(
    CiphertextBlob=ciphertext
)

# El texto descifrado está en la respuesta
plaintext = response['Plaintext']
</code></pre>


<p>Este código crea un cliente de AWS KMS, define el texto cifrado y llama al método <code class="inline-code">decrypt</code> para descifrarlo. El texto descifrado se devuelve en la respuesta.</p>


<h3 id="decrypting-with-the-aws-cli" tabindex="-1">Decrypting with the AWS CLI</h3>


<p>Puedes usar la AWS Command Line Interface (CLI) para descifrar datos con AWS KMS. Aquí hay un ejemplo:</p>


<pre><code>aws kms decrypt \
    --ciphertext-blob fileb://archivo_cifrado.bin \
    --output text \
    --query Plaintext | base64 --decode &gt; archivo_descifrado.txt
</code></pre>


<p>Este comando utiliza la clave de KMS especificada para descifrar los datos contenidos en el archivo <code class="inline-code">archivo_cifrado.bin</code>. El resultado es el texto descifrado, que se guarda en el archivo <code class="inline-code">archivo_descifrado.txt</code>.</p>


<p>Al descifrar datos con AWS KMS, sigue las mejores prácticas de seguridad, como utilizar políticas de clave adecuadas, proteger tus claves y datos cifrados, y monitorear el uso de las claves.</p>


<h2 id="best-practices-for-aws-kms" tabindex="-1">Best Practices for AWS KMS</h2>


<h3 id="key-management-tips" tabindex="-1">Key Management Tips</h3>


<p>Para administrar claves de manera segura, sigue estas prácticas:</p>


<ul>
<li>
<p><strong>Rotación de claves</strong>: Cambia las claves regularmente para mejorar la seguridad.</p>
</li>
<li>
<p><strong>Etiquetado</strong>: Añade metadatos como propietario, fecha de creación y propósito para facilitar la gestión.</p>
</li>
<li>
<p><strong>Monitoreo</strong>: Vigila el uso de las claves para detectar actividades inusuales.</p>
</li>
</ul>


<h3 id="security-practices" tabindex="-1">Security Practices</h3>


<p>Para proteger tus claves y datos cifrados:</p>


<ul>
<li>
<p><strong>Roles de IAM y políticas</strong>: Controla quién puede acceder a las claves y datos.</p>
</li>
<li>
<p><strong>Protección de datos</strong>: Usa cifrado tanto en tránsito como en reposo para evitar pérdidas o robos.</p>
</li>
</ul>


<h3 id="optimizing-performance" tabindex="-1">Optimizing Performance</h3>


<p>Para mejorar el rendimiento del cifrado y descifrado:</p>


<ul>
<li>
<p><strong>Algoritmo adecuado</strong>: Elige el algoritmo de cifrado que mejor se adapte a tus necesidades.</p>
</li>
<li>
<p><strong>Configuración de la clave</strong>: Ajusta la configuración según sea necesario.</p>
</li>
<li>
<p><strong>Técnicas de optimización</strong>: Utiliza caching y paralelización para acelerar las operaciones.</p>
</li>
</ul>


<h3 id="monitoring-and-auditing" tabindex="-1">Monitoring and Auditing</h3>


<p>Para monitorear y auditar el uso de claves KMS, utiliza:</p>


<ul>
<li>
<p><a href="https://aws.amazon.com/cloudtrail/" rel="noopener noreferrer" target="_blank"><strong>AWS CloudTrail</strong></a>: Registra todas las actividades relacionadas con las claves.</p>
</li>
<li>
<p><a href="https://aws.amazon.com/cloudwatch/" rel="noopener noreferrer" target="_blank"><strong>Amazon CloudWatch</strong></a>: Monitorea el uso y configura alertas para detectar anomalías.</p>
</li>
</ul>


<p>Estas herramientas te ayudarán a mantener un control detallado sobre el uso de tus claves y a detectar posibles problemas de seguridad.</p>


<h2 id="conclusion" tabindex="-1">Conclusion</h2>


<h3 id="puntos-clave" tabindex="-1">Puntos Clave</h3>


<p>Hemos cubierto los conceptos básicos de AWS KMS, incluyendo su configuración, el cifrado y descifrado de datos, y las mejores prácticas para mantener la seguridad de tus claves y datos. AWS KMS es una herramienta útil para proteger tus datos en la nube, pero es crucial seguir las prácticas de seguridad adecuadas para evitar vulnerabilidades.</p>


<h3 id="pr%C3%B3ximos-pasos" tabindex="-1">Próximos Pasos</h3>


<p>Ahora que has completado esta guía, te sugerimos que profundices en las características avanzadas de AWS KMS y cómo aplicarlas en tus proyectos. Consulta la documentación de AWS para obtener más detalles sobre el uso de AWS KMS para proteger tus datos en la nube. Además, explora otros servicios de AWS que se integran con AWS KMS, como Amazon S3 y <a href="https://aws.amazon.com/rds/" rel="noopener noreferrer" target="_blank">Amazon RDS</a>, para mejorar aún más la seguridad de tus datos.</p>


<h2 id="faqs" tabindex="-1">FAQs</h2>


<h3 id="%C2%BFc%C3%B3mo-cifrar-datos-utilizando-aws-kms%3F" tabindex="-1">¿Cómo cifrar datos utilizando AWS KMS?</h3>


<p>Para cifrar datos con AWS KMS, usa el cmdlet <code class="inline-code">Invoke-KMSEncrypt</code>. Devuelve el texto cifrado como un objeto <code class="inline-code">MemoryStream</code> (System.IO.MemoryStream).</p>


<h3 id="%C2%BFqu%C3%A9-es-un-contexto-de-cifrado%3F" tabindex="-1">¿Qué es un contexto de cifrado?</h3>


<p>Un contexto de cifrado es un conjunto de pares clave-valor que añade información adicional sobre los datos. No está cifrado y se usa para autenticar los datos. Debes usar el mismo contexto tanto para cifrar como para descifrar, de lo contrario, el descifrado fallará.</p>


<h3 id="%C2%BFc%C3%B3mo-se-utiliza-el-contexto-de-cifrado-en-aws-kms%3F" tabindex="-1">¿Cómo se utiliza el contexto de cifrado en AWS KMS?</h3>


<p>Puedes añadir un contexto de cifrado usando el encabezado <code class="inline-code">x-amz-server-side-encryption-context</code> en una solicitud <code class="inline-code">s3:PutObject</code>. No incluyas información sensible. Amazon S3 almacena este contexto junto con el contexto predeterminado de <code class="inline-code">aws:s3:arn</code>.</p>


<p>
<h2>Related posts</h2>
<ul>
<li><a href="https://dondeaprendoaws.com/blog/respaldos-y-snapshots-en-ebs/">Respaldos y Snapshots en EBS</a></li><li><a href="https://dondeaprendoaws.com/blog/aws-seguridad-fundamentos-esenciales/">AWS Seguridad: Fundamentos Esenciales</a></li><li><a href="https://dondeaprendoaws.com/blog/comprendiendo-aws-backup/">Comprendiendo AWS Backup</a></li><li><a href="https://dondeaprendoaws.com/blog/mejores-practicas-de-seguridad-en-aws/">Mejores Prácticas de Seguridad en AWS</a></li>
</ul>
</p>
