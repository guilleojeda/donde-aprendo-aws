---
title: "Ingeniería de Caos en AWS con Fault Injection Simulator"
description: "Aprende cómo fortalecer tus sistemas en AWS con la ingeniería del caos utilizando AWS Fault Injection Simulator. Descubre los pasos clave y mejores prácticas para mejorar la resiliencia de tus aplicaciones."
publishedAt: "2024-03-09"
publishedTimestamp: "2024-03-09T01:48:43.97Z"
cover: "/assets/blog/0a0b1cf017845abee5cf215d.png"
coverAlt: "Thumbnail for: Ingeniería de Caos en AWS con Fault Injection Simulator"
ogImage: "/assets/blog/0a0b1cf017845abee5cf215d.png"
related:
  - title: "Servicios de AWS para Frontend"
    url: "https://dondeaprendoaws.com/blog/servicios-de-aws-para-frontend/"
    image: "/assets/blog/31bdf1ca2f3b6c51213246c8.jpg"
    imageAlt: ""
  - title: "Mejores Prácticas de Observabilidad en AWS"
    url: "https://dondeaprendoaws.com/blog/mejores-practicas-de-observabilidad-en-aws/"
    image: "/assets/blog/225d18fffd41e9eec388a76e.jpg"
    imageAlt: ""
  - title: "Desarrollo en la nube: fundamentos esenciales"
    url: "https://dondeaprendoaws.com/blog/desarrollo-en-la-nube-fundamentos-esenciales/"
    image: "/assets/blog/9257652addf07f39008f550d.jpg"
    imageAlt: ""
---

<p>Descubre cómo hacer tus sistemas en AWS más fuertes con la ingeniería del caos utilizando <a href="https://aws.amazon.com/es/fis" rel="noopener noreferrer" target="_blank">AWS Fault Injection Simulator</a> (AWS FIS). Este enfoque te permite identificar y arreglar vulnerabilidades antes de que causen problemas reales, asegurándote de que tus aplicaciones puedan manejar situaciones difíciles sin afectar a los usuarios finales. Aquí tienes un resumen rápido de lo que aprenderás:</p>


<ul>
<li><strong>Qué es la ingeniería del caos</strong>: Simular problemas a propósito para ver cómo responde tu sistema.</li>
<li><strong>Importancia</strong>: Te ayuda a identificar y solucionar problemas antes de que ocurran en un entorno real.</li>
<li><strong>Pre-requisitos</strong>: Experiencia en AWS, conocimientos de DevOps, y acceso a AWS FIS.</li>
<li><strong>Cómo configurar y usar AWS FIS</strong>: Desde obtener acceso hasta ejecutar y monitorear experimentos.</li>
<li><strong>Análisis de resultados y estrategias de mejora</strong>: Cómo interpretar los resultados de tus experimentos y mejorar tu sistema.</li>
<li><strong>Mejores prácticas y errores comunes</strong>: Consejos para evitar problemas comunes y sacar el máximo provecho de tus pruebas.</li>
<li><strong>Casos de uso</strong>: Ejemplos de cómo empresas como Netflix y Amazon utilizan la ingeniería del caos.</li>
</ul>


<p>La idea es simple: al probar proactivamente tu sistema bajo condiciones controladas, puedes mejorar su resiliencia y garantizar una experiencia de usuario sin interrupciones, incluso bajo estrés.</p>


<h3 id="importancia-de-la-ingenier%C3%ADa-del-caos" tabindex="-1">Importancia de la ingeniería del caos</h3>


<p>Cuando tienes un montón de computadoras y sistemas trabajando juntos, es complicado saber todo lo que podría salir mal. La ingeniería del caos nos ayuda a probar cómo el sistema maneja los problemas grandes. Al hacer estos 'simulacros', podemos estar más seguros de que nuestro sistema seguirá funcionando bien, incluso cuando las cosas se pongan difíciles. Esto es genial porque significa menos problemas para los usuarios finales.</p>


<h2 id="pre-requisitos" tabindex="-1">Pre-requisitos</h2>


<p>Antes de empezar con AWS Fault Injection Simulator (AWS FIS), necesitas saber y tener algunas cosas:</p>


<h3 id="conocimientos" tabindex="-1">Conocimientos</h3>


<ul>
<li><strong>Experiencia en AWS</strong>: Es útil saber cómo funcionan servicios como EC2, ECS, CloudWatch, etc., para poder configurar y seguir los experimentos de FIS.</li>
<li><strong>Bases de DevOps e ingeniería de confiabilidad</strong>: Si entiendes de infraestructura como código, cómo monitorear sistemas y hacer pruebas, te será más fácil aprovechar FIS.</li>
<li><strong>Cómo monitorear y analizar datos</strong>: Es importante saber configurar alarmas en CloudWatch y entender las métricas antes, durante y después de los experimentos para ver cómo afectan.</li>
</ul>


<h3 id="herramientas" tabindex="-1">Herramientas</h3>


<ul>
<li><strong>Cuenta de AWS</strong>: Necesitas una cuenta de AWS y permisos para usar los servicios que quieres probar con FIS.</li>
<li><strong>Recursos en AWS (EC2, ECS, etc)</strong>: Para que FIS funcione, ya debes tener cosas como instancias EC2 o clústeres ECS funcionando en AWS.</li>
<li><strong>Acceso a <a href="https://aws.amazon.com/es/fis" rel="noopener noreferrer" target="_blank">AWS Fault Injection Simulator</a></strong>: Debes pedir acceso a FIS desde la consola de AWS.</li>
<li><strong>CloudWatch y otras herramientas de monitoreo</strong>: Para seguir el impacto de los experimentos y poner alarmas, necesitas herramientas como CloudWatch, DataDog, New Relic, etc.</li>
</ul>


<h2 id="configuraci%C3%B3n-de-aws-fault-injection-simulator" tabindex="-1">Configuración de AWS Fault Injection Simulator</h2>


<h3 id="acceso-a-aws-fis" tabindex="-1">Acceso a AWS FIS</h3>


<p>Para empezar con AWS Fault Injection Simulator (AWS FIS), primero tienes que pedir acceso en la consola de AWS. Aquí te digo cómo:</p>


<ul>
<li>Entra a la consola de AWS</li>
<li>Busca y entra a la página de AWS FIS</li>
<li>Dale clic a "Activar AWS FIS"</li>
<li>Acepta los términos y condiciones</li>
<li>Elige en qué región de AWS quieres usar el servicio</li>
</ul>


<p>Después de activar AWS FIS, necesitas darle permiso para que pueda trabajar con los recursos que quieres probar. Por ejemplo, si quieres hacer pruebas en tus instancias EC2, AWS FIS necesita permiso para poder encenderlas, apagarlas o terminarlas.</p>


<p>Puedes dar estos permisos de varias maneras:</p>


<ul>
<li>Usando roles y políticas que AWS FIS ya tiene listos</li>
<li>Creando tus propias políticas y roles</li>
<li>Dándole acceso a AWS FIS a cuentas específicas</li>
</ul>


<h3 id="interfaces-de-aws-fis" tabindex="-1">Interfaces de AWS FIS</h3>


<p>AWS FIS te ofrece diferentes maneras de usar el servicio:</p>


<ul>
<li><strong>Consola de administración</strong>: Es una página web donde puedes configurar y hacer tus pruebas. Es lo más fácil para empezar.</li>
<li><strong>CLI</strong>: La línea de comandos te permite usar scripts para configurar y hacer pruebas automáticamente.</li>
<li><strong>SDK</strong>: Los <a href="https://aws.amazon.com/tools/" rel="noopener noreferrer" target="_blank">SDK de AWS</a> te dejan integrar AWS FIS en tus propias aplicaciones.</li>
<li><strong>API</strong>: AWS FIS tiene una API RESTful que puedes usar para hacer llamadas HTTP. Esto es útil si quieres integrarlo con otras herramientas.</li>
</ul>


<p>La manera en que decidas usar AWS FIS depende de lo que necesites. Por ejemplo, la consola web es buena para hacer pruebas de vez en cuando, mientras que la API y los SDK te permiten automatizar más las cosas.</p>


<h2 id="creaci%C3%B3n-de-experimentos" tabindex="-1">Creación de experimentos</h2>


<h3 id="definici%C3%B3n-del-estado-estable" tabindex="-1">Definición del estado estable</h3>


<p>Antes de empezar, es crucial observar cómo se comporta normalmente tu sistema. Esto significa mirar cosas como:</p>


<ul>
<li><strong>Tasas de error y éxito</strong>: cuántas veces las cosas salen bien o mal.</li>
<li><strong>Latencia</strong>: cuánto tardan en hacerse las cosas.</li>
<li><strong>Rendimiento</strong>: cuánto trabajo puede hacer tu sistema en un tiempo determinado.</li>
<li><strong>Saturación</strong>: cuánto están trabajando tus computadoras o redes.</li>
</ul>


<p>Decides qué números son normales para tu sistema. Por ejemplo, si usualmente menos del 5% de las cosas fallan, eso es lo normal.</p>


<p>Cuando haces un experimento, comparas lo que pasa con lo que es normal. Si las cosas cambian mucho, quizás necesites parar y revisar.</p>


<h3 id="formulaci%C3%B3n-de-hip%C3%B3tesis" tabindex="-1">Formulación de hipótesis</h3>


<p>Ahora piensas en qué crees que pasará cuando hagas el experimento. Por ejemplo:</p>


<ul>
<li>Que las cosas falladas suban al 10% pero luego vuelvan a la normalidad en 2 minutos.</li>
<li>Que las cosas se pongan más lentas, pero solo por 5 minutos.</li>
<li>Que no más del 20% de las cosas fallen y que tu sistema siga trabajando casi igual.</li>
</ul>


<p>Estas ideas te ayudan a decidir cuándo podría ser necesario parar el experimento si las cosas se ponen feas.</p>


<h3 id="configuraci%C3%B3n-de-experimentos" tabindex="-1">Configuración de experimentos</h3>


<p>En AWS FIS, necesitas saber tres cosas para hacer un experimento:</p>


<p><strong>Acciones</strong>: qué tipo de problema vas a causar, como apagar computadoras o llenar el disco duro.</p>


<p><strong>Destinos</strong>: en qué computadoras o sistemas vas a causar estos problemas.</p>


<p><strong>Condiciones de detención</strong>: cómo decides si el experimento se está poniendo demasiado riesgoso y necesitas pararlo.</p>


<p>Es mejor empezar poco a poco, como apagar una computadora primero, para ver qué pasa. Luego, puedes probar con más si todo va bien.</p>


<p>Intenta hacer estos experimentos cuando haya menos gente usando tu sistema, para molestar lo menos posible a los usuarios.</p>


<h2 id="ejecuci%C3%B3n-y-monitorizaci%C3%B3n" tabindex="-1">Ejecución y monitorización</h2>


<h3 id="ejecutar-experimentos" tabindex="-1">Ejecutar experimentos</h3>


<p>Para poner en marcha un experimento con AWS Fault Injection Simulator (AWS FIS), haz lo siguiente:</p>


<ul>
<li>Entra a la consola de AWS FIS.</li>
<li>Elige la plantilla de experimento que quieres usar o haz una nueva.</li>
<li>Ajusta las acciones, destinos y condiciones de detención del experimento.</li>
<li>Las <strong>acciones</strong> son los errores que vas a introducir, como apagar instancias EC2 o hacer más lentas las solicitudes.</li>
<li>Los <strong>destinos</strong> son los lugares donde vas a aplicar esas acciones, como en ciertas instancias o grupos.</li>
<li>Las <strong>condiciones de detención</strong> te dicen cuándo parar el experimento si las cosas se complican mucho, por ejemplo, si hay muchos errores o la latencia es demasiado alta.</li>
<li>Cuando todo esté listo, arranca el experimento.</li>
<li>AWS FIS realizará las acciones en los lugares que escogiste.</li>
<li>Mientras ocurre, observa lo que pasa para ver si necesitas detener el experimento.</li>
</ul>


<p>Algunos consejos:</p>


<ul>
<li>Empieza con experimentos pequeños y ve aumentando.</li>
<li>Hazlos cuando tu sistema no esté muy ocupado.</li>
<li>Establece condiciones de detención para limitar problemas.</li>
<li>Ten planes por si necesitas arreglar algo que salga mal.</li>
</ul>


<h3 id="monitorizaci%C3%B3n-en-tiempo-real" tabindex="-1">Monitorización en tiempo real</h3>


<p>Mientras el experimento está en marcha, es clave que veas cómo afecta a tu sistema en el momento.</p>


<p>Cosas que puedes observar:</p>


<ul>
<li><strong>Métricas en CloudWatch</strong>: pon tableros para seguir cosas como errores, latencia, uso, etc.</li>
<li><strong>Registros y trazas</strong>: busca cosas raras en tus registros o trazas.</li>
<li><strong>Alarmas</strong>: pon alarmas que te avisen si algo supera un límite.</li>
<li><strong>Sintéticos</strong>: usa pruebas que imiten a usuarios reales en tu sistema.</li>
<li><strong>Otros tableros</strong>: si usas herramientas como DataDog o NewRelic, también puedes mirar ahí.</li>
</ul>


<p>Si ves que el experimento se está saliendo de control:</p>


<ul>
<li><strong>Para el experimento</strong> desde la consola de AWS FIS.</li>
<li>Aplica tus <strong>planes de arreglo</strong>, como reiniciar sistemas o recursos afectados.</li>
<li><strong>Analiza</strong> qué falló y cómo puedes hacer que tu sistema resista mejor esos errores.</li>
</ul>


<p>Recuerda, la idea no es causar daño, sino encontrar debilidades y hacer tu sistema más fuerte ante problemas. Así que vigila bien y para los experimentos si ves que el impacto es demasiado.</p>


<h2 id="an%C3%A1lisis-de-resultados" tabindex="-1">Análisis de resultados</h2>


<h3 id="interpretaci%C3%B3n-de-resultados" tabindex="-1">Interpretación de resultados</h3>


<p>Después de hacer un experimento con AWS Fault Injection Simulator, es importante mirar qué pasó para entender cómo podemos mejorar. Aquí te dejo unos pasos sencillos:</p>


<ul>
<li>Mira las métricas en CloudWatch o en otras herramientas para ver cómo cambió el comportamiento de tu sistema durante el experimento. Fíjate en las diferencias grandes.</li>
<li>Chequea los registros para encontrar errores o cosas raras que pasaron. Esto te ayuda a entender mejor la situación.</li>
<li>Compara lo que viste con lo que pensabas que iba a pasar. ¿Se comportó tu sistema como esperabas? Si no, piensa en qué fue diferente.</li>
<li>Identifica los problemas que encontraste. Puede ser que tu sistema tuvo muchos errores, se puso lento, o le costó recuperarse.</li>
<li>Escribe qué aprendiste y cómo crees que podrías mejorar tu sistema para que sea más fuerte.</li>
</ul>


<h3 id="estrategias-de-mejora" tabindex="-1">Estrategias de mejora</h3>


<p>Ahora que sabes qué no funcionó tan bien, aquí tienes algunas ideas para mejorar:</p>


<ul>
<li>Añade chequeos de cómo va todo y asegúrate de que tu código pueda intentar de nuevo si algo falla.</li>
<li>Usa más de un recurso para las partes más importantes de tu sistema, como las bases de datos.</li>
<li>Haz que tu sistema pueda crecer automáticamente si necesita manejar más trabajo.</li>
<li>Prepárate mejor para responder rápido si algo no va bien.</li>
<li>Usa más métricas y alarmas para estar al tanto de cómo va todo.</li>
<li>Automatiza cómo arreglar problemas, por ejemplo, con scripts.</li>
<li>Sigue las mejores prácticas recomendadas por AWS.</li>
<li>Haz estos experimentos regularmente, especialmente cuando estés haciendo cambios, para asegurarte de que todo sigue funcionando bien.</li>
</ul>


<p>Escribe los cambios que hagas y prueba de nuevo para ver si solucionaste los problemas. La idea es seguir probando y mejorando para que tu sistema sea cada vez más confiable.</p>


<h2 id="mejores-pr%C3%A1cticas" tabindex="-1">Mejores prácticas</h2>


<h3 id="recomendaciones" tabindex="-1">Recomendaciones</h3>


<p>Cuando uses AWS Fault Injection Simulator para hacer ingeniería del caos, es bueno seguir estos consejos:</p>


<ul>
<li>Empieza probando en un ambiente que no sea de producción antes de hacerlo en el real. Así entiendes mejor qué puede pasar.</li>
<li>Usa CloudWatch para poner métricas y alarmas que te ayuden a ver cómo va el experimento. Si algo sale mal, puedes pararlo rápido.</li>
<li>Pon reglas para que el experimento se detenga solo si las cosas se ponen muy malas, como si hay muchos errores.</li>
<li>Es mejor hacer estas pruebas cuando hay poca gente usando tu sistema, para no afectarlos tanto.</li>
<li>Ten un plan para solucionar problemas rápido si el experimento afecta tu sistema más de lo esperado.</li>
<li>Si puedes, haz que estos experimentos se hagan solos, por ejemplo, como parte de tu proceso de CI/CD.</li>
<li>Después de cada prueba, mira bien los resultados para saber cómo puedes hacer tu sistema más fuerte.</li>
<li>Haz estas pruebas seguido, porque tu sistema siempre está cambiando.</li>
</ul>


<h3 id="errores-comunes" tabindex="-1">Errores comunes</h3>


<p>Evita estos errores comunes:</p>


<ul>
<li>No hagas pruebas muy fuertes sin estar preparado. Podrías causar problemas grandes.</li>
<li>Es importante ver cómo va el experimento mientras se hace, para poder actuar si algo no va bien.</li>
<li>Siempre ten un plan de cómo arreglar cosas si el experimento sale mal.</li>
<li>No empieces probando en el ambiente de producción. Primero hazlo en un lugar controlado.</li>
<li>Es clave mirar los resultados de las pruebas y usar esa información para mejorar.</li>
<li>No dejes de hacer estas pruebas solo porque todo parece estar bien. Siempre hay espacio para mejorar.</li>
</ul>


<h2 id="casos-de-uso" tabindex="-1">Casos de uso</h2>


<h3 id="netflix" tabindex="-1">Netflix</h3>


<p>Netflix usa la ingeniería del caos y AWS Fault Injection Simulator para asegurarse de que su plataforma de streaming funciona bien, incluso cuando hay problemas. Lo que hacen es simular situaciones como perder algunas de las computadoras que entregan los videos o tener errores en los sistemas que guardan la información de los videos. Esto les ayuda a ver cómo reacciona su sistema y a buscar maneras de mejorarlo.</p>


<p>Por ejemplo, probaron qué pasaba si perdían el 20% de las computadoras que entregan videos y descubrieron que su sistema podía manejarlo gracias a cómo está diseñado. También encontraron que, si había problemas con las bases de datos de los videos, necesitaban tener una forma extra de guardar esa información para que los usuarios no tuvieran problemas.</p>


<p>Así, Netflix usa estas pruebas para hacer que su plataforma sea más fuerte y evitar problemas reales.</p>


<h3 id="amazon" tabindex="-1">Amazon</h3>


<p>Amazon también utiliza la ingeniería del caos y AWS Fault Injection Simulator, pero para prepararse para días de mucho movimiento, como el Black Friday. Simulan cosas como un aumento grande en la gente que visita la tienda en línea, lo que pone más carga en los servidores y las bases de datos. Esto les permite ver qué problemas pueden aparecer y arreglarlos antes de que realmente ocurran.</p>


<p>También prueban qué pasaría si fallaran servicios importantes como el procesamiento de pagos o la red de distribución de productos. Esto les ayuda a tener planes listos por si algo no funciona como debería.</p>


<p>Gracias a estas pruebas, Amazon puede manejar bien los días cuando mucha gente compra en línea, asegurando que los clientes tengan una buena experiencia.</p>


<h2 id="conclusi%C3%B3n" tabindex="-1">Conclusión</h2>


<p>La idea de usar la ingeniería del caos y herramientas como AWS Fault Injection Simulator es para hacer nuestros sistemas en la nube más fuertes.</p>


<p>Lo que hacemos es simular problemas a propósito para ver cómo responde nuestro sistema. De esta manera, podemos identificar y arreglar puntos débiles antes de que ocurran problemas reales.</p>


<p>Los pasos que seguimos son básicamente:</p>


<ul>
<li>Observar cómo funciona normalmente nuestro sistema</li>
<li>Pensar cómo creemos que el sistema responderá a los problemas</li>
<li>Preparar los experimentos empezando con cosas pequeñas</li>
<li>Realizar las pruebas y estar atentos a cómo afectan</li>
<li>Revisar los resultados para ver qué podemos mejorar</li>
<li>Hacer cambios y probar de nuevo</li>
</ul>


<p>Al hacer estas pruebas parte de nuestro proceso de trabajo, ayudamos a que nuestros sistemas estén siempre listos para cualquier cosa.</p>


<p>Así nos aseguramos de que los usuarios tengan una experiencia buena y sin interrupciones, incluso cuando las cosas se ponen difíciles. La ingeniería del caos nos enseña a manejar mejor los desafíos de la tecnología en la nube.</p>


<p>
<h2>Related posts</h2>
<ul>
<li><a href="https://dondeaprendoaws.com/blog/aws-aprender-guia-inicial/">Aprender AWS: guía inicial</a></li><li><a href="https://dondeaprendoaws.com/blog/observabilidad-en-aws-con-amazon-x-ray/">Observabilidad en AWS con Amazon X-Ray</a></li><li><a href="https://dondeaprendoaws.com/blog/mejores-practicas-aws-para-devops/">Mejores prácticas AWS para DevOps</a></li><li><a href="https://dondeaprendoaws.com/blog/estrategias-de-recuperacion-de-desastres-en-aws/">Estrategias de Recuperación de Desastres en AWS</a></li>
</ul>
</p>
