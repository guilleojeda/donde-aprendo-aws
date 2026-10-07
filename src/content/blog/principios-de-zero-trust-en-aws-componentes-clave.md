---
title: "Zero Trust en AWS: identidad, permisos y red con ejemplos"
description: "Aprende qué significa Zero Trust en AWS: roles temporales, mínimo privilegio, controles de red y pruebas de acceso, con recursos en español."
author: "guille-ojeda"
publishedAt: "2024-10-26"
publishedTimestamp: "2024-10-26T19:07:21.543Z"
modifiedTimestamp: "2026-10-06T23:36:27-03:00"
review:
  date: "2026-10-06"
cover: "/assets/blog/editorial-seguridad.png"
coverAlt: "Un escudo y una llave junto a un camino azul con un punto naranja."
ogImage: "/assets/blog/editorial-seguridad.png"
related:
  - title: "SCP en AWS Organizations: cómo funcionan y ejemplos"
    url: "https://dondeaprendoaws.com/blog/politicas-de-control-de-servicios-scps-en-aws/"
  - title: "Endpoints de VPC en AWS: gateway, interfaz y PrivateLink"
    url: "https://dondeaprendoaws.com/blog/que-son-los-endpoints-de-vpc-en-aws/"
  - title: "Lambda authorizers: seguridad, JWT y caché en API Gateway"
    url: "https://dondeaprendoaws.com/blog/5-practicas-de-seguridad-para-lambda-authorizers/"
  - title: "AWS Session Manager: cómo configurar el acceso a EC2"
    url: "https://dondeaprendoaws.com/blog/como-configurar-y-utilizar-aws-session-manager/"
---

**Zero Trust en AWS significa que estar dentro de una VPC, conectado por VPN o trabajando desde la oficina no basta para obtener acceso.** La decisión debe considerar la identidad, la acción solicitada, el recurso y las condiciones pertinentes. AWS combina controles de identidad y de red para aplicar ese enfoque; no existe un interruptor que convierta una cuenta completa en “Zero Trust”. [AWS explica su modelo y casos de uso](https://aws.amazon.com/security/zero-trust/).

Esta guía te ayuda a elegir los controles para personas, aplicaciones y servicios, entender sus límites y comprobar un ejemplo de permisos de lectura en S3. Encontrarás recursos de la comunidad en español para practicar cada parte.

## Qué cambia con Zero Trust

[NIST SP 800-207](https://csrc.nist.gov/pubs/sp/800/207/final) describe una arquitectura que protege recursos sin conceder confianza implícita por la ubicación de red ni por quién es dueño del dispositivo. Autenticar y autorizar son decisiones diferentes: demostrar quién eres no implica que puedas leer cualquier dato.

Piensa en una aplicación de facturación. Un empleado inicia sesión correctamente; eso todavía no autoriza el acceso a todas las facturas. La aplicación debe comprobar qué factura puede consultar. A su vez, el servicio que lee los archivos necesita su propia identidad y permisos en AWS: la identidad del empleado y el rol del servicio cumplen funciones distintas.

| Pregunta de diseño | Control que debes identificar |
| --- | --- |
| ¿Quién solicita acceso? | Identidad humana, de aplicación o de máquina; mecanismo de autenticación. |
| ¿Qué puede hacer? | Acciones y recursos permitidos; reglas de negocio y condiciones. |
| ¿Por dónde puede llegar? | Rutas, endpoints, grupos de seguridad y acceso a la aplicación. |
| ¿Qué cambia durante la sesión? | Expiración, cambios de permisos, estado del dispositivo o revocación, según el sistema. |
| ¿Cómo compruebo lo ocurrido? | Registros de acceso, eventos relevantes y pruebas de permisos. |

Zero Trust no obliga a pedir MFA al usuario en cada llamada ni hace que cada producto consulte continuamente la salud del dispositivo. Debes definir qué contexto usa cada control y cuándo vuelve a evaluar la decisión.

## 1. Usa identidades temporales para personas y cargas de trabajo

Para el acceso de tu equipo a cuentas AWS, empieza por **federación e IAM Identity Center**, antes llamado AWS SSO. Las personas asumen roles y reciben credenciales temporales. Usa MFA en el flujo de inicio de sesión correspondiente; si conectas un proveedor de identidad externo, revisa dónde se configura y exige ese segundo factor. Las [buenas prácticas actuales de IAM](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html) recomiendan federación, credenciales temporales y MFA resistente al phishing cuando sea posible.

Para una aplicación en EC2 o Lambda, utiliza el rol asociado a la carga de trabajo. Los SDK de AWS pueden obtener las credenciales temporales de ese entorno: no hace falta insertar una access key de usuario IAM en el código. Para cargas externas, evalúa federación OIDC o IAM Roles Anywhere según las identidades disponibles. MFA interactivo no sustituye la autenticación de una máquina.

Un rol tiene dos preguntas separadas: **quién puede asumirlo**, definido por su política de confianza, y **qué puede hacer después**, definido por las políticas de permisos aplicables. La [guía de roles de IAM](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles.html) explica esta separación. Que una credencial expire reduce su tiempo de uso; no corrige un rol con permisos excesivos ni impide que una sesión robada se use mientras siga siendo válida.

Para profundizar en español:

- El video de Marcia Villalba [Cómo dar permisos temporales a cuentas de AWS](https://www.youtube.com/watch?v=DJPwoqJzil8) introduce el acceso temporal; sirve para entender el cambio respecto de claves permanentes.
- Diana Alfaro recorre Organizations, conjuntos de permisos y acceso por CLI en [Configurando nuestro entorno con AWS Organization y AWS Identity Center](https://blog.alfalfita.cloud/configurando-nuestro-entorno-de-trabajo-con-aws-organization-y-aws-identity-center). Úsalo para visualizar la organización del acceso; es un tutorial histórico y sus pantallas o condiciones de Free Tier pueden haber cambiado.
- [Deja de usar tu usuario raíz de AWS](https://www.andmore.dev/es/blog/stop-using-aws-root-user/), de AndMore Dev, explica por qué separar la administración cotidiana del usuario root. Complementa esa lectura con las recomendaciones actuales de IAM, especialmente para acceso federado.

## 2. Autoriza acciones y recursos: ejemplo de lectura en S3

Supongamos que un servicio genera reportes y otro solo los descarga. El segundo no necesita escribir ni borrar archivos. Esta **política de permisos de identidad**, asociada a su rol, permite leer objetos cuyo nombre empieza con `reportes/`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "LeerReportes",
      "Effect": "Allow",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::amzn-s3-demo-reportes/reportes/*"
    }
  ]
}
```

Reemplaza el nombre de bucket por uno de tu entorno. El ejemplo sigue el patrón de [permisos S3 limitados a un prefijo](https://docs.aws.amazon.com/AmazonS3/latest/userguide/example-policies-s3.html). Está pensado para leer un objeto cuya clave conoces mediante API o SDK: no concede `s3:ListBucket`, permisos de navegación por consola, acceso a versiones ni permisos para descifrar una clave KMS.

**Este `Allow` no establece por sí solo un máximo de permisos.** Otras políticas pueden conceder acceso adicional. Las políticas de recursos, límites de permisos, políticas de sesión y controles de Organizations pueden afectar el resultado; un `Deny` explícito aplicable prevalece. Revisa la [evaluación de políticas de IAM](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_evaluation-logic.html) para el tipo de principal y acceso que estás usando.

En una cuenta de práctica, con objetos existentes y sin otros permisos que amplíen el rol, comprueba estos resultados:

| Solicitud | Resultado esperado y motivo |
| --- | --- |
| Leer `reportes/enero.csv` | Permitida por esta política, si los demás controles también lo permiten. |
| Leer `privado/nomina.csv` | Denegada: el ARN no coincide con el prefijo autorizado. |
| Escribir `reportes/nuevo.csv` | Denegada: no se concede `s3:PutObject`. |
| Listar el bucket | Denegada: no se concede `s3:ListBucket`. |

Distingue un objeto inexistente, un fallo de red y una denegación de permisos. No añadas `s3:*` como respuesta a cualquier error. Si el objeto usa SSE-KMS, comprueba también la autorización para `kms:Decrypt` sobre la clave correspondiente, como indica la [referencia de GetObject](https://docs.aws.amazon.com/AmazonS3/latest/API/API_GetObject.html); cifrado y permiso de lectura deben funcionar juntos.

El [laboratorio IAM de Jonás Carrillo](https://github.com/JonasCC8/aws-iam-security-lab) documenta un ejercicio de MFA y permisos acotados a S3 con pruebas de restricciones. Usa usuarios IAM para enseñar los conceptos; no sustituye la recomendación de acceso federado para tu equipo. Para escenarios con varias capas de políticas, [IAM Access Analyzer — Parte 3/4, de Terry Quispe](https://dev.to/terry_cloud/aws-iam-access-analyzer-parte-34-46o9) compara políticas, hallazgos y llamadas reales entre dos cuentas. Su laboratorio usa capacidades pagadas: revisa sus requisitos y costos antes de reproducirlo.

En una organización, las [SCPs](/blog/politicas-de-control-de-servicios-scps-en-aws/) sirven para limitar permisos de los principales a los que se aplican. No conceden acceso y no reemplazan la política del rol.

## 3. Restringe la red sin convertirla en una identidad

Una subred privada reduce rutas de exposición, pero no demuestra que la aplicación que origina una conexión esté autorizada. Un atacante con acceso a un servidor interno podría aprovechar cualquier permiso o conexión que ese servidor tenga.

Los [grupos de seguridad](https://docs.aws.amazon.com/vpc/latest/userguide/vpc-security-groups.html) filtran tráfico de los recursos asociados y mantienen estado: las respuestas a un flujo permitido se aceptan sin otra regla de retorno. Limita puertos y orígenes según los flujos necesarios; una regla de red no comprueba quién es el usuario final ni qué factura puede consultar.

Los [endpoints de VPC](/blog/que-son-los-endpoints-de-vpc-en-aws/) permiten acceder a servicios compatibles mediante rutas privadas. Una **política de endpoint**, cuando el servicio la admite, puede restringir qué principales, acciones y recursos pasan por ese endpoint. No reemplaza políticas IAM ni políticas del recurso, y la política predeterminada permite acceso completo a través del endpoint. [AWS documenta ese alcance y sus limitaciones](https://docs.aws.amazon.com/vpc/latest/privatelink/vpc-endpoints-access.html).

Para administración de EC2, [Session Manager](/blog/como-configurar-y-utilizar-aws-session-manager/) permite sesiones sin abrir SSH entrante, siempre que el agente, IAM y conectividad estén configurados. El [repositorio de Pablo González Robles sobre EC2 privada, endpoints y Systems Manager](https://github.com/pangoro24/aws-privatelink-private-instance-ssm) incluye plantillas CloudFormation para estudiar esas piezas. Crear la infraestructura genera recursos facturables; revisa plantillas, permisos y eliminación antes de practicar.

## 4. Elige el control de acceso de la aplicación según el caso

No necesitas desplegar todos los servicios de seguridad. Identifica dónde debe tomarse y hacerse cumplir cada decisión:

| Necesidad | Servicio o mecanismo que puedes evaluar | Límite que debes entender |
| --- | --- | --- |
| Acceso del personal a una aplicación corporativa | **AWS Verified Access**, con proveedores de identidad y, cuando corresponda, de dispositivos. | Evalúa solicitudes según las políticas y señales configuradas; no convierte el resto de tu cuenta en Zero Trust. |
| Comunicación entre servicios mediante VPC Lattice | Tipo de autenticación **`AWS_IAM`**, políticas de autorización y solicitudes firmadas. | La conectividad por sí sola no activa la autorización IAM; revisa políticas de servicio y service network aplicables. |
| Autenticación de clientes de una API | Proveedor de identidad como Cognito y el authorizer compatible con tu tipo de API Gateway. | Un token válido no demuestra permiso para cualquier objeto de negocio. |
| Permisos sobre documentos, proyectos u otros objetos de tu aplicación | Reglas en el backend o **Amazon Verified Permissions**, con políticas Cedar. | Verified Permissions decide; tu aplicación debe autenticar al principal y hacer cumplir la respuesta. |

Las guías de [Verified Access](https://docs.aws.amazon.com/verified-access/latest/ug/what-is-verified-access.html), [autorización de VPC Lattice](https://docs.aws.amazon.com/vpc-lattice/latest/ug/auth-policies.html) y [Verified Permissions](https://docs.aws.amazon.com/verifiedpermissions/latest/userguide/what-is-avp.html) explican funciones diferentes. Verified Access controla acceso a aplicaciones; Verified Permissions evalúa permisos de tu aplicación. No son nombres intercambiables.

Para llevarlo a código, el tutorial [Asegurar API Gateway con Cognito usando SAM](https://andmore.dev/es/blog/api-cognito/) muestra una integración de autenticación. La [demo de Verified Permissions de Gerardo Castro](https://github.com/gerardokaztro/avp-demo) permite estudiar decisiones Cedar para leer, editar y borrar documentos. Es una demo didáctica con endpoints sin autenticación: úsala para entender las políticas, no como plantilla de producción ni como prueba de que autentica a los usuarios.

Si usas Lambda authorizers, revisa [JWT, permisos y caché en API Gateway](/blog/5-practicas-de-seguridad-para-lambda-authorizers/). Una decisión almacenada puede seguir vigente durante su TTL aunque los permisos hayan cambiado; define qué demora de revocación admite tu aplicación.

## 5. Protege los datos y registra lo que necesitas comprobar

TLS protege el transporte y el cifrado en reposo protege los datos almacenados. Ninguno impide por sí mismo que un principal autorizado descargue información que no debería tener. Define permisos sobre datos y claves, además de proteger secretos y respaldos. [AWS KMS distingue claves administradas por el cliente, administradas por AWS y propiedad de AWS](https://docs.aws.amazon.com/kms/latest/developerguide/concepts.html), con diferentes posibilidades de control; elegir KMS no resuelve automáticamente la autorización de los datos.

Para saber quién accedió, selecciona los registros pertinentes. **CloudTrail no guarda por defecto los eventos de datos** de un trail o event data store. Lecturas de objetos S3, como `GetObject`, requieren seleccionar esos eventos; tienen cargos adicionales. [La documentación de CloudTrail explica eventos y selectores](https://docs.aws.amazon.com/awscloudtrail/latest/userguide/logging-data-events-with-cloudtrail.html). Los logs de tu aplicación deben registrar también la decisión de negocio, sin tokens ni secretos.

[GuardDuty](https://docs.aws.amazon.com/guardduty/latest/ug/what-is-guardduty.html) detecta amenazas usando las fuentes y protecciones disponibles o habilitadas; un hallazgo no bloquea automáticamente cada petición. Diseña qué alertas investigar y qué respuestas automatizar, con permisos acotados y pruebas para evitar cortar acceso legítimo.

Como lectura complementaria, [Observabilidad en la nube de AWS](https://dev.to/aws-builders/observabilidad-en-la-nube-de-aws-explorando-cloudwatch-x-ray-y-cloudtrail-5d9m) distingue CloudWatch, X-Ray y CloudTrail. El artículo de Gerardo Castro sobre [auditar access keys y MFA en una AWS Organization](https://roadtocloudsec.la/posts/encontre-access-key-2018-activa-produccion-python-boto3) muestra cómo encontrar credenciales olvidadas; la auditoría ayuda a revisar identidades, no demuestra por sí sola que los permisos sean mínimos.

## Cómo empezar y comprobar el resultado

Elige un flujo pequeño, por ejemplo “el servicio de reportes lee un prefijo de S3”. Documenta identidad, acciones, datos, ruta de red y responsable. Después:

1. Configura una identidad temporal y permisos que correspondan a ese flujo.
2. Revisa quién puede asumir el rol y quién puede modificar sus permisos.
3. Limita las conexiones necesarias y evita rutas de acceso que eludan el control previsto.
4. Prueba tanto operaciones permitidas como rechazadas, incluido otro recurso y otra identidad.
5. Confirma que puedes identificar las solicitudes en los registros seleccionados.
6. Comprueba qué pasa al expirar credenciales o cambiar permisos, considerando cachés y tiempos de propagación.

[IAM Access Analyzer puede generar una plantilla a partir de actividad de CloudTrail](https://docs.aws.amazon.com/IAM/latest/UserGuide/access-analyzer-policy-generation.html). Revisa esa plantilla: el historial observado puede omitir acciones poco frecuentes que sí necesita el sistema. No confundas “no apareció en los logs” con “nunca hará falta”.

## Aprende seguridad AWS con la comunidad en español

Para profundizar en políticas, puedes ver [El Código del Jedi: IAM avanzado, de AWS Women Colombia](https://www.youtube.com/watch?v=NLCI70IXcIs) y [RBAC vs ABAC, del AWS User Group Chile](https://www.youtube.com/watch?v=ORt8rvAIjvQ). Sirven para continuar desde el ejemplo de un rol hacia reglas de acceso por roles y atributos.

Si quieres conversar sobre lo que estás aprendiendo o llevar una duda a un encuentro, estos enlaces del catálogo te conectan con sus organizadores:

- [AWS Security Users Group LatAm](https://www.meetup.com/awssecuritylatam/) comparte seguridad AWS en español; su [canal de YouTube](https://www.youtube.com/@AWSSecurityLATAM) permite explorar grabaciones regionales.
- [AWS Security UserGroup Argentina](https://www.meetup.com/aws-security-usergroup-argentina/) reúne a la comunidad de seguridad en Buenos Aires y publica encuentros, incluido su historial sobre IAM.
- [AWS User Group Security Colombia](https://www.meetup.com/aws-user-group-security-colombia/) ofrece un espacio para conectar con personas que estudian y trabajan en seguridad AWS.
- [AWS User Group Security Ecuador](https://www.meetup.com/aws-user-group-security-ecuador/) anuncia encuentros especializados; su [sitio y archivo de actividades](https://www.awssecurityecuador.com/) organiza contenido sobre IAM, detección y defensa.
- El [canal de AWS Women Colombia](https://www.youtube.com/channel/UCdpHSMDDwo4_d_u3mSU41Mw) permite continuar con sus sesiones técnicas y de seguridad.
- [AWS Girls Chile](https://linktr.ee/awsgirlschile) reúne sus redes, grabaciones y actividades para el aprendizaje comunitario de AWS; es una comunidad general, no un grupo dedicado exclusivamente a Zero Trust.
- [Road to CloudSec LATAM](https://roadtocloudsec.la/) publica herramientas y experiencias de seguridad en AWS en español para seguir practicando y contrastar decisiones de operación.

### Eventos anunciados al 6 de octubre de 2026

- [DevSecOps con agentes de IA, de AWS Security Users Group LatAm](https://www.meetup.com/awssecuritylatam/events/316875555/): 15 de octubre a las 16:00 GMT-5, online. Su ficha anuncia una demostración de seguridad durante el desarrollo; permite explorar cómo llevar políticas a revisiones del software.
- [Compliance as Code en AWS, de Security Ecuador](https://www.meetup.com/aws-user-group-security-ecuador/events/316680020/): 20 de octubre a las 19:00 GMT-5, online y con cupos limitados según la ficha. Incluye un caso de credenciales IAM y controles automatizados.
- [AWS Community Day Panamá — Security & Data Edition 2026](https://www.meetup.com/aws-user-group-panama/events/316732293/): 14 de noviembre, de 08:00 a 13:00 GMT-5, presencial. Anuncia charlas de seguridad y datos; al revisar la ficha, el lugar seguía pendiente de confirmar.

Son propuestas para continuar aprendiendo seguridad, no cursos ni certificaciones de Zero Trust. Revisa inscripción, disponibilidad y condiciones en el enlace del organizador. Después de esas fechas, consulta la [agenda de eventos](/eventos/) y el [directorio de comunidades](/comunidades/); los [recursos para aprender](/aprender/) y [canales de creadores](/creadores/) permiten encontrar más contenido en español.

## Preguntas frecuentes

### ¿Una VPC privada o una VPN bastan para implementar Zero Trust?

No. Controlan conectividad, pero debes autenticar y autorizar el acceso a cada recurso protegido. Estar en la misma red no equivale a permiso para leer datos.

### ¿IAM Identity Center autentica a los clientes de mi aplicación?

Está orientado a las identidades de tu equipo y su acceso a cuentas y aplicaciones. Para clientes de una aplicación, evalúa el proveedor de identidad y los mecanismos de autenticación que correspondan, como Cognito. Después define la autorización sobre los objetos de negocio.

### ¿Tengo que activar Verified Access, VPC Lattice y Verified Permissions?

No. Resuelven casos distintos. Elige por el flujo de acceso que debes proteger, las integraciones disponibles y sus costos; sumar servicios no prueba que el acceso esté bien diseñado.

### ¿Zero Trust garantiza que no habrá incidentes?

No. Reduce confianza implícita y limita el alcance del acceso. Sigue siendo necesario proteger credenciales, corregir vulnerabilidades, comprobar permisos y preparar la respuesta a incidentes.
