---
title: "Cómo Utilizar ElasticSearch en AWS"
description: "Descubre cómo utilizar ElasticSearch en AWS, desde la creación de un dominio hasta la integración con AWS Glue y OpenSearch. Aprende sobre la configuración, seguridad, monitoreo y solución de problemas."
publishedAt: "2024-03-08"
publishedTimestamp: "2024-03-08T13:19:46.73Z"
cover: "/assets/blog/17fe006845acd8b3930b23c8.jpg"
coverAlt: "Thumbnail for: Cómo Utilizar ElasticSearch en AWS"
ogImage: "/assets/blog/17fe006845acd8b3930b23c8.jpg"
related:
  - title: "AWS Organizations: Estructuras de cuentas y nombres"
    url: "https://dondeaprendoaws.com/blog/aws-organizations-estructuras-de-cuentas-y-nombres/"
    image: "/assets/blog/0bc804415b6cb6339123371f.jpg"
    imageAlt: ""
  - title: "Recursos Personalizados en CloudFormation con Lambda"
    url: "https://dondeaprendoaws.com/blog/recursos-personalizados-en-cloudformation-con-lambda/"
    image: "/assets/blog/e66856987698eaa908dfab80.jpg"
    imageAlt: ""
  - title: "Bases de datos Relacionales en AWS con Amazon RDS y Amazon Aurora"
    url: "https://dondeaprendoaws.com/blog/bases-de-datos-relacionales-en-aws-con-amazon-rds-y-amazon-aurora/"
    image: "/assets/blog/a57ee6c77803a35c0e96c332.jpg"
    imageAlt: ""
---

<p>Si estás interesado en <strong>cómo utilizar Elasticsearch en AWS</strong>, has llegado al lugar correcto. A continuación, te presentamos los puntos clave para sacarle el máximo partido a esta poderosa herramienta de búsqueda y análisis en la nube:</p>
<ul><li><strong>Ventajas de usar AWS para Elasticsearch:</strong> Flexibilidad para ajustar recursos, alta disponibilidad, y fácil integración con otros servicios AWS.</li><li><strong>Requisitos previos:</strong> Conocimientos en AWS, Elasticsearch, y herramientas como AWS CLI y cliente REST.</li><li><strong>Creación de un Dominio Elasticsearch en AWS:</strong> Pasos para configurar tu dominio utilizando el servicio Amazon Elasticsearch Service (Amazon ES) o una instalación autogestionada.</li><li><strong>Configuración de Seguridad:</strong> Importancia de la red, control de acceso y cifrado para proteger tu dominio.</li><li><strong>Despliegue y Configuración con soluciones preconfiguradas:</strong> Observabilidad, Enterprise Search y seguridad.</li><li><strong>Integración con AWS Glue y</strong> <a href="https://opensearch.org/"><strong>OpenSearch</strong></a><strong>:</strong> Cómo suscribirse y configurar el conector AWS Glue para OpenSearch.</li><li><strong>Monitorización y Gestión con Kibana:</strong> Acceso, ingesta de datos, y personalización de paneles.</li><li><strong>Solución de problemas:</strong> Consejos para resolver problemas de conectividad y rendimiento del clúster.</li></ul>
<p>En resumen, combinar Elasticsearch con AWS ofrece una solución robusta y flexible para manejar grandes volúmenes de datos, simplificando el análisis y la búsqueda de información. ¡Exploraremos cada uno de estos puntos a continuación!</p>
<h3 id="conocimientos-t%C3%A9cnicos">Conocimientos técnicos</h3>
<ul><li>Saber cómo funciona AWS. Es clave conocer cosas como EC2 (un tipo de servidor), VPC (una red privada en AWS), IAM (manejo de identidades y accesos), entre otros.</li><li>Entender lo básico de Elasticsearch. Conocer qué es un clúster (un conjunto de nodos trabajando juntos), un nodo (un servidor individual en el clúster), un índice (donde se guardan los datos) y los tipos de datos.</li><li>Tener experiencia manejando datos, redes y seguridad.</li></ul>
<h3 id="herramientas-y-software">Herramientas y software</h3>
<ul><li>Una cuenta en AWS. Necesitas registrarte para poder usar los servicios de AWS.</li><li>La consola de administración de AWS. Aquí puedes lanzar y manejar servicios.</li><li>AWS CLI (opcional). Una herramienta para controlar AWS desde la línea de comandos.</li><li>Cliente REST (opcional). Útil para hacer llamadas a los servicios de AWS usando APIs.</li></ul>
<h3 id="conceptos-b%C3%A1sicos-de-elasticsearch">Conceptos básicos de Elasticsearch</h3>
<p>Antes de meterte de lleno con Elasticsearch en AWS, es buena idea entender:</p>
<ul><li>Qué es un clúster de Elasticsearch y cómo se unen los nodos para trabajar.</li><li>Cómo crear índices para organizar y guardar tus datos.</li><li>Los diferentes tipos de datos en Elasticsearch, como texto, números, datos geoespaciales, etc.</li><li>Las configuraciones básicas para nodos y clústeres.</li></ul>
<p>Entender estos puntos te ayudará a sacarle el máximo provecho a Elasticsearch en AWS.</p>
<h2 id="creaci%C3%B3n-de-un-dominio-elasticsearch-en-aws">Creación de un Dominio ElasticSearch en AWS</h2>
<p>Para poner en marcha un dominio de Elasticsearch en AWS, vamos a seguir unos pasos sencillos:</p>
<h3 id="elegir-tipo-de-despliegue">Elegir tipo de despliegue</h3>
<p>Tenemos dos caminos principales para usar Elasticsearch en AWS:</p>
<ul><li><strong>Amazon Elasticsearch Service (Amazon ES):</strong> Es un servicio que AWS maneja por ti. Se encarga de todo el trabajo pesado como configurar, mantener y escalar tus clústeres de Elasticsearch. Es la opción más sencilla si no quieres complicarte.</li><li><strong>Self-managed Elasticsearch:</strong> Aquí, tú instalas y gestionas Elasticsearch en servidores EC2. Esta opción te da más control, pero implica más trabajo de tu parte.</li></ul>
<p>Vamos a usar Amazon ES en este ejemplo, porque simplifica mucho las cosas y AWS se ocupa de la gestión.</p>
<h3 id="especificar-detalles-del-dominio">Especificar detalles del dominio</h3>
<p>En la consola de Amazon ES, llenamos algunos datos para crear nuestro dominio:</p>
<ul><li><strong>Nombre del dominio:</strong> es cómo llamarás a tu clúster.</li><li><strong>Versión de Elasticsearch:</strong> escogemos la versión que queremos usar. Lo mejor es ir por la última versión estable.</li><li><strong>Tipo y número de instancias:</strong> decidimos qué tipo de servidor usar y cuántos necesitamos.</li><li><strong>Almacenamiento:</strong> definimos cuánto espacio en disco y qué tipo de almacenamiento queremos.</li><li><strong>Red VPC:</strong> seleccionamos la red privada virtual de Amazon (VPC) y las subnets para el clúster.</li><li><strong>Grupos de seguridad:</strong> estos grupos nos ayudan a controlar quién puede acceder a nuestro clúster.</li><li><strong>Políticas de acceso:</strong> aquí decidimos quién o qué IPs tienen permiso para conectarse al clúster.</li></ul>
<p>Un ejemplo de cómo quedaría sería:</p>
<ul><li>Nombre de dominio: <code>elasticsearch-demo</code></li><li>Versión ES: <code>7.10</code></li><li>3 instancias <code>m5.large.elasticsearch</code></li><li>20GB de almacenamiento EBS por instancia</li><li>VPC predeterminada</li><li>Grupo de seguridad que limita acceso solo por HTTPS</li><li>Política de acceso basada en IP</li></ul>
<h3 id="revisar-y-lanzar">Revisar y lanzar</h3>
<p>Antes de darle al botón de lanzar, nos aseguramos de que todo esté correcto. Después, lanzamos el dominio. Esto puede tardar unos 10 minutos en estar listo.</p>
<p>Cuando esté listo, ya podemos empezar a meter datos y a usar herramientas como Kibana para buscar, analizar y visualizar nuestra información.</p>
<h2 id="configuraci%C3%B3n-de-seguridad">Configuración de Seguridad</h2>
<p>La seguridad es super importante para mantener tus datos a salvo y controlar quién puede entrar a tu dominio de Elasticsearch. Vamos a ver los puntos clave para configurarla bien:</p>
<h3 id="configuraciones-de-red">Configuraciones de Red</h3>
<p>Tienes que decidir si tu dominio será accesible desde el internet o solo desde una Amazon Virtual Private Cloud (VPC).</p>
<ul><li>Internet: Cualquiera puede intentar acceder. Es importante protegerlo con reglas de quién puede entrar.</li><li>VPC: Es más seguro porque solo la gente dentro de tu red privada puede entrar. Esta es la opción más recomendada.</li></ul>
<p>Si usas VPC, asegúrate de configurar bien quién tiene permiso para acceder.</p>
<h3 id="control-de-acceso">Control de acceso</h3>
<p>Aquí decides quién puede hacer qué dentro de tu dominio. Es buena idea activar el control por roles.</p>
<p>Puedes elegir un usuario principal de dos maneras:</p>
<ul><li>Usuario principal en IAM: Tus solicitudes necesitan una firma especial de AWS. Si borras tu dominio, no pierdes a este usuario.</li><li>Usuario principal en la base de datos interna: Usa un nombre de usuario y contraseña. Si borras el dominio, se borra este usuario también.</li></ul>
<p>Para entrar a Kibana, puedes usar Amazon Cognito, que es un sistema de inicio de sesión seguro.</p>
<h3 id="cifrado">Cifrado</h3>
<p>Es buena idea activar el cifrado:</p>
<ul><li>Cifrado en tránsito con HTTPS para que los datos que se mueven estén protegidos.</li><li>Cifrado en reposo usando AWS Key Management Service (KMS) para proteger los datos guardados.</li></ul>
<h3 id="pol%C3%ADticas-de-acceso">Políticas de acceso</h3>
<p>Pon reglas estrictas sobre quién puede acceder a tu dominio. Puedes limitarlo a ciertas direcciones de internet.</p>
<p>Puedes crear una política que especifique exactamente quién tiene permiso para entrar.</p>
<h2 id="despliegue-y-configuraci%C3%B3n">Despliegue y Configuración</h2>
<h3 id="opciones-preconfiguradas">Opciones preconfiguradas</h3>
<p>Elastic Cloud te ofrece soluciones listas para usar que te ayudan a organizar y entender mejor tus datos en AWS.</p>
<h4 id="elastic-observability">Elastic Observability</h4>
<ul><li>Esta herramienta te ayuda a juntar y entender todos los datos de tu sistema, como registros de actividad y estadísticas, para que puedas detectar y solucionar problemas rápidamente.</li><li>Es como tener una visión completa de cómo funciona tu sistema para asegurarte de que todo marche bien.</li></ul>
<h4 id="elastic-enterprise-search">Elastic Enterprise Search</h4>
<ul><li>Elastic App Search: Te ofrece herramientas para crear búsquedas en tus sitios web y aplicaciones móviles.</li><li>Elastic Workplace Search: Te permite buscar fácilmente información en tus herramientas de trabajo y colaboración.</li></ul>
<h4 id="elastic-security">Elastic Security</h4>
<ul><li>Es una herramienta gratuita que te ayuda a proteger tu sistema contra amenazas, permitiéndote ver y analizar posibles problemas de seguridad.</li><li>Tiene una interfaz fácil de usar y se integra con otras herramientas para que los analistas puedan trabajar mejor.</li></ul>
<h3 id="personalizaci%C3%B3n">Personalización</h3>
<p>Puedes ajustar estas soluciones a tus necesidades:</p>
<ul><li>Aumentar la memoria y capacidad cuando lo necesites.</li><li>Mejorar la forma en que tu sistema maneja fallos.</li><li>Añadir herramientas de aprendizaje automático.</li><li>Elegir el tipo de hardware que mejor se adapte a tus necesidades, como sistemas más rápidos para datos recientes.</li></ul>
<p>Es importante que adaptes la configuración a lo que tu proyecto requiera.</p>
<h2 id="integraci%C3%B3n-con-aws-glue-y-opensearch">Integración con AWS Glue y OpenSearch</h2>
<h3 id="suscribirse-al-conector">Suscribirse al conector</h3>
<p>Para usar AWS Glue con OpenSearch, lo primero es suscribirte al <strong>AWS Glue Connector for Elasticsearch</strong> en <a href="https://aws.amazon.com/marketplace/pp/prodview-v5ygernwn2gb6">AWS Marketplace</a>. Este conector hace que AWS Glue pueda hablar con OpenSearch para mover datos de un lado a otro.</p>
<p>Los pasos son simples:</p>
<ul><li>Ve a la página del producto en <a href="https://aws.amazon.com/marketplace/pp/prodview-v5ygernwn2gb6">AWS Marketplace</a></li><li>Dale clic en "Continue to Subscribe"</li><li>Acepta los términos y condiciones</li><li>Dale clic en "Subscribe"</li></ul>
<p>Una vez que te suscribes, puedes activar el conector en AWS Glue Studio.</p>
<h3 id="habilitar-conector-y-crear-conexi%C3%B3n">Habilitar conector y crear conexión</h3>
<p>Para activar el AWS Glue Connector for Elasticsearch en AWS Glue Studio:</p>
<ul><li>Ve a AWS Glue Studio</li><li>En el menú de la izquierda, busca "Connections"</li><li>Dale clic en "Add connection"</li><li>Elige "AWS Glue Connector for Elasticsearch"</li><li>Llena los detalles de la conexión:</li><li>Nombre de la conexión</li><li>Dirección del clúster OpenSearch</li><li>Puerto (normalmente es <code>443</code>)</li><li>Credenciales para acceder</li><li>Prueba la conexión y guárdala</li></ul>
<p>Ahora puedes usar esta conexión para mover datos entre AWS Glue y OpenSearch.</p>
<h3 id="configurar-trabajo-etl">Configurar trabajo ETL</h3>
<p>Para que AWS Glue pueda usar OpenSearch, necesitas un rol de IAM con permisos específicos.</p>
<p>Sigue estos pasos:</p>
<ul><li>Crea un rol de IAM</li><li>Añade la política "AWSGlueServiceRole"</li><li>Si necesitas permisos extra para OpenSearch, añádelos</li><li>Usa este rol en tu trabajo de AWS Glue Studio</li></ul>
<p>Con este rol listo, puedes crear trabajos de ETL (extraer, transformar, cargar) que usen la conexión a OpenSearch.</p>
<p>Algunos ejemplos de lo que puedes hacer son:</p>
<ul><li>Sacar datos de OpenSearch</li><li>Cambiar o mejorar esos datos</li><li>Volver a ponerlos en OpenSearch o guardarlos en Amazon S3</li></ul>
<p>Así logras que AWS Glue y OpenSearch trabajen juntos perfectamente para tus tareas de ETL.</p>
<h2 id="monitorizaci%C3%B3n-y-gesti%C3%B3n-con-kibana">Monitorización y Gestión con Kibana</h2>
<h3 id="acceso-a-kibana">Acceso a Kibana</h3>
<p>Para entrar a Kibana, usa el nombre de usuario y contraseña del usuario 'elastic' que te dieron cuando armaste tu sistema de ElasticSearch. Estas son las llaves para entrar al sitio web de Kibana.</p>
<p>También, puedes ir directamente por la dirección web (URL) de Kibana que ves en la consola de Elastic Cloud. Al hacerlo, entrarás de manera automática con los permisos del usuario que creó todo.</p>
<p>Si quieres que otros entren, puedes crearles sus propias credenciales. Después, ellos pueden usar el enlace de Kibana, elegir "Iniciar sesión con ElasticSearch" y poner sus datos. Si eres el administrador, también puedes usar este método para entrar con todos los permisos.</p>
<h3 id="ingesta-de-datos">Ingesta de datos</h3>
<p>Kibana te ayuda a recoger y analizar varios tipos de datos para ver cómo va tu sistema ElasticSearch. Puedes usar herramientas como:</p>
<ul><li><strong>Metricbeat:</strong> Recolecta información del sistema, como el uso de CPU, memoria, y red.</li><li><strong>Filebeat:</strong> Sigue los archivos de registro que crean tus sistemas o aplicaciones, como los de Nginx o MySQL.</li><li><strong>Functionbeat:</strong> Te permite enviar datos personalizados usando una función Lambda de AWS, muy útil para datos específicos.</li></ul>
<p>Estas herramientas mandan los datos a ElasticSearch para que los puedas revisar y analizar en Kibana.</p>
<h3 id="panel-y-visualizaciones">Panel y visualizaciones</h3>
<p>En Kibana, puedes armar tableros a tu gusto con gráficos y visualizaciones para ver cómo está funcionando tu sistema ElasticSearch.</p>
<p>Puedes ver cosas como:</p>
<ul><li>Cuánto CPU usan tus nodos</li><li>Qué tan rápido responden a las búsquedas</li><li>Errores al guardar documentos</li><li>Cuántos datos entran y salen</li><li>Cuánto espacio tienes libre</li></ul>
<p>Esto te ayuda a encontrar problemas, ver si hay mucha carga de trabajo en algún punto, o simplemente a estar al tanto de cómo va todo. También puedes poner alertas si algo pasa de ciertos límites.</p>
<p>Kibana también tiene opciones de aprendizaje automático para encontrar cosas raras en los datos que estás viendo.</p>
<h2 id="soluci%C3%B3n-de-problemas">Solución de problemas</h2>
<h3 id="problemas-de-conectividad">Problemas de conectividad</h3>
<p>Si tienes dificultades para conectarte a tu clúster de Elasticsearch, no te preocupes, es algo común. Aquí te dejamos algunas sugerencias para solucionarlo:</p>
<ul><li><strong>Checa tus reglas de seguridad:</strong> Asegúrate de que permitan la entrada desde tu IP a los puertos necesarios, normalmente son el 9200 para HTTP y el 9300 para TCP.</li><li><strong>Usuario y contraseña:</strong> Verifica que estés usando las credenciales correctas. Si usas IAM, el usuario debe tener los permisos adecuados.</li><li><strong>Estado del clúster:</strong> En la consola de Amazon ES, mira si tu clúster y nodos están "verdes" y listos. Si ves colores amarillo o rojo, puede haber un problema.</li></ul>
<p>Si después de esto sigues sin poder conectarte, el soporte de AWS puede ayudarte.</p>
<h3 id="rendimiento-del-cl%C3%BAster">Rendimiento del clúster</h3>
<p>Si notas que tu clúster de Elasticsearch va lento, aquí tienes algunas ideas para mejorar:</p>
<ul><li><strong>Añade más nodos:</strong> Esto reparte el trabajo y puede mejorar la velocidad.</li><li><strong>Usa instancias más grandes:</strong> Cambiar a una instancia con más potencia puede darle a tus nodos más capacidad de trabajo.</li><li><strong>Mejora tus consultas:</strong> Hazlas lo más sencillas posible para que sean más rápidas.</li><li><strong>Más shards:</strong> Tener más shards puede hacer que las operaciones se hagan más rápido.</li><li><strong>Usa warmers:</strong> Esto ayuda a que las consultas que haces a menudo sean más rápidas porque los datos ya están listos.</li></ul>
<p>Amazon ES tiene una herramienta que ajusta automáticamente cosas como los shards para que tu clúster funcione mejor según tus necesidades. No olvides seguir las métricas de rendimiento para ver cómo van tus cambios.</p>
<h2 id="conclusi%C3%B3n">Conclusión</h2>
<p>Usar Elasticsearch con AWS trae muchos beneficios. Nos permite armar sistemas para buscar y analizar datos que son poderosos y que podemos cambiar fácilmente según necesitemos, sin tener que meternos en problemas técnicos.</p>
<p>Aquí te dejamos un resumen de lo más importante que vimos:</p>
<ul><li><strong>Servicios como Amazon ES</strong> nos hacen la vida más fácil al encargarse de lo más complicado, como configurar y mantener nuestro sistema.</li><li>Es clave <strong>entender lo básico</strong> sobre Elasticsearch antes de empezar, para aprovecharlo al máximo.</li><li>La <strong>seguridad</strong> es fundamental. Tenemos que cuidar cómo controlamos el acceso, cómo ciframos los datos y cómo usamos cosas como VPC para proteger nuestra información.</li><li>Hay <strong>opciones ya listas</strong> como Elastic Observability y Elastic Security que nos ayudan a comenzar con buen pie.</li><li>Podemos <strong>ajustar</strong> todo según lo que necesitemos, y AWS nos da las herramientas para hacerlo.</li><li>Al usar Elasticsearch con otros servicios de AWS como <strong>AWS Glue y</strong> <a href="https://opensearch.org/"><strong>OpenSearch</strong></a>, podemos hacer mucho más.</li><li><strong>Kibana</strong> es clave para ver cómo va nuestro sistema, entenderlo mejor e identificar problemas rápidamente.</li></ul>
<p>En pocas palabras, combinar Elasticsearch con AWS es una excelente forma de crear soluciones de análisis de datos fuertes y que podemos cambiar cuando queramos, sin complicarnos la vida. ¡Anímate a probarlo!</p>
<h2 id="preguntas-relacionadas">Preguntas Relacionadas</h2>
<h3 id="%C2%BFqu%C3%A9-se-puede-hacer-con-elasticsearch%3F">¿Qué se puede hacer con Elasticsearch?</h3>
<p>Elasticsearch te permite buscar de muchas maneras, como por texto, por lugar o por números. Puedes hacer preguntas complicadas a tus datos y obtener respuestas rápidas. Aquí van algunos ejemplos:</p>
<ul><li>Buscar en páginas web y apps</li><li>Analizar registros de actividad y números importantes</li><li>Encontrar documentos en una empresa</li><li>Ver datos al momento</li><li>Buscar por lugar</li></ul>
<p>Hay muchas posibilidades. Lo mejor es empezar con algo simple y explorar desde ahí.</p>
<h3 id="%C2%BFqu%C3%A9-es-el-stack-elk%3F">¿Qué es el stack ELK?</h3>
<p>La pila ELK son tres herramientas que trabajan juntas para manejar datos:</p>
<ul><li><strong>Elasticsearch:</strong> Para buscar y analizar datos</li><li><strong>Logstash:</strong> Para recoger y procesar datos</li><li><strong>Kibana:</strong> Para ver los datos y entenderlos mejor</li></ul>
<p>Son muy usadas para entender registros de actividad y números importantes.</p>
<h3 id="%C2%BFqu%C3%A9-es-elastic-cloud%3F">¿Qué es Elastic Cloud?</h3>
<p>Elastic Cloud es un servicio que te permite usar Elasticsearch y otras herramientas de Elastic fácilmente en la nube. Esto significa que es más sencillo de configurar, puede crecer según lo necesites, siempre está disponible, y está optimizado para trabajar en la nube. También se conecta bien con servicios de AWS.</p>
<p>Es una buena opción si quieres hacer las cosas de manera más sencilla.</p>
<h3 id="%C2%BFqu%C3%A9-es-kibana-y-para-qu%C3%A9-sirve%3F">¿Qué es Kibana y para qué sirve?</h3>
<p>Kibana es una herramienta que te ayuda a buscar, ver y entender tus datos en Elasticsearch. Con ella puedes:</p>
<ul><li>Crear tableros de control e informes</li><li>Hacer búsquedas complicadas</li><li>Hacer gráficos y visualizaciones a tu gusto</li><li>Ver tendencias al momento</li><li>Mantener un ojo en cómo funcionan tus sistemas y apps</li></ul>
<p>Kibana te ayuda a sacarle provecho a tus datos en Elasticsearch, permitiéndote entenderlos y actuar rápido.</p>
<h2 id="related-posts">Related posts</h2>
<ul><li><a href="https://dondeaprendoaws.com/blog/nube-aws-guia-de-inicio-rapido/">Nube AWS: Guía de Inicio Rápido</a></li><li><a href="https://dondeaprendoaws.com/blog/introduccion-a-los-servicios-de-amazon-web-services/">Introducción a los servicios de Amazon Web Services</a></li><li><a href="https://dondeaprendoaws.com/blog/aws-aprender-guia-inicial/">Aprender AWS: guía inicial</a></li><li><a href="https://dondeaprendoaws.com/blog/aws-fundamentos-guia-de-inicio-rapido/">AWS Fundamentos: Guía de Inicio Rápido</a></li></ul>
