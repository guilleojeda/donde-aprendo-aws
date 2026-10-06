---
title: "Cómo configurar AWS Transfer Family con Amazon EFS por SFTP"
description: "Configura un servidor SFTP con AWS Transfer Family y Amazon EFS: rol IAM, permisos POSIX, directorios lógicos, pruebas, errores comunes y costos."
author: "guille-ojeda"
publishedAt: "2024-05-05"
publishedTimestamp: "2024-05-05T05:44:31.414Z"
modifiedTimestamp: "2026-10-06T10:25:54-03:00"
review:
  date: "2026-10-06"
cover: "/assets/blog/editorial-datos-ia.png"
coverAlt: "Una cuadrícula de puntos y una señal ascendente alrededor de un camino azul con un punto naranja."
ogImage: "/assets/blog/editorial-datos-ia.png"
related: []
---

**AWS Transfer Family permite que clientes SFTP transfieran archivos a Amazon EFS sin que tengas que operar un servidor SFTP propio.** Para habilitarlo, configura un endpoint y un usuario de Transfer Family, concede al rol del usuario acceso a EFS y asigna un perfil POSIX con permisos sobre la carpeta. El servidor y EFS deben estar en la misma región; pueden estar en cuentas distintas si la política de EFS concede acceso al rol.

La guía configura un usuario administrado por Transfer Family que inicia sesión con una clave SSH y accede a una carpeta de EFS. También explica cuándo usar un endpoint público o alojado en una VPC, cómo probar una carga y cómo eliminar los cargos del endpoint después de una prueba. [La documentación oficial de EFS y Transfer Family](https://docs.aws.amazon.com/efs/latest/ug/using-aws-transfer-integration.html) cubre los requisitos de integración y el acceso entre cuentas.

## Antes de empezar

Necesitas un sistema de archivos EFS en la región donde crearás el servidor, permisos de IAM para crear el rol y sus políticas, administrar Transfer Family y pasar el rol al servicio (`iam:PassRole`), y acceso a una instancia Linux que pueda montar EFS para crear la carpeta del usuario. En tu computadora instala **AWS CLI v2** y OpenSSH con los comandos `sftp` y `ssh-keygen`. Configura un perfil o sesión de AWS con credenciales válidas y la región que usarás en todos los comandos; puedes comprobar el perfil activo con `aws configure list` y la cuenta con `aws sts get-caller-identity --region us-east-1`. Reemplaza `us-east-1` por la región del servidor; si usas un perfil con nombre, agrega `--profile NOMBRE` a cada comando de AWS CLI.

La [guía de AWS CLI en español](https://dev.to/aws-espanol/aws-cli-instalacion-en-windows-y-linux-y-uso-basico-l2e) ayuda con la instalación inicial; para instalar la versión actual, sigue las instrucciones oficiales para [AWS CLI v2](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html).

## Qué controla cada permiso

La integración tiene varias capas que cumplen funciones distintas:

- **El proveedor de identidad autentica al usuario.** En este tutorial, Transfer Family guarda el usuario y su clave pública SSH. La clave privada permanece en la computadora del usuario.
- **El rol de IAM autoriza el acceso del servicio a EFS.** Para una carga, normalmente necesita **elasticfilesystem:ClientMount** y **elasticfilesystem:ClientWrite** sobre el sistema de archivos.
- **El perfil POSIX y los permisos del directorio deciden qué archivos puede leer o modificar el usuario.** **Uid**, **Gid** y los grupos secundarios se comparan con el propietario, el grupo y el modo POSIX de cada archivo y carpeta.
- **El endpoint define desde qué redes se conecta el cliente.** No define los permisos de los archivos ni vuelve público el sistema EFS.

EFS y Transfer Family pueden estar en cuentas distintas, pero no en regiones distintas. Para el caso entre cuentas, agrega una política de sistema de archivos EFS no pública que permita al rol de usuario de Transfer Family usar **ClientMount** y, si debe cargar archivos, **ClientWrite**. [AWS detalla este requisito y un ejemplo de política](https://docs.aws.amazon.com/efs/latest/ug/using-aws-transfer-integration.html).

Transfer Family puede usar EFS con SFTP, FTPS o FTP. El endpoint y el proveedor de identidad también limitan qué protocolos puedes habilitar: un endpoint **PUBLIC** admite SFTP; los endpoints alojados en una VPC permiten otras combinaciones. El proveedor de identidad administrado por Transfer Family es compatible con SFTP. Consulta la [matriz de protocolos y endpoints](https://docs.aws.amazon.com/transfer/latest/userguide/sftp-for-transfer-family.html) si necesitas FTPS o FTP. FTP transmite datos sin cifrar; para archivos sensibles usa SFTP o FTPS.

## 1. Prepara EFS y el directorio del usuario

Elige un sistema de archivos EFS en la misma región del servidor. Para un primer despliegue, mantener ambos recursos en la misma cuenta simplifica la política; el acceso entre cuentas también está soportado si habilitas la política de EFS descrita arriba.

Antes de crear el usuario, crea su carpeta y asígnale el mismo UID y GID que usarás en Transfer Family. Este ejemplo supone que un administrador ya montó EFS en una instancia Linux bajo /mnt/efs:

~~~bash
sudo mkdir -p /mnt/efs/transferFam/acme
sudo chown 1001:1001 /mnt/efs/transferFam/acme
sudo chmod 750 /mnt/efs/transferFam/acme
~~~

En este ejemplo, el propietario 1001:1001 puede leer, escribir y recorrer la carpeta. Ajusta el propietario y el modo si varios usuarios compartirán archivos. El directorio de inicio debe existir y permitir lectura y escritura; si no, el usuario puede autenticarse y aun así recibir “No such file or directory” al listar su carpeta.

Si quieres comparar opciones de almacenamiento antes de preparar la estructura, esta sesión de [AWS Girls Perú sobre EFS, FSx y AWS Backup](https://www.youtube.com/watch?v=-ZK2SwC0n1Q) explica cómo encajan esos servicios para datos compartidos y respaldos.

Para montar EFS desde esa instancia administrativa, configura un mount target y permite NFS por TCP 2049 desde el grupo de seguridad de la instancia al grupo del mount target. Esa conexión sirve para que la instancia monte EFS y prepare directorios. Los clientes SFTP se conectan al endpoint de Transfer Family, no a un mount target de EFS.

**Transfer Family accede a EFS por la red interna de AWS.** Ese tráfico no atraviesa Internet y no requiere un endpoint de AWS PrivateLink para mantenerlo privado. El endpoint público o de VPC controla la conexión entre el cliente y Transfer Family; no es una ruta de red que debas abrir desde el servidor hacia EFS. Consulta la [respuesta oficial sobre la conexión de Transfer Family con EFS](https://aws.amazon.com/aws-transfer-family/faqs/).

## 2. Crea el servidor y elige su endpoint

En la consola de AWS, abre **AWS Transfer Family → Servers → Create server** y selecciona:

1. **Protocol:** SFTP.
2. **Identity provider:** Service managed, para que Transfer Family guarde el usuario y la clave pública.
3. **Domain:** Amazon EFS.
4. **Endpoint:** elige **Public** si los clientes deben conectarse por Internet y solo necesitas SFTP. El endpoint público no admite una lista de IP de origen y sus direcciones IP pueden cambiar.

Si necesitas un origen de IP filtrable o direcciones IP estáticas, usa un endpoint alojado en una VPC con acceso **Internet facing** y configura sus grupos de seguridad para admitir el tráfico SFTP de los clientes autorizados. Para clientes dentro de la VPC, una VPN o Direct Connect, elige acceso **Internal**. Un endpoint interno no es accesible desde Internet.

El grupo de seguridad del endpoint de VPC controla el ingreso del cliente a Transfer Family; para SFTP permite TCP 22 desde los rangos de clientes que correspondan. No agregues una regla NFS a ese grupo para el uso de EFS. La [guía de endpoints](https://docs.aws.amazon.com/transfer/latest/userguide/create-server-in-vpc.html) explica el acceso interno y el acceso por Internet.

## 3. Crea un rol de IAM para el usuario

Crea un rol de IAM para Transfer Family, con **transfer.amazonaws.com** como entidad de confianza, y adjunta una política limitada al sistema de archivos que utilizará este usuario. Para reducir el alcance del rol, limita la relación de confianza a tu cuenta y, cuando sea posible, al servidor específico. El siguiente ejemplo de confianza es para la cuenta y el servidor de muestra:

~~~json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {
      "Service": "transfer.amazonaws.com"
    },
    "Action": "sts:AssumeRole",
    "Condition": {
      "StringEquals": {
        "aws:SourceAccount": "ACCOUNT_ID"
      },
      "ArnLike": {
        "aws:SourceArn":
          "arn:aws:transfer:REGION:ACCOUNT_ID:user/SERVER_ID/*"
      }
    }
  }]
}
~~~

En esta relación de confianza, reemplaza `REGION`, `ACCOUNT_ID` y `SERVER_ID` por los valores del servidor que usarás. `ACCOUNT_ID` debe ser la misma cuenta en `aws:SourceAccount`, el ARN del servidor y el ARN del rol de usuario; `REGION` y `SERVER_ID` también deben corresponder a ese servidor. La condición limita qué servidor puede asumir el rol.

Adjunta una política de identidad como esta. Sustituye el ID de cuenta, la región y el ID de EFS por los tuyos:

~~~json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": [
      "elasticfilesystem:ClientMount",
      "elasticfilesystem:ClientWrite"
    ],
    "Resource":
      "arn:aws:elasticfilesystem:REGION:ACCOUNT_ID:file-system/FS_ID"
  }]
}
~~~

**ClientMount** habilita el acceso al sistema de archivos y **ClientWrite** habilita las escrituras. No agregues **ClientRootAccess** a un rol de usuario normal. En una configuración entre cuentas, el rol también necesita el permiso correspondiente en la política del sistema de archivos EFS. [AWS documenta los roles y permisos de Transfer Family](https://docs.aws.amazon.com/transfer/latest/userguide/requirements-roles.html).

El rol del usuario no es el rol de logging del servidor. El primero autoriza el acceso a EFS. La consola habilita registros estructurados JSON en CloudWatch al crear servidores; si configuras un rol de logging —por ejemplo, para registrar eventos de workflows—, ese rol tiene el propósito separado de escribir registros. [Consulta cómo funciona el logging de Transfer Family](https://docs.aws.amazon.com/transfer/latest/userguide/log-server-manage.html).

## 4. Crea el usuario y mapea su carpeta

Genera un par de claves SSH en la computadora del usuario:

~~~bash
ssh-keygen -t ed25519 -f ./acme-transfer -C acme-ingreso
~~~

Guarda **acme-transfer** como clave privada. Solo subirás **acme-transfer.pub**, la clave pública. Protege la clave privada y no la copies a AWS.

El modo lógico presenta la carpeta física como **/** al usuario y lo limita a ese directorio. El valor de **Target** debe incluir el ID de EFS y la ruta física. En este ejemplo, el usuario POSIX **1001:1001** corresponde al propietario de la carpeta que preparaste:

~~~bash
aws transfer create-user \
  --server-id s-0123456789abcdef0 \
  --user-name acme-ingreso \
  --role arn:aws:iam::123456789012:role/TransferEfsUser \
  --home-directory-type LOGICAL \
  --home-directory / \
  --home-directory-mappings \
    '[{"Entry":"/","Target":"/fs-0123456789abcdef0/transferFam/acme"}]' \
  --posix-profile '{"Uid":1001,"Gid":1001}' \
  --ssh-public-key-body file://./acme-transfer.pub \
  --region us-east-1
~~~

Reemplaza el ID del servidor, el rol, el ID de EFS y la región por los valores reales. La carpeta de **Target** debe existir antes de que el usuario inicie sesión. Para usuarios de un proveedor de identidad personalizado, configura ese proveedor para devolver el rol, la ruta de inicio y un **PosixProfile** de EFS; **create-user** sirve para servidores con proveedor de identidad administrado por Transfer Family.

También puedes definir el inicio como una ruta física con **HomeDirectoryType=PATH**. En ambos casos la ruta EFS comienza con **/fs-ID/**. Con **LOGICAL**, **HomeDirectory** debe corresponder a un valor **Entry**, por ejemplo **/**; no debe contener el **Target**. Lee las reglas de [directorios lógicos](https://docs.aws.amazon.com/transfer/latest/userguide/implement-log-dirs.html) antes de publicar varias carpetas virtuales.

Para agregar una segunda clave a un usuario administrado existente, usa el comando oficial **import-ssh-public-key**:

~~~bash
aws transfer import-ssh-public-key \
  --server-id s-0123456789abcdef0 \
  --user-name acme-ingreso \
  --ssh-public-key-body file://./acme-transfer-next.pub \
  --region us-east-1
~~~

Transfer Family acepta claves RSA, ECDSA y ED25519 en formato de clave pública SSH. Si usas un proveedor de identidad distinto del administrado por Transfer Family, administra las claves en ese proveedor. Referencias: [create-user](https://docs.aws.amazon.com/cli/latest/reference/transfer/create-user.html) e [import-ssh-public-key](https://docs.aws.amazon.com/cli/latest/reference/transfer/import-ssh-public-key.html).

## 5. Prueba una transferencia

En el equipo cliente, crea un archivo pequeño en el directorio desde el que abrirás la conexión; por ejemplo: `printf 'prueba SFTP EFS\n' > prueba.txt`.

Obtén el hostname en los detalles del servidor. Desde una computadora con acceso a ese endpoint, conéctate con la clave privada:

~~~bash
sftp -i ./acme-transfer \
  acme-ingreso@s-0123456789abcdef0.server.transfer.us-east-1.amazonaws.com
~~~

En el prompt de SFTP, comprueba el directorio, carga el archivo y descárgalo con un nombre local distinto:

~~~text
sftp> pwd
sftp> put ./prueba.txt
sftp> ls
sftp> get prueba.txt prueba-descargada.txt
sftp> exit
~~~

La sesión debe mostrar la ruta lógica **/** y el archivo que cargaste. Después de salir de SFTP, compara los dos archivos locales con `cmp ./prueba.txt ./prueba-descargada.txt` (o una herramienta equivalente en tu sistema). Como cada nombre es distinto, conservas el original para verificar el contenido. Este flujo prueba autenticación, alcance de red, rol IAM, ruta y permisos POSIX juntos.

## Errores habituales

- **La conexión termina por timeout:** confirma que el cliente puede alcanzar el tipo de endpoint elegido. Para uno interno necesitas una ruta desde la VPC o una red conectada; para uno de VPC con acceso por Internet, revisa el grupo de seguridad, las rutas y el puerto SFTP.
- **Permission denied o Couldn't canonicalize: Permission denied Need cwd:** revisa **ClientMount**/**ClientWrite** en el rol, la política de EFS si es entre cuentas, el **Uid**/**Gid** del usuario y los permisos de la carpeta.
- **No such file or directory al ejecutar ls:** revisa que **Target** comience con **/fs-ID/**, que coincida con tu región/sistema de archivos y que la carpeta exista con acceso de lectura y escritura.
- **El usuario se autentica, pero no ve los permisos esperados:** confirma que el proveedor de identidad entrega un **PosixProfile** JSON y que el propietario POSIX de archivos y carpetas coincide con el perfil. EFS aplica UID/GID y modo POSIX; el rol de IAM no sustituye esos permisos.
- **No aparece un evento en CloudWatch:** revisa el destino de logs y los permisos del rol de logging si configuraste uno. No agregues permisos de logs al rol de usuario para corregir un error de acceso a EFS.

La [guía de resolución de problemas de EFS en Transfer Family](https://docs.aws.amazon.com/transfer/latest/userguide/efs-troubleshooting.html) documenta estos errores y sus causas.

## Rendimiento y costos

Transfer Family es un servicio administrado: no hay una instancia de servidor cuya CPU o memoria tengas que dimensionar. Si una transferencia es lenta, revisa la red entre cliente y endpoint, el cliente y los archivos, los registros del servidor y el modo de rendimiento/throughput de EFS. El acceso mediante Transfer Family cuenta como uso de EFS y también consume sus créditos de ráfaga cuando corresponde; [consulta los modos de rendimiento y métricas de EFS](https://docs.aws.amazon.com/efs/latest/ug/performance.html).

El costo puede incluir protocolos habilitados en el endpoint, volumen de datos transferidos, almacenamiento y operaciones de EFS, además de registros y otros servicios que hayas añadido. Los importes dependen de la región y del uso; usa la [página de precios de Transfer Family](https://aws.amazon.com/aws-transfer-family/pricing/) y la calculadora vinculada allí para estimar tu caso.

Detener un servidor para dejarlo fuera de línea **no detiene los cargos del servicio**. Para dejar de acumular cargos por los protocolos del endpoint, elimina el servidor:

~~~bash
aws transfer delete-server \
  --server-id s-0123456789abcdef0 \
  --region us-east-1
~~~

Eliminar el servidor elimina sus usuarios, pero el sistema EFS y sus archivos son recursos separados. Si ya no necesitas el EFS de prueba, revisa primero si otros recursos dependen de él y conserva los datos que quieras mantener. AWS explica la [eliminación de servidores](https://docs.aws.amazon.com/transfer/latest/userguide/configuring-servers.html) y aclara que el servidor detenido sigue facturándose en la [guía para editar sus detalles](https://docs.aws.amazon.com/transfer/latest/userguide/edit-server-config.html).

## Recursos y comunidad en español

Estas grabaciones y comunidades ayudan a seguir aprendiendo sobre transferencia de archivos y almacenamiento compartido:

- [**Ni yendo, ni llegando: tus archivos ya transferidos con AWS**](https://www.nerdearla.com/nerdflix/cbtaEyGKzGg/): taller en español de Nerdearla sobre AWS Transfer Family.
- [**AWS UG Buenos Aires: EBS, EFS, S3 y monitoreo**](https://www.youtube.com/watch?v=GqYKhnqDDeI): repaso comunitario de almacenamiento y logs; sigue el [canal de AWS UG Buenos Aires](https://www.youtube.com/@awsugbsas) o conversa en su [grupo de Meetup](https://www.meetup.com/aws-user-group-buenos-aires/).
- [**Practitioner, Una Nueva Esperanza: Amazon EBS y Amazon EFS**](https://www.youtube.com/watch?v=t3WW-dcnGEk): sesión de AWS Women Colombia; consulta su [archivo de eventos](https://awswomencolombia.com/page/eventos), su [canal de YouTube](https://www.youtube.com/channel/UCdpHSMDDwo4_d_u3mSU41Mw) y su [comunidad](https://awswomencolombia.com/).
- AWS Girls Perú comparte [recursos y actividades](https://awsgirlsperu.com/) y organiza un [grupo de Meetup](https://www.meetup.com/aws-girls-peru/) sobre AWS.
- [**Grupo de estudio: EFS para AWS Solutions Architect Associate**](https://www.youtube.com/watch?v=J8OrxPPeSPs): sesión grabada de AWS User Group Guatemala; consulta su [comunidad](https://www.meetup.com/aws-guatemala/) y el [canal de YouTube](https://www.youtube.com/@awsugguatemala).

Para conversar sobre redes y conectividad de AWS, consulta el [AWS User Group Networking Colombia](https://www.meetup.com/aws-user-group-networking-colombia/). También puedes buscar un grupo cercano en el [directorio de comunidades AWS en Latinoamérica](https://dondeaprendoaws.com/comunidades/).

En la agenda publicada al revisar esta guía aparecen dos encuentros útiles: el [AWS Community Day Paraguay](https://www.awscommunitydayparaguay.com/register), gratuito y presencial el 17 de octubre de 2026 en San Lorenzo, organizado por el [AWS User Group Paraguay](https://dondeaprendoaws.com/comunidades/paraguay/#resource-meetup-37502677), con charlas y laboratorios; y [Amazon VPC Essentials: Fundamentos de Networking](https://www.meetup.com/aws-sbg-at-francisco-jose-de-caldas-district-univ-bogota/events/316674045/), virtual el 21 de octubre de 2026, de 18:00 a 20:00 GMT-5, presentado por un [AWS Student Builder Group de Bogotá](https://dondeaprendoaws.com/comunidades/colombia/#resource-meetup-38034353). Confirma cupos, horario y modalidad con cada organizador; puedes revisar más fechas en la [agenda de eventos AWS](https://dondeaprendoaws.com/eventos/).

Para revisar el principio de mínimo privilegio, reglas de red y evidencias de seguridad antes de abrir el endpoint a usuarios externos, consulta el [checklist de seguridad en AWS](https://dondeaprendoaws.com/blog/aws-seguridad-mejores-practicas/).

## Preguntas frecuentes

### ¿EFS y Transfer Family tienen que estar en la misma cuenta?

No. Sí tienen que estar en la misma región. Para acceder a un sistema de archivos de otra cuenta, concede acceso al rol de Transfer Family en la política de EFS y evita una política de sistema de archivos pública.

### ¿El rol IAM y el UID/GID son la misma autorización?

No. IAM permite a Transfer Family usar el sistema de archivos; EFS aplica los UID/GID y los permisos POSIX de cada directorio y archivo para decidir si la operación del usuario puede continuar.

### ¿El cliente SFTP necesita conectarse a un mount target de EFS?

No. El cliente se conecta al endpoint de Transfer Family. La conexión administrada entre Transfer Family y EFS permanece en la red interna de AWS. Un mount target y una regla NFS TCP 2049 se necesitan para una instancia que monte EFS directamente, por ejemplo para preparar carpetas.

### ¿Puedo usar un EFS Access Point para cada usuario?

No para esta integración. Configura la identidad POSIX mediante **PosixProfile** de Transfer Family y protege cada carpeta con sus propietarios y permisos POSIX.

### ¿Qué ocurre con los archivos si elimino el servidor?

Eliminar el servidor elimina los usuarios de Transfer Family, no el sistema de archivos EFS. Los archivos permanecen en EFS y debes administrarlos por separado.
