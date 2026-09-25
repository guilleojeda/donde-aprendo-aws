---
title: "Automatización de cumplimiento con AWS Config"
description: "AWS Config automatiza el cumplimiento en la nube, permitiendo monitorear, corregir y aplicar políticas de manera eficiente y sin intervención manual."
publishedAt: "2025-01-09"
publishedTimestamp: "2025-01-09T00:16:49.41Z"
cover: "/assets/blog/887b167cb63dec6854e043dc.jpg"
coverAlt: "Thumbnail for: Automatización de cumplimiento con AWS Config"
ogImage: "/assets/blog/887b167cb63dec6854e043dc.jpg"
related:
  - title: "Cómo automatizar ajustes de políticas con AWS Security Hub"
    url: "https://dondeaprendoaws.com/blog/como-automatizar-ajustes-de-politicas-con-aws-security-hub/"
    image: "/assets/blog/0a51232b23a8b40ad5b29e21.jpg"
    imageAlt: ""
  - title: "Checklist: Servicios AWS Esenciales para SAA-C03"
    url: "https://dondeaprendoaws.com/blog/checklist-servicios-aws-esenciales-para-saa-c03/"
    image: "/assets/blog/eadb9eb1eb9dfe22a3da22e2.jpg"
    imageAlt: ""
  - title: "10 Casos de Uso de ML de AWS en Agricultura"
    url: "https://dondeaprendoaws.com/blog/10-casos-de-uso-de-ml-de-aws-en-agricultura/"
    image: "/assets/blog/b531b459f1900e0e59a6d476.jpg"
    imageAlt: ""
---

<p><strong>¿Quieres simplificar el cumplimiento en la nube?</strong> <a href="https://aws.amazon.com/config/">AWS Config</a> te ayuda a monitorear y automatizar la gestión de políticas en tus recursos de AWS. Con esta herramienta, puedes:</p>
<ul><li><strong>Monitorear continuamente</strong> tus recursos y configuraciones.</li><li><strong>Corregir incumplimientos automáticamente</strong> sin intervención manual.</li><li><strong>Aplicar políticas uniformes</strong> en múltiples cuentas y regiones.</li><li><strong>Crear reglas personalizadas</strong> para necesidades específicas.</li></ul>
<p>Además, puedes integrar AWS Config con servicios como <strong><a href="https://docs.aws.amazon.com/organizations/latest/userguide/orgs_introduction.html">AWS Organizations</a></strong> y <strong><a href="https://docs.aws.amazon.com/controltower/">AWS Control Tower</a></strong> para una gestión centralizada. Si buscas una solución eficiente para mantener la seguridad y cumplir normativas en la nube, AWS Config es clave.</p>
<p><strong>¿Cómo funciona?</strong> A continuación, te explicamos cómo configurarlo, usar reglas predefinidas y personalizadas, y establecer remediaciones automáticas.</p>
<h2 id="configuracion-de-aws-config-para-el-cumplimiento">Configuración de <a href="https://aws.amazon.com/config/">AWS Config</a> para el Cumplimiento</h2>
<p><img alt="AWS Config" src="/assets/blog/f2503d2aec4e75d93ddd6b9b.jpg"/></p>
<h3 id="habilitando-aws-config">Habilitando AWS Config</h3>
<p>El primer paso para una estrategia de cumplimiento automatizada con AWS Config es configurarlo correctamente. Esto implica tomar decisiones clave sobre:</p>
<table><thead><tr><th>Aspecto</th><th>Decisión</th></tr></thead><tbody><tr><td><strong>Recursos</strong></td><td>Seleccionar tipos específicos o incluir todos los recursos de AWS</td></tr><tr><td><strong>Canal</strong></td><td>Elegir un bucket S3 para almacenar historiales</td></tr><tr><td><strong>Evaluación</strong></td><td>Determinar la frecuencia de las evaluaciones</td></tr><tr><td><strong>IAM</strong></td><td>Definir roles y permisos necesarios</td></tr></tbody></table>
<p>Es importante que el bucket S3 y los permisos IAM cumplan con las políticas de seguridad para proteger información sensible <a href="https://www.paloaltonetworks.es/cyberpedia/how-to-maintain-aws-compliance">[1]</a>.</p>
<p>Una vez habilitado AWS Config, el siguiente paso es usar las reglas predefinidas para establecer controles de cumplimiento efectivos.</p>
<h3 id="uso-de-reglas-predefinidas">Uso de Reglas Predefinidas</h3>
<p>AWS Config incluye reglas predefinidas que simplifican la implementación de controles de cumplimiento comunes <a href="https://docs.aws.amazon.com/es_es/config/latest/developerguide/evaluate-config_develop-rules_cfn-guard.html">[2]</a>. Algunas de las reglas más frecuentes son:</p>
<table><thead><tr><th>Regla</th><th>Propósito</th></tr></thead><tbody><tr><td><strong>vpc-flow-logs-enabled</strong></td><td>Verifica que los logs de flujo estén habilitados en las VPCs</td></tr><tr><td><strong>encrypted-volumes</strong></td><td>Garantiza el cifrado de los volúmenes EC2</td></tr><tr><td><strong>required-tags</strong></td><td>Asegura que se apliquen etiquetas obligatorias</td></tr><tr><td><strong>s3-bucket-public-read-prohibited</strong></td><td>Evita el acceso público a buckets S3</td></tr></tbody></table>
<p>Es recomendable comenzar con un conjunto reducido de reglas y ampliar gradualmente según las necesidades <a href="https://dev.to/sjim-akt/aws-config-para-analisis-de-seguridad-173f">[5]</a>. Si usas AWS Organizations, puedes aplicar estas reglas de forma consistente en varias cuentas <a href="https://docs.aws.amazon.com/config/latest/developerguide/service-integrations.html">[3]</a>.</p>
<p>Para evaluar el cumplimiento, AWS Config permite elegir entre evaluaciones periódicas o basadas en cambios. Para recursos críticos, activa evaluaciones basadas en cambios para identificar desviaciones rápidamente <a href="https://www.paloaltonetworks.es/cyberpedia/how-to-maintain-aws-compliance">[1]</a><a href="https://dev.to/sjim-akt/aws-config-para-analisis-de-seguridad-173f">[5]</a>.</p>
<h2 id="creacion-de-reglas-personalizadas-con-aws-config">Creación de Reglas Personalizadas con AWS Config</h2>
<p>Cuando las reglas predefinidas no cubren tus necesidades, AWS Config te permite establecer controles específicos para garantizar que las políticas de tu organización se apliquen automáticamente. Esto puede lograrse a través de dos métodos principales: <strong>AWS CloudFormation Guard</strong> para reglas más simples y <strong>AWS Lambda</strong> para escenarios más avanzados.</p>
<h3 id="reglas-personalizadas-con-aws-cloudformation-guard">Reglas Personalizadas con <a href="https://docs.aws.amazon.com/cfn-guard/latest/ug/what-is-guard.html">AWS CloudFormation Guard</a></h3>
<p><img alt="AWS CloudFormation Guard" src="/assets/blog/b5e090d539bd27faaf661c8e.jpg"/></p>
<p>AWS CloudFormation Guard utiliza una sintaxis declarativa que facilita la creación de reglas personalizadas, incluso si no tienes experiencia en programación <a href="https://docs.aws.amazon.com/es_es/prescriptive-guidance/latest/patterns/create-aws-config-custom-rules-by-using-aws-cloudformation-guard-policies.html">[4]</a>. Por ejemplo, para asegurarte de que las instancias EC2 tengan una etiqueta 'Ambiente' con el valor 'Produccion', podrías usar una regla como esta:</p>
<pre><code>rule "ValidacionTagsEC2" {
  condition = "resource.type == 'AWS::EC2::Instance' &amp;&amp; resource.tags['Ambiente'] == 'Produccion'"
  action = "NON_COMPLIANT"
}
</code></pre>
<h3 id="creacion-de-reglas-con-aws-lambda">Creación de Reglas con <a href="https://aws.amazon.com/lambda/">AWS Lambda</a></h3>
<p>Con AWS Lambda puedes abordar situaciones más complejas y conectar tus reglas con otros servicios de AWS <a href="https://docs.aws.amazon.com/es_es/config/latest/developerguide/evaluate-config_components.html">[6]</a>. Este método es ideal para:</p>
<ul><li>Validar relaciones entre múltiples recursos.</li><li>Conectar con servicios externos.</li><li>Implementar lógica avanzada para casos específicos.</li></ul>
<table><thead><tr><th>Característica</th><th>CloudFormation Guard</th><th>Lambda</th></tr></thead><tbody><tr><td><strong>Complejidad</strong></td><td>Baja a moderada</td><td>Requiere conocimientos avanzados</td></tr><tr><td><strong>Casos de Uso</strong></td><td>Validaciones básicas</td><td>Escenarios complejos</td></tr><tr><td><strong>Integración</strong></td><td>Limitada</td><td>Con cualquier servicio AWS</td></tr><tr><td><strong>Programación</strong></td><td>Sintaxis Guard</td><td>Python, Node.js, Java</td></tr></tbody></table>
<p>Es importante verificar que los permisos IAM necesarios estén configurados para que la función Lambda pueda ejecutarse correctamente. Además, la función debe incluir la lógica específica para evaluar los recursos y determinar si cumplen con las políticas establecidas.</p>
<p>Para necesidades más simples, CloudFormation Guard es una solución práctica. Sin embargo, si necesitas manejar escenarios más avanzados, Lambda ofrece una flexibilidad mucho mayor para personalizar tus reglas de cumplimiento. Ambos métodos te permiten adaptar AWS Config a los requerimientos de tu organización.</p>
<h2 id="configuracion-de-la-remediacion-automatizada">Configuración de la Remediación Automatizada</h2>
<p>La remediación automatizada es una parte crucial para mantener el cumplimiento, ya que permite corregir problemas sin intervención manual. Una vez definidas las reglas de cumplimiento, el siguiente paso es establecer acciones automáticas para resolver cualquier incumplimiento.</p>
<h3 id="configuracion-de-la-auto-remediacion">Configuración de la Auto-Remediación</h3>
<p>Para configurar la remediación automatizada en AWS Config, necesitas integrarla con <a href="https://docs.aws.amazon.com/systems-manager/">AWS Systems Manager</a> (SSM). Esto implica definir acciones correctivas utilizando funciones Lambda o acciones de SSM, asociarlas a las reglas de AWS Config y asegurarte de que los permisos de IAM estén configurados correctamente.</p>
<p>Por ejemplo, para automatizar el cifrado de volúmenes EBS que no cumplen con las políticas, puedes usar esta función Lambda:</p>
<pre><code>def remediate_unencrypted_volume(volume_id):
    ec2_client = boto3.client('ec2')
    try:
        snapshot = ec2_client.create_snapshot(VolumeId=volume_id)
        new_volume = ec2_client.create_volume(SnapshotId=snapshot['SnapshotId'], Encrypted=True)
        return True
    except Exception:
        return False
</code></pre>
<h3 id="consejos-para-una-remediacion-eficiente">Consejos para una Remediación Eficiente</h3>
<ul><li><strong>Prueba en entornos controlados</strong>: Asegúrate de que las acciones funcionen correctamente antes de aplicarlas en producción.</li><li><strong>Asegura idempotencia</strong>: Las acciones deben poder ejecutarse varias veces sin causar conflictos o duplicaciones.</li><li><strong>Monitoreo constante</strong>: Usa <a href="https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/WhatIsCloudWatch.html">AWS CloudWatch</a> para supervisar los resultados y detectar problemas rápidamente.</li><li><strong>Registros detallados</strong>: Mantén un registro de todas las remediaciones y sus resultados para auditorías y análisis futuros.</li><li><strong>Procesos de aprobación</strong>: En situaciones más complejas, considera implementar aprobaciones antes de ejecutar remediaciones automáticas.</li></ul>
<p>Si necesitas incluir aprobaciones manuales en los flujos de trabajo, <a href="https://aws.amazon.com/step-functions/">AWS Step Functions</a> es una herramienta útil. Aquí tienes un ejemplo básico de configuración:</p>
<pre><code>{
  "StartAt": "EvaluarRecurso",
  "States": {
    "EvaluarRecurso": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:REGION:ACCOUNT:function:EvaluarRecurso",
      "Next": "RequiereAprobacion"
    },
    "RequiereAprobacion": {
      "Type": "Choice",
      "Choices": [
        {
          "Variable": "$.requiereAprobacion",
          "BooleanEquals": true,
          "Next": "EsperarAprobacion"
        }
      ],
      "Default": "EjecutarRemediacion"
    }
  }
}
</code></pre>
<p>Con estas configuraciones, AWS Config no solo identifica incumplimientos, sino que también los corrige de manera automática. Más adelante, veremos ejemplos prácticos y cómo abordar problemas comunes.</p>
<h2 id="ejemplos-y-solucion-de-problemas">Ejemplos y Solución de Problemas</h2>
<h3 id="ejemplo-asegurar-volumenes-cifrados">Ejemplo: Asegurar Volúmenes Cifrados</h3>
<p>Aquí tienes una regla personalizada de AWS CloudFormation Guard que verifica si los volúmenes EBS cumplen con las políticas de cifrado:</p>
<pre><code>let ebs_volumes = Resources.*[ Type == 'AWS::EBS::Volume' ]
rule check_ebs_encryption when %ebs_volumes !empty {
    %ebs_volumes.Properties.Encrypted == true
    &lt;&lt;
        Violation: Los volúmenes EBS deben estar cifrados
        Fix: Establezca la propiedad 'Encrypted' como true
    &gt;&gt;
}
</code></pre>
<p>Además, esta función Lambda realiza la remediación automática para garantizar que los volúmenes no cifrados se actualicen correctamente:</p>
<pre><code>import boto3

def lambda_handler(event, context):
    config = boto3.client('config')
    ec2 = boto3.client('ec2')
    volume_id = event['detail']['configurationItem']['resourceId']

    try:
        snapshot = ec2.create_snapshot(
            VolumeId=volume_id,
            Description='Snapshot automático para cifrado'
        )
        waiter = ec2.get_waiter('snapshot_completed')
        waiter.wait(SnapshotIds=[snapshot['SnapshotId']])

        response = ec2.create_volume(
            SnapshotId=snapshot['SnapshotId'],
            AvailabilityZone=event['detail']['configurationItem']['availabilityZone'],
            Encrypted=True
        )

        return {
            'statusCode': 200,
            'body': f"Volumen {volume_id} cifrado exitosamente"
        }
    except Exception as e:
        return {
            'statusCode': 500,
            'body': f"Fallo al crear snapshot o volumen cifrado: {str(e)}"
        }
</code></pre>
<p>Con esta solución, puedes automatizar el cumplimiento de políticas de cifrado en tu infraestructura. A continuación, revisemos cómo resolver los problemas más comunes al trabajar con AWS Config y sus reglas.</p>
<h3 id="solucion-de-problemas-en-aws-config">Solución de Problemas en AWS Config</h3>
<p>Para que AWS Config funcione correctamente y mantenga el cumplimiento, es importante abordar los problemas más habituales. Aquí tienes un resumen práctico:</p>
<table><thead><tr><th>Problema</th><th>Solución</th></tr></thead><tbody><tr><td>Reglas no activadas</td><td>Revisa y actualiza los permisos IAM necesarios para activar las reglas.</td></tr><tr><td>Errores de entrega</td><td>Asegúrate de que el bucket S3 tenga los permisos correctos.</td></tr><tr><td>Límites de tiempo en funciones Lambda</td><td>Ajusta la configuración de timeout para evitar interrupciones.</td></tr><tr><td>Evaluaciones inconsistentes</td><td>Verifica la configuración en implementaciones multi-región.</td></tr></tbody></table>
<p>Además, puedes usar CloudTrail para investigar problemas específicos en AWS Config. Por ejemplo, este comando te permite rastrear eventos relacionados con evaluaciones:</p>
<pre><code>aws cloudtrail lookup-events --lookup-attributes AttributeKey=EventName,AttributeValue=PutEvaluations
</code></pre>
<p>Para un monitoreo más efectivo, configura <a href="https://dondeaprendoaws.com/blog/mejores-practicas-de-observabilidad-en-aws/">alarmas en CloudWatch</a> que te alerten sobre:</p>
<ul><li>Fallos en la ejecución de reglas.</li><li>Errores de entrega.</li><li>Problemas con permisos.</li><li>Timeouts en procesos de remediación.</li></ul>
<p>Estas alarmas te ayudarán a detectar y solucionar problemas rápidamente, asegurando que tu infraestructura se mantenga en línea con las políticas establecidas. &lt;/</p>
<h2 id="conclusion-y-recursos-adicionales">Conclusión y Recursos Adicionales</h2>
<h3 id="puntos-clave">Puntos Clave</h3>
<p>AWS Config es una herramienta que simplifica el <a href="https://dondeaprendoaws.com/blog/aws-seguridad-fundamentos-esenciales/">cumplimiento en AWS</a> al proporcionar:</p>
<ul><li><strong>Monitoreo continuo</strong> y evaluación automática de los recursos.</li><li><strong>Políticas personalizables</strong> mediante reglas adaptadas a necesidades específicas.</li><li><strong>Remediación automatizada</strong> para mantener el cumplimiento sin intervención manual.</li></ul>
<p>Con AWS Config, las organizaciones pueden:</p>
<ul><li>Reducir los errores humanos.</li><li>Mejorar la eficiencia en operaciones.</li><li>Asegurar configuraciones consistentes.</li><li>Facilitar los procesos de auditoría.</li></ul>
<h3 id="recursos-en-espanol-para-aprender-aws">Recursos en Español para Aprender AWS</h3>
<p>Si buscas aprender más sobre AWS Config y la automatización del cumplimiento, <a href="https://dondeaprendoaws.com/">Dónde Aprendo AWS</a> es un excelente recurso. Este sitio ofrece guías prácticas y ejemplos detallados que ayudan a implementar soluciones de cumplimiento en entornos reales.</p>
<p>Estos recursos permiten a las organizaciones gestionar el cumplimiento en AWS de forma más eficiente y efectiva. &lt;/</p>
<h2 id="preguntas-frecuentes">Preguntas Frecuentes</h2>
<h3 id="que-herramientas-pueden-usar-los-clientes-para-definir-reglas-personalizadas-en-aws-config">¿Qué herramientas pueden usar los clientes para definir reglas personalizadas en AWS Config?</h3>
<p>AWS Config ofrece dos opciones principales para crear reglas personalizadas: <strong>AWS Lambda</strong>, ideal para lógica más compleja y conexiones externas, y <strong>AWS CloudFormation Guard</strong>, diseñado para configuraciones más directas y simples.</p>
<blockquote><p>"AWS CloudFormation Guard proporciona un lenguaje de política como código para definir y hacer cumplir las reglas, ofreciendo un control más detallado y facilidad de configuración en comparación con las reglas Lambda completamente personalizadas."</p></blockquote>
<p>La herramienta adecuada dependerá de tus necesidades específicas. Aquí tienes una comparación rápida:</p>
<table><thead><tr><th>Criterio</th><th>AWS Lambda</th><th>AWS CloudFormation Guard</th></tr></thead><tbody><tr><td>Complejidad</td><td>Alta</td><td>Baja</td></tr><tr><td>Flexibilidad</td><td>Más control</td><td>Enfocado en políticas</td></tr><tr><td>Casos de uso</td><td>Lógica avanzada</td><td>Evaluaciones estándar</td></tr></tbody></table>
<p>Además, AWS Config se integra con otros servicios para facilitar una gestión eficiente del cumplimiento.</p>
<h3 id="como-se-integra-aws-config-con-otros-servicios-para-la-automatizacion-del-cumplimiento">¿Cómo se integra AWS Config con otros servicios para la automatización del cumplimiento?</h3>
<p>AWS Config trabaja junto con <strong>AWS Organizations</strong> y <strong>Control Tower</strong> para monitorear y administrar políticas en varias cuentas y regiones. Esto permite una evaluación centralizada y uniforme del cumplimiento en toda tu organización.</p>
<h3 id="como-puedo-solucionar-problemas-con-aws-config">¿Cómo puedo solucionar problemas con AWS Config?</h3>
<p>Si encuentras problemas con AWS Config, sigue estos pasos básicos:</p>
<ul><li>Revisa el panel principal para verificar el estado de cumplimiento.</li><li>Usa <strong><a href="https://docs.aws.amazon.com/awscloudtrail/latest/userguide/cloudtrail-user-guide.html">AWS CloudTrail</a></strong> para analizar los registros de cambios de configuración.</li><li>Si utilizas reglas personalizadas, valida su configuración con <strong>AWS CloudFormation Guard</strong>.</li></ul>
<p>Estos pasos te ayudarán a identificar y resolver la mayoría de los problemas comunes de manera eficiente.</p>
<h2 id="related-posts">Related posts</h2>
<ul><li><a href="https://dondeaprendoaws.com/blog/mejores-practicas-aws-para-devops/">Mejores prácticas AWS para DevOps</a></li><li><a href="https://dondeaprendoaws.com/blog/mejores-practicas-de-seguridad-en-aws/">Mejores Prácticas de Seguridad en AWS</a></li><li><a href="https://dondeaprendoaws.com/blog/como-crear-infraestructura-como-codigo-en-aws-con-aws-cloudformation/">Cómo crear Infraestructura como Código en AWS con AWS CloudFormation</a></li><li><a href="https://dondeaprendoaws.com/blog/estrategias-de-interoperabilidad-multi-cloud-con-aws/">Estrategias de Interoperabilidad Multi-Cloud con AWS</a></li></ul>
