---
title: "Amazon CloudFront: qué es, cómo funciona y cómo configurarlo"
description: "Qué hace Amazon CloudFront, cómo funcionan su caché y sus orígenes, y cómo conectarlo a un bucket S3 privado con OAC y HTTPS."
author: "guille-ojeda"
publishedAt: "2024-03-07"
publishedTimestamp: "2024-03-07T23:58:11.718Z"
modifiedTimestamp: "2026-10-05T00:15:07-03:00"
cover: "/assets/blog/editorial-fundamentos.png"
coverAlt: "Un libro abierto junto a un camino azul con estaciones y un punto naranja."
ogImage: "/assets/blog/editorial-fundamentos.png"
related:
  - title: "Costos de red en AWS: 10 estrategias para reducir la factura"
    url: "https://dondeaprendoaws.com/blog/10-estrategias-para-optimizar-costos-de-red-en-aws/"

---

Amazon CloudFront es el servicio de red de entrega de contenido (CDN) de AWS. Recibe solicitudes en puntos de presencia distribuidos, responde desde una copia vigente cuando puede y consulta el origen cuando necesita el objeto. Esto puede reducir la latencia y las solicitudes que llegan al origen; no vuelve automáticamente más rápida cualquier aplicación ni hace privado su origen. [AWS explica el recorrido de una solicitud y el uso de cachés regionales en la guía de CloudFront](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/HowCloudFrontWorks.html).

## Qué hace CloudFront y qué configuras

Una distribución de CloudFront conecta a quienes visitan tu sitio con uno o más orígenes: las fuentes que conservan la versión definitiva del contenido. Un origen puede ser un bucket de Amazon S3, un servidor HTTP o una aplicación. La distribución decide a qué origen dirigir cada ruta, qué métodos aceptar, cómo usar HTTPS y qué respuestas guardar en caché.

El recorrido típico es:

1. El navegador solicita un objeto, por ejemplo, una imagen o una página HTML.
2. DNS dirige la solicitud al punto de presencia de CloudFront que puede atenderla con menor latencia.
3. CloudFront compara la solicitud con su clave de caché. Si encuentra una copia vigente, responde desde la caché.
4. Si la copia no existe o venció, CloudFront consulta el origen definido para ese comportamiento. Puede pasar por una caché regional antes de llegar al origen. La respuesta vuelve al navegador y puede quedar en caché según la configuración.

Un **acierto de caché** evita una consulta al origen; un **fallo de caché** requiere obtener el objeto. Las ubicaciones de borde no forman un único almacén global: una ubicación puede no tener una copia que otra sí tenga. Por eso el resultado depende de la ruta, la clave y la vigencia de cada objeto.

### Orígenes, comportamientos y políticas

En una distribución, cada **origen** es una fuente de contenido. Los **comportamientos de caché** asocian patrones de ruta —por ejemplo, <code>/assets/*</code>— con un origen y sus reglas. Una distribución puede entregar archivos estáticos y también dirigir rutas dinámicas a una aplicación, aunque eso no significa que deba guardar todas las respuestas.

Una **política de caché** define el tiempo de vida (TTL) y qué valores de la solicitud forman la clave: por defecto, el dominio de la distribución y la ruta del objeto. Puedes agregar parámetros de consulta, encabezados o cookies cuando cambien la respuesta. Si agregas variaciones innecesarias, CloudFront guarda copias separadas y puede bajar la proporción de aciertos. Si el origen necesita recibir un dato que no cambia la respuesta, una política de solicitudes al origen puede reenviarlo sin sumarlo a la clave. AWS detalla estas [claves de caché](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/understanding-the-cache-key.html) y [políticas de caché y TTL](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/cache-key-understand-cache-policy.html).

El origen también puede indicar cuánto conservar un objeto con encabezados como <code>Cache-Control</code>. Los TTL mínimo, predeterminado y máximo de la política limitan cómo se aplican esas indicaciones. Revisa el TTL mínimo: si es mayor que cero, CloudFront puede mantener un objeto ese tiempo aunque el origen envíe <code>no-cache</code>, <code>no-store</code> o <code>private</code>.

Como criterio inicial para un sitio estático:

- A los archivos con nombre versionado —por ejemplo, <code>app.a83f1.js</code>— puedes darles un TTL largo si cada cambio genera una ruta nueva.
- Para <code>index.html</code>, que apunta a esos archivos, conviene planear una vigencia corta o revalidación para que un despliegue nuevo no conserve referencias anteriores.
- No compartas respuestas personalizadas entre usuarios. Si una respuesta depende de identidad, cookies u otros datos, decide qué debe formar la clave o evita cachear esa respuesta.

Un nombre de archivo nuevo suele ser una forma clara de publicar una versión nueva. Si necesitas retirar una copia antes de que venza, puedes enviar una invalidación; considera que el navegador o un proxy también podría conservar su propia copia. AWS compara [invalidaciones y nombres de archivo versionados](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/Invalidation.html).

## Elegir entre un bucket S3 privado y un sitio web de S3

Para distribuir archivos privados desde S3 sin hacer público el bucket, usa un **origen de tipo bucket S3** y un **Origin Access Control (OAC)**. Configura OAC para firmar las solicitudes y limita la política del bucket a la distribución que debe leer los objetos. Así, el navegador obtiene los archivos desde CloudFront y no necesita permiso público en S3. Sigue la [guía de AWS para restringir el acceso a un origen S3 con OAC](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html).

Con OAC configurado para firmar siempre las solicitudes, CloudFront también se comunica con S3 por HTTPS. El cifrado de ese tramo y la política HTTPS para quienes visitan CloudFront son controles distintos.

No confundas ese origen con el **endpoint de sitio web estático de S3**. CloudFront lo trata como un origen HTTP personalizado; OAC y OAI no son compatibles con ese tipo de endpoint. El endpoint de sitio puede ser útil si necesitas funciones propias del hosting web de S3, como sus redirecciones, pero su modelo de acceso es distinto. AWS describe [los tipos de origen S3 y los endpoints de sitio web](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/DownloadDistS3AndCustomOrigins.html).

OAC protege el trayecto de CloudFront al bucket; **no autentica a quienes visitan CloudFront**. Si solo usuarios autorizados deben ver el contenido, configura además controles de acceso del lado del viewer, como URL o cookies firmadas, y prueba ambos caminos. No habilites lectura pública en S3 como solución genérica a un error 403.

Para comparar este patrón con una distribución de contenido privado, Alfredo Domínguez comparte una arquitectura de [CDN privada segura con CloudFront, S3, OAC y URL firmadas](https://www.alfredo-dominguez.dev/arquitecturas/01-private-cdn/). Es una referencia comunitaria complementaria; contrasta sus decisiones con la documentación actual de AWS antes de aplicarlas.

## Práctica guiada: servir un sitio estático desde S3 con OAC

El objetivo es entregar archivos HTML, CSS, JavaScript e imágenes desde un bucket privado y verificar que la lectura pase por CloudFront. No cubre una API dinámica, una aplicación que genera HTML en el servidor ni la reescritura de rutas profundas de una SPA.

### Antes de empezar

Necesitas un build estático que incluya <code>index.html</code>, sus recursos y rutas correctas; una cuenta de AWS; y permisos para crear un bucket S3, una distribución CloudFront, un OAC y su política de bucket. Puedes probar con el dominio que CloudFront asigna a la distribución. El dominio propio es opcional.

La práctica crea recursos que pueden generar cargos. Antes de empezar, compara los [precios vigentes de CloudFront](https://aws.amazon.com/cloudfront/pricing/), el modelo de pago por uso con los planes mensuales y las cuotas o funciones incluidas en el plan que elijas. Confirma qué créditos de almacenamiento S3 incluye ese plan y qué solicitudes o servicios de la arquitectura quedan fuera. No tomes una cifra de una guía antigua como precio actual; para ampliar el análisis, consulta [estrategias para evaluar costos de red en AWS](/blog/10-estrategias-para-optimizar-costos-de-red-en-aws/).

### Configuración en la consola

1. **Crea un bucket y sube el build.** Conserva el bloqueo de acceso público. Para este patrón no habilites el hosting de sitio web estático de S3: la distribución usará el endpoint regional normal del bucket.
2. **Crea una distribución estándar.** Agrega el bucket como origen y crea o asocia un OAC que firme siempre las solicitudes. Limita la política del bucket a lectura de objetos para el servicio CloudFront y esa distribución; revisa la política antes de guardarla. Mantén bloqueado el acceso público.
3. **Configura el comportamiento predeterminado.** Acepta <code>GET</code> y <code>HEAD</code>, elige una política de caché apropiada para tus archivos y establece <code>index.html</code> como objeto raíz predeterminado, sin una barra inicial. Para respuestas que deban respetar <code>Cache-Control: no-cache</code>, confirma que la política tenga TTL mínimo cero. Si tu sitio es una SPA, recuerda que el objeto raíz solo resuelve la ruta raíz: las rutas profundas requieren una regla adicional.
4. **Exige HTTPS para quienes visitan el sitio.** En el comportamiento, redirige HTTP a HTTPS. Espera a que la distribución termine de desplegarse y abre <code>https://&lt;dominio-de-la-distribución&gt;/</code>. Prueba también un archivo CSS o una imagen.
5. **Comprueba el origen.** Solicita directamente el mismo objeto en el endpoint regional de S3, sin credenciales. Debe denegar el acceso mientras CloudFront lo entrega. Si S3 lo muestra públicamente, vuelve a revisar el bloqueo público y la política del bucket.
6. **Agrega un dominio propio solo si lo necesitas.** Antes de asociarlo, solicita o importa en ACM, en <code>us-east-1</code> (N. Virginia), un certificado que cubra el nombre exacto. Añade el nombre alternativo a la distribución y apunta el DNS al dominio de CloudFront. Para el dominio predeterminado de CloudFront no necesitas un certificado propio. Consulta los [requisitos de certificados y dominios HTTPS](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/cnames-and-https-requirements.html).

La consola y las opciones disponibles pueden cambiar. Para una plantilla que crea una solución segura con S3, CloudFront, OAC y HTTPS, revisa la [guía oficial para un sitio estático seguro](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/getting-started-secure-static-website-cloudformation-template.html): requiere un dominio conectado a una zona alojada de Route 53, permisos para desplegar la plantilla y usar N. Virginia. La guía indica que quien la despliega es responsable de los cargos.

El paso 4 exige HTTPS entre el viewer y CloudFront; con el OAC indicado en el paso 2, CloudFront también usa HTTPS al consultar S3. Para un origen HTTP personalizado, elige HTTPS Only como política de protocolo del origen y usa un certificado válido que cubra el dominio del origen. AWS documenta [HTTPS para orígenes S3](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-https-cloudfront-to-s3-origin.html) y [para orígenes personalizados](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-https-cloudfront-to-custom-origin.html).

### Si algo falla

- **CloudFront responde 403:** confirma que la clave solicitada exista —incluidas mayúsculas y minúsculas—, que el comportamiento use el origen correcto y que la política del bucket autorice a esa distribución. Revisa también que elegiste un origen S3 normal con OAC y no un endpoint de sitio web estático. AWS recomienda <code>Bucket owner enforced</code> en S3 Object Ownership para los nuevos buckets; si necesitas ACLs, la guía de OAC indica qué alternativa usar. Si el bucket usa SSE-KMS, revisa también la política de la clave. Consulta las guías de [OAC](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html) y de [errores 403 de CloudFront](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/http-403-permission-denied.html).
- **Ves una versión anterior:** comprueba los encabezados del origen y los TTL de la política. Cambia el nombre de los assets versionados o invalida las rutas cuya copia necesites retirar.
- **Falla una ruta como <code>/productos/</code>:** el objeto raíz predeterminado solo se aplica a la raíz de la distribución. Asegúrate de que la ruta corresponda a un objeto existente o configura el comportamiento de navegación de la aplicación.
- **Falla HTTPS con tu dominio o recibes un 502:** confirma que el certificado del viewer cubra el nombre agregado y que el DNS apunte a la distribución. Si usas un origen personalizado por HTTPS, comprueba también su certificado y que cubra el dominio configurado para ese origen; CloudFront responde 502 si la validación TLS del origen falla.

## Costos y limpieza

CloudFront ofrece pago por uso y planes de tarifa fija; las funciones, condiciones y uso incluidos varían. La distribución puede reducir solicitudes al origen si el contenido se reutiliza, pero eso no garantiza una factura menor: importan el tráfico, la ubicación de los viewers, la clave, el TTL, el origen y las funciones activadas. Revisa la [tabla de precios y planes de CloudFront](https://aws.amazon.com/cloudfront/pricing/) antes de elegir. Las condiciones de cada modalidad pueden cambiar.

Si ya no necesitas la práctica, primero deshabilita la distribución y espera a que el cambio se propague; después elimínala. Si la distribución está asociada a un plan de tarifa fija, AWS requiere cancelar el plan y esperar al siguiente ciclo de facturación antes de eliminarla. Luego retira el registro DNS y el certificado que hayas creado solo para esta prueba. Finalmente vacía el bucket —incluidas las versiones, si activaste versionado— y decide si lo conservas o lo eliminas. Consulta la guía de AWS para [eliminar una distribución](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/HowToDeleteDistribution.html) y [vaciar o eliminar un bucket S3](https://docs.aws.amazon.com/AmazonS3/latest/userguide/delete-bucket.html).

## Recursos y comunidad para seguir aprendiendo

El [AWS User Group Panamá publicó una grabación titulada “Static Web usando Vue.js, S3, CloudFront, WAF, AWS CI/CD”](https://www.youtube.com/watch?v=Y6PScTDqAsU). También puedes recorrer [su canal de YouTube](https://www.youtube.com/channel/UCjr_J7Xva8QsHP31JfzYsYA), consultar la [comunidad en Panamá](/comunidades/panama/#resource-meetup-22667715) y revisar [sus eventos próximos](/eventos/?community=meetup-22667715). Para encontrar otras charlas, talleres y grupos, visita el [directorio general de comunidades AWS](/comunidades/) y la [Agenda de eventos AWS](/eventos/).

Como siguiente paso, puedes buscar la charla de Carlos Cortez [“🔥 El verdadero Edge: Cloudfront Functions! - 📢 Al día con AWS Ep 16 con Carlos Cortez”](https://www.youtube.com/watch?v=Dfd6aCSVwUE), identificada en el catálogo como contenido sobre funciones en el edge. El [canal de Carlos Cortez](https://www.youtube.com/@carloscortezcloud) reúne sus grabaciones.

---

## Preguntas frecuentes

### ¿CloudFront es solo para archivos estáticos?

No. Puede recibir tráfico hacia distintos tipos de origen y comportamientos. También puede distribuir respuestas dinámicas, pero solo conviene cachearlas si la respuesta puede compartirse de forma segura y la clave, los encabezados y el TTL representan cómo varía el contenido.

### ¿CloudFront vuelve privado un bucket S3?

No por sí solo. Para un bucket privado, configura OAC y limita la política del bucket a la distribución. Además, OAC controla cómo CloudFront accede al origen, no qué viewers pueden abrir la URL de CloudFront.

### ¿OAC sirve con el endpoint de sitio web estático de S3?

No. Ese endpoint se configura como origen HTTP personalizado y no admite OAC ni OAI. Si quieres mantener el bucket privado con OAC, usa el endpoint normal de bucket S3.

### ¿Necesito ACM en us-east-1 para usar HTTPS?

Solo necesitas tu certificado ACM en N. Virginia cuando asocias un dominio propio a CloudFront. Para probar con el dominio predeterminado de CloudFront, el servicio ya ofrece un certificado. El dominio personalizado también debe estar cubierto por el certificado y configurado en DNS.

### ¿Una invalidación reemplaza cambiar el nombre del archivo?

No exactamente. Una invalidación solicita que CloudFront retire copias de sus cachés; los navegadores y otros proxies pueden conservar su propia copia. Un nombre de archivo nuevo permite que el sitio solicite de forma explícita la versión nueva. AWS recomienda versionar los archivos que cambian seguido y usar invalidaciones cuando necesites retirar una copia antes de su vencimiento.
