---
title: "Servicios de seguridad de AWS: cuál usar para cada problema"
description: "Compara IAM, CloudTrail, Config, GuardDuty, Inspector, Macie, WAF y Shield. Distingue Security Hub de Security Hub CSPM y elige servicios según el riesgo y el costo."
author: "guille-ojeda"
publishedAt: "2024-01-25"
publishedTimestamp: "2024-01-25T01:35:54.384Z"
modifiedTimestamp: "2026-10-05T12:46:00-03:00"
cover: "/assets/blog/editorial-seguridad.png"
coverAlt: "Un escudo y una llave junto a un camino azul con un punto naranja."
ogImage: "/assets/blog/editorial-seguridad.png"
related:
  - title: "Seguridad en AWS para principiantes: fundamentos y responsabilidad compartida"
    url: "https://dondeaprendoaws.com/blog/aws-seguridad-fundamentos-esenciales/"
  - title: "Mejores prácticas de seguridad en AWS: checklist y cómo verificarlas"
    url: "https://dondeaprendoaws.com/blog/aws-seguridad-mejores-practicas/"
---

**Elige los servicios de seguridad de AWS por la pregunta que necesitas responder.** IAM controla acceso; CloudTrail registra actividad; Config sigue configuraciones; GuardDuty detecta amenazas; Inspector busca vulnerabilidades; Macie descubre datos sensibles en S3. Security Hub ayuda a reunir y priorizar señales, mientras que Security Hub CSPM evalúa la postura de seguridad mediante controles.

Se complementan, pero activar uno no cubre las funciones de los demás. Esta guía te ayuda a decidir cuál investigar y qué limitaciones comprobar antes de habilitarlo.

## Mapa rápido: problema, servicio y límite

| Necesitas… | Servicio o función | Límite que debes recordar |
| --- | --- | --- |
| Dar acceso a personas y aplicaciones | IAM e IAM Identity Center | Autenticar una identidad no determina todos sus permisos |
| Averiguar quién cambió un recurso | AWS CloudTrail | El historial automático no contiene todos los tipos de eventos |
| Saber cómo cambió su configuración | AWS Config | Solo registra recursos y alcance configurados y compatibles |
| Detectar actividad sospechosa | Amazon GuardDuty | Un hallazgo requiere evaluación y respuesta |
| Encontrar software vulnerable | Amazon Inspector | Debes comprobar los recursos elegibles y su cobertura |
| Localizar información sensible en S3 | Amazon Macie | El resultado depende de objetos analizables e identificadores utilizados |
| Evaluar configuraciones contra controles | AWS Security Hub CSPM | Muchos controles necesitan AWS Config |
| Correlacionar señales y priorizar riesgos | AWS Security Hub | Necesita las fuentes habilitadas y su cobertura |
| Filtrar solicitudes web | AWS WAF | Las reglas no reemplazan la seguridad de tu código |
| Mitigar ataques DDoS | AWS Shield | Standard y Advanced tienen condiciones y capacidades distintas |

Si aún no puedes identificar tus responsabilidades sobre una aplicación, empieza por los [fundamentos de seguridad en AWS](https://dondeaprendoaws.com/blog/aws-seguridad-fundamentos-esenciales/). Para una explicación comunitaria en video de varios servicios de la tabla, puedes consultar la [sesión de AWS Girls sobre WAF, Shield, GuardDuty, Inspector, KMS, SSM, Macie y ACM](https://www.youtube.com/watch?v=o1JTHULtQxc). Las grabaciones anteriores pueden mostrar otros nombres o interfaces; contrasta la configuración con las guías actuales.

## Identidades y permisos: IAM, Identity Center y Access Analyzer

**IAM** define permisos para acceder a recursos de AWS. **IAM Identity Center**, antes llamado AWS Single Sign-On, administra el acceso de personas a cuentas y aplicaciones. AWS recomienda acceso federado y credenciales temporales para las personas, y roles para las cargas de trabajo. Consulta las [prácticas de IAM](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html) y la [introducción a IAM Identity Center](https://docs.aws.amazon.com/singlesignon/latest/userguide/what-is.html).

Por ejemplo, una función Lambda que lee archivos de S3 debe utilizar su rol de ejecución con los permisos necesarios, en lugar de una clave permanente guardada en el código. Para usuarios finales de tu propia aplicación, la autenticación de clientes es otra necesidad; no la confundas con el acceso del equipo a la consola de AWS.

**IAM Access Analyzer** ayuda a validar políticas y analizar acceso a recursos compatibles. Úsalo para revisar una política o investigar una exposición; no es un escáner general de vulnerabilidades ni una comprobación universal de MFA. La [guía de validación de políticas](https://docs.aws.amazon.com/IAM/latest/UserGuide/access-analyzer-policy-validation.html) explica una de sus funciones.

## Datos y secretos: KMS, Secrets Manager y Certificate Manager

Estos servicios resuelven tres necesidades diferentes:

- [AWS KMS](https://docs.aws.amazon.com/kms/latest/developerguide/overview.html) administra claves para operaciones de cifrado y firma. Necesitas definir quién puede usarlas y administrarlas.
- [AWS Secrets Manager](https://docs.aws.amazon.com/secretsmanager/latest/userguide/intro.html) almacena y permite recuperar secretos de aplicaciones, como contraseñas de bases de datos. La rotación requiere una configuración compatible.
- [AWS Certificate Manager (ACM)](https://docs.aws.amazon.com/acm/latest/userguide/acm-overview.html) administra certificados SSL/TLS para sitios y aplicaciones. Un certificado no configura por sí solo todas las conexiones para utilizar HTTPS.

Ejemplo: una aplicación puede usar un certificado de ACM en su balanceador, recuperar una contraseña desde Secrets Manager y utilizar una clave KMS para cifrar datos. Ninguno de esos pasos corrige una política de lectura demasiado amplia. El acceso y el cifrado son controles que debes revisar por separado.

## Evidencia de actividad y configuración: CloudTrail frente a Config

**CloudTrail responde «¿quién hizo qué y cuándo?»** Registra eventos de actividad. El historial automático conserva 90 días de eventos de administración por Región. Para un registro continuo y otros tipos de eventos, configura un trail o una opción compatible; selecciona los eventos de datos cuando los necesites. AWS explica las diferencias en [cómo funciona CloudTrail](https://docs.aws.amazon.com/awscloudtrail/latest/userguide/how-cloudtrail-works.html).

**Config responde «¿qué configuración tenía el recurso y cómo cambió?»** Registra el estado de recursos compatibles y permite evaluarlo mediante reglas. Debes configurar el alcance del registro, los tipos de recursos y la frecuencia; no asumas que inventaría automáticamente todo el entorno. Consulta [qué hace AWS Config](https://docs.aws.amazon.com/config/latest/developerguide/WhatIsConfig.html) y [cómo selecciona y registra recursos](https://docs.aws.amazon.com/config/latest/developerguide/select-resources.html).

Para investigar un security group abierto a internet, CloudTrail puede mostrar la llamada que añadió una regla. Config puede mostrar la evolución de la configuración, si registraba ese recurso. Sus evidencias ayudan a reconstruir el caso, pero requieren cobertura previa y una conservación adecuada.

Config factura elementos de configuración y evaluaciones según su modalidad; almacenamiento y otros servicios pueden sumar cargos. Revisa los [precios de AWS Config](https://aws.amazon.com/config/pricing/) antes de habilitar registro amplio, especialmente si creas y eliminas muchos recursos temporales.

## Amenazas, vulnerabilidades y datos sensibles: tres preguntas distintas

### GuardDuty: ¿hay indicios de actividad maliciosa?

[Amazon GuardDuty](https://docs.aws.amazon.com/guardduty/latest/ug/what-is-guardduty.html) analiza señales para identificar amenazas, como posibles credenciales comprometidas o actividad de minería no autorizada. Sus fuentes fundamentales incluyen eventos de administración de CloudTrail, flujos de red y DNS; no necesitas crear tu propio trail ni activar VPC Flow Logs para que GuardDuty analice esas fuentes.

Los planes de protección amplían el alcance a determinados servicios y tipos de actividad. Comprueba cuáles están activos, en qué cuentas y Regiones y con qué costo. **Un hallazgo de GuardDuty no bloquea automáticamente al atacante.** Una respuesta necesita un procedimiento o un flujo configurado.

Para seguir esa idea, tienes la [presentación de Gerardo Castro sobre detección y respuesta con GuardDuty](https://speakerdeck.com/gerardokaztro/como-detectar-y-responder-amenazas-con-aws-guardduty) y la [charla de CreaTicas sobre integración de GuardDuty con un SIEM](https://www.youtube.com/watch?v=CQUICC2h0Oc). Son materiales para estudiar integración y respuesta; verifica los pasos vigentes antes de desplegar.

### Inspector: ¿qué software vulnerable o exposición puedo corregir?

[Amazon Inspector](https://docs.aws.amazon.com/inspector/latest/user/what-is-inspector.html) descubre y examina recursos compatibles, incluidos instancias EC2, imágenes de contenedor en ECR y funciones Lambda. Genera hallazgos de vulnerabilidades de software y, para EC2, de exposición de red no deseada.

No equivale a probar cualquier aplicación en ejecución ni a auditar todas las bases de datos RDS. Su cobertura depende del recurso y del modo de análisis. Revisa los recursos cubiertos y los que no se pueden examinar: «sin hallazgos» y «sin escanear» son situaciones diferentes. La [introducción breve a Inspector de Tech with Sheyla](https://www.youtube.com/watch?v=ulMDyiJUM80) sirve para reconocer el servicio antes de estudiar sus requisitos.

### Macie: ¿dónde guardo datos sensibles en S3?

[Amazon Macie](https://docs.aws.amazon.com/macie/latest/user/what-is-macie.html) inventaría buckets de propósito general de S3, revisa riesgos de seguridad y acceso, y descubre información sensible mediante identificadores administrados o personalizados. Puedes estudiar la [sesión de AWS Women Colombia dedicada a Macie](https://www.youtube.com/watch?v=kI55YRrcTjk).

Es útil para investigar si determinados objetos contienen datos personales o credenciales. La cobertura depende de los objetos analizables, permisos y criterios de detección; el descubrimiento automático utiliza muestreo. Encontrar datos sensibles no los cifra, borra ni vuelve privados automáticamente. La detección de actividad de acceso sospechosa corresponde a otras señales, como GuardDuty S3 Protection.

## Security Hub y Security Hub CSPM: qué cambia entre los nombres

La documentación actual distingue dos servicios complementarios:

- **Security Hub CSPM** evalúa la postura de seguridad: ejecuta controles contra prácticas y estándares, y reúne hallazgos. La mayoría de sus controles necesita AWS Config registrando los recursos correspondientes.
- **Security Hub** ofrece una experiencia unificada para correlacionar señales de postura, vulnerabilidades, amenazas y datos sensibles, y priorizar los riesgos con contexto. Recibe señales de CSPM, Inspector, GuardDuty y Macie, entre otras fuentes.

AWS explica la relación en [qué son Security Hub y Security Hub CSPM](https://docs.aws.amazon.com/securityhub/latest/userguide/what-are-securityhub-services.html). Si una guía antigua llama «Security Hub» al panel de controles y estándares, consulta la [guía actual de CSPM](https://docs.aws.amazon.com/securityhub/latest/userguide/what-is-securityhub.html); para la experiencia unificada, consulta la [introducción a Security Hub](https://docs.aws.amazon.com/securityhub/latest/userguide/what-is-securityhub-v2.html).

Ejemplo: una vulnerabilidad crítica tiene una prioridad distinta si afecta un recurso expuesto a internet con acceso a datos sensibles. La correlación ayuda a decidir qué atender primero, pero no amplía mágicamente la cobertura de los servicios que producen las señales.

Los flujos automatizados requieren configuración y permisos. Actualizar la severidad o el estado de un hallazgo no es lo mismo que corregir un recurso. Define la acción, prueba su impacto y confirma el resultado antes de automatizar aislamiento o cambios de acceso.

## Tráfico web y DDoS: WAF frente a Shield

[AWS WAF](https://docs.aws.amazon.com/waf/latest/developerguide/waf-chapter.html) inspecciona solicitudes HTTP(S) hacia recursos compatibles y aplica reglas, por ejemplo para patrones de inyección SQL, IPs o tasas de solicitudes. Necesitas asociar la protección al recurso y ajustar las reglas para tu aplicación. No corrige una vulnerabilidad en el código ni funciona como escáner de puertos.

[Shield Standard](https://docs.aws.amazon.com/waf/latest/developerguide/ddos-standard-summary.html) proporciona automáticamente protección sin cargo adicional contra ataques DDoS comunes de red y transporte. [Shield Advanced](https://docs.aws.amazon.com/waf/latest/developerguide/ddos-advanced-summary.html) requiere una suscripción y registrar recursos para obtener protecciones adicionales; sus capacidades dependen de la arquitectura y configuración. No lo habilites como si fuera un ajuste gratuito de una cuenta de aprendizaje.

WAF y Shield son servicios diferentes. Puedes necesitarlos juntos para una aplicación pública, según sus riesgos, sin que eso elimine los controles de acceso ni las medidas de disponibilidad.

## Organización, investigación y auditoría: cuándo ampliar el conjunto

Para varias cuentas, **AWS Organizations** y sus [políticas de control de servicios (SCP)](https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_policies_scps.html) permiten establecer límites de permisos. Una SCP no concede permisos; limita lo que las identidades de las cuentas afectadas pueden recibir. [AWS Firewall Manager](https://docs.aws.amazon.com/waf/latest/developerguide/fms-chapter.html) administra políticas de protección de manera centralizada cuando necesitas aplicarlas a varios recursos y cuentas.

Para investigar señales, [Amazon Detective](https://docs.aws.amazon.com/detective/latest/userguide/what-is-detective.html) facilita analizar actividad y relaciones. Para trabajar con evidencia de controles, [AWS Audit Manager](https://docs.aws.amazon.com/audit-manager/latest/userguide/what-is.html) ayuda a recopilarla; [AWS Artifact](https://docs.aws.amazon.com/artifact/latest/ug/what-is-aws-artifact.html) permite consultar informes y acuerdos de AWS. Ninguno certifica automáticamente el cumplimiento de tu aplicación.

No necesitas adoptar todo este conjunto para aprender. Elige primero una necesidad concreta, comprueba compatibilidad y costos, y determina quién revisará la evidencia generada. El [checklist de seguridad con comprobaciones](https://dondeaprendoaws.com/blog/aws-seguridad-mejores-practicas/) te ayuda a verificar esos controles.

## Dónde seguir aprendiendo y conversar sobre los servicios

Además de las sesiones enlazadas junto a cada servicio, puedes seguir estas fuentes:

- [AWS Security Users Group LatAm en YouTube](https://www.youtube.com/@AWSSecurityLATAM): grabaciones en español para profundizar en seguridad, investigación y respuesta.
- [AWS User Group Security Ecuador](https://www.awssecurityecuador.com/): materiales y encuentros para conversar sobre IAM, GuardDuty, CloudTrail y controles preventivos. Su [AWS & Cloud Native Security Night](https://www.meetup.com/aws-user-group-security-ecuador/events/316815633/) está anunciado para el **23 de octubre de 2026, de 17:00 a 20:00 de Ecuador (UTC−5), en Guayaquil**, con foco en contenedores y seguridad. El organizador indica entrada gratuita con cupos limitados; revisa el registro y lugar antes de asistir.
- [AWS User Group CreaTicas](https://www.meetup.com/chiapa-uk-aws-users-meetup-group/): comunidad de Costa Rica que organiza sesiones técnicas, incluida seguridad, para seguir aprendiendo con otras personas.
- [AWS User Group Panamá](https://www.meetup.com/aws-user-group-panama/): comunidad generalista para estudiar AWS y consultar actividades. Puedes llevar dudas sobre cómo encajan los controles de seguridad en una arquitectura completa.

Para practicar, utiliza una cuenta de laboratorio, datos ficticios y permisos acotados. Revisa precios y condiciones de prueba antes de activar un servicio. Al terminar, elimina los recursos creados y revisa servicios, almacenamiento de registros y suscripciones que puedan seguir generando cargos.
