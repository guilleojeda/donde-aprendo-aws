# Cuentas

Una persona puede crear una cuenta abierta, verificar su correo, ingresar,
cerrar sesión y recuperar acceso con otra contraseña desde «Mi página».
Registrarse no publica una ficha ni adjudica recursos del catálogo. El correo
de acceso es privado; nombre público y propiedad de contenido no se deducen
de él.

Los formularios de contraseña, confirmación, reenvío y recuperación pertenecen
a Cognito Essentials Managed Login en español. SES envía los códigos desde el
dominio propio, con mensajes en español. El envío productivo a destinatarios
no verificados es una condición de apertura del registro. Recuperar contraseña
vuelve al acceso: no crea una sesión implícita del sitio.

La aplicación usa Authorization Code con PKCE, transacciones vinculadas al
navegador y una biblioteca OIDC que verifica firma, emisor, audiencia, nonce,
vencimiento, correo verificado y autenticación reciente. Los destinos de
entrada y retorno son fijos. Un callback sólo puede consumirse una vez; fallar,
cancelar o vencer permite iniciar otro acceso sin exponer códigos ni el error
privado del proveedor.

El callback contrasta `auth_time` firmado con el inicio del intento guardado
en servidor, a precisión de segundos. No basta enviar `prompt=login` en un
enlace que el navegador puede modificar. Una autenticación válida durante el
intento sigue siendo válida si el retorno tarda, dentro de los diez minutos
del intento; no se impone otro plazo corto para completar el recorrido.

La identidad es emisor más `sub`, independientemente del correo. La cookie de
sesión es opaca, limitada al host, `Secure`, `HttpOnly`, `SameSite=Lax`, con
siete días absolutos de duración. Consultarla no extiende su vencimiento.
Los tokens OIDC no se guardan ni se entregan al JavaScript del sitio. La cuenta,
sus transacciones y sesiones viven en una tabla privada, separada del catálogo;
no pertenecen al índice de búsqueda ni al sitemap.

Cada autorización comprueba sesión, vencimiento, cuenta activa y versión de
sesión con lecturas consistentes. Un fallo del almacenamiento produce
indisponibilidad, no acceso anónimo aparente ni éxito. DynamoDB TTL limpia
filas: su demora no prolonga autorización. La página y las operaciones de
cuenta responden `private, no-store`; dos navegadores no comparten HTML privado.

Cerrar sesión requiere POST, origen válido y token CSRF de esa sesión. Se
confirma su revocación antes de borrar la cookie y terminar la sesión de
Cognito. Repetir la salida es seguro; reutilizar una cookie revocada no da
acceso. Un fallo al revocar no se comunica como salida completada.
El formulario usa JavaScript para enviar el POST con el origen del navegador
y sin Referer, conservando `no-referrer` en las páginas privadas. La respuesta
JSON confirma el destino antes de navegar a Cognito; no se sigue una
redirección del POST mediante fetch. Sin JavaScript se explica que debe
activarse para cerrar la sesión desde esta página.
Si falla la escritura, la respuesta ofrece una acción POST privada y sin
almacenamiento en caché para reintentar con el token CSRF ya validado; no se
guarda una autorización de salida adicional.
Si un reintento confirma que la sesión local ya no existe, completa de todas
formas el cierre de Cognito. Una lectura fallida no confirma la revocación.

Si se desactiva una cuenta mientras conserva una sesión vigente, `/cuenta/`
responde 403 y no muestra datos privados ni acciones de gestión, pero permite
cerrar esa misma sesión mediante POST con su CSRF. Una vez revocada, la sesión
no vuelve a autorizar al reactivar la cuenta.

El trigger `PostConfirmation_ConfirmForgotPassword` avanza la versión y el
límite de autenticación de la cuenta. Las sesiones anteriores fallan en su
siguiente autorización; los callbacks autenticados antes o en el segundo del
restablecimiento también se rechazan. Una invalidación anterior al primer
acceso local se conserva al crear la cuenta. El trigger espera persistencia,
propaga fallos y permite reintentos sin restaurar sesiones. No existe una
transacción distribuida que deshaga la contraseña si falla esa escritura;
operación debe investigar un error del trigger. La revocación tampoco deshace
acciones que ya estaban autorizadas.

El directorio y el blog siguen prerenderizados en Amplify. Los perfiles
públicos, las páginas de cuenta y administración, sus APIs y los 404
se resuelven por petición mediante el adaptador comunitario de Astro; el
perfil público no espera un build para reflejar sus datos. Los rewrites de
secciones estáticas, el artefacto y la configuración de hosting deben ser
compatibles entre sí; revertir sólo el código no restaura reglas de app.
El origen HTTPS de cuenta configura tanto los retornos de autenticación como
el hostname de proxy que Astro acepta. Cambiar ese origen requiere compilar
el artefacto con el mismo valor y autorizar sus URLs exactas en Cognito.

## Páginas y administración de creadores

La cuenta y su permiso de administración viven en el registro privado de
`ACCOUNTS_TABLE`. Registrarse o verificar el correo no crea ni publica una
página. Tras ingresar, `/cuenta/` abre el espacio privado «Tu página», donde
la persona puede crear o editar su perfil y publicarlo explícitamente. La
vista principal consulta de forma asíncrona un resumen de actividad y su
detalle SSR vive en el mismo espacio en `/cuenta/?vista=estadisticas&periodo=7|30&pagina=N`.
El GET anterior `/cuenta/estadisticas/` redirige al detalle conservando
períodos y páginas válidos; las operaciones POST no se redirigen. Enlaces,
orden, series y solicitudes se gestionan dentro de «Tu página». Solicitudes
usa `/cuenta/?vista=solicitudes` y permite elegir contenido o aportar URLs,
sin pedir identificadores internos. GET `/cuenta/creador/` redirige 302 a esa
vista sin leer identidad ni copiar parámetros anteriores; los demás métodos
responden 405 con `Allow: GET`, sin redirección ni escritura. Las reglas de
perfiles, enlaces compartidos, reclamaciones, fotos, analítica y selección para
el directorio están en [páginas de creadores](creator-pages.md).

`/cuenta/administracion/` sólo admite una sesión cuyo registro privado tenga
`isAdmin: true`. El alta inicial de una persona administradora requiere una
operación controlada sobre la cuenta ya existente, identificada por su
identidad Cognito (emisor más `sub`) y su registro interno. No se asigna el
permiso por correo, nombre público ni dato enviado por el navegador. No hay
grupo de Cognito ni formulario de autoasignación. La identidad interna y el
correo no se copian al catálogo ni a páginas públicas.
