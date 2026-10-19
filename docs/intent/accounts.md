# Cuentas

Una persona puede crear una cuenta abierta, verificar su correo, ingresar,
cerrar sesión y recuperar acceso con otra contraseña desde «Mi cuenta».
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

El trigger `PostConfirmation_ConfirmForgotPassword` avanza la versión y el
límite de autenticación de la cuenta. Las sesiones anteriores fallan en su
siguiente autorización; los callbacks autenticados antes o en el segundo del
restablecimiento también se rechazan. Una invalidación anterior al primer
acceso local se conserva al crear la cuenta. El trigger espera persistencia,
propaga fallos y permite reintentos sin restaurar sesiones. No existe una
transacción distribuida que deshaga la contraseña si falla esa escritura;
operación debe investigar un error del trigger. La revocación tampoco deshace
acciones que ya estaban autorizadas.

El directorio y el blog siguen prerenderizados en Amplify. Cuenta y 404 se
resuelven por petición mediante el adaptador comunitario de Astro. Los rewrites
de secciones estáticas, el artefacto y la configuración de hosting deben ser
compatibles entre sí; revertir sólo el código no restaura reglas de app.
