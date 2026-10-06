---
title: "AWS Wavelength: qué es, disponibilidad y cómo desplegarlo"
description: "Qué es AWS Wavelength, dónde está disponible y cómo empezar: zonas, opt-in, VPC, subredes, carrier gateway, Carrier IP y límites técnicos."
author: "guille-ojeda"
publishedAt: "2024-05-19"
publishedTimestamp: "2024-05-19T00:55:00.331Z"
modifiedTimestamp: "2026-10-06T16:00:55-03:00"
review:
  date: "2026-10-06"
cover: "/assets/blog/editorial-fundamentos.png"
coverAlt: "Un libro abierto junto a un camino azul con estaciones y un punto naranja."
ogImage: "/assets/blog/editorial-fundamentos.png"
related:
  - title: "Amazon VPC: subredes, rutas, NAT y seguridad en AWS"
    url: "https://dondeaprendoaws.com/blog/conceptos-basicos-y-avanzados-de-amazon-vpc/"
  - title: "Alta disponibilidad en AWS: arquitectura Multi-AZ para una app web"
    url: "https://dondeaprendoaws.com/blog/arquitecturas-de-alta-disponibilidad-en-aws/"
  - title: "Cómo analizar los costos de transferencia de datos en AWS"
    url: "https://dondeaprendoaws.com/blog/guia-completa-analisis-de-costos-de-trafico-en-aws/"

---

AWS Wavelength acerca recursos de cómputo y almacenamiento de AWS al borde de redes de operadores móviles. Puedes extender una VPC de una Región de AWS a una Wavelength Zone y ejecutar allí componentes que necesitan atender dispositivos conectados a esa red con menos saltos hasta el cómputo. El beneficio depende de la ubicación, el operador, la ruta y la aplicación: Wavelength no garantiza una latencia fija ni está disponible en cualquier ciudad. [La guía de AWS explica sus conceptos y usos](https://docs.aws.amazon.com/wavelength/latest/developerguide/what-is-wavelength.html).

## Wavelength, Local Zones y CloudFront resuelven problemas distintos

| Opción | Dónde acerca el trabajo | Cuándo evaluarla |
| --- | --- | --- |
| **Wavelength Zones** | Infraestructura de AWS en centros de datos de operadores móviles, asociada a una Región y a una ubicación de red. | Cuando los dispositivos usan la red móvil del operador compatible y una parte de la aplicación necesita cómputo cerca de ellos. |
| **AWS Local Zones** | Una extensión de una Región en una ubicación próxima a una ciudad o centro de población. | Cuando necesitas recursos de cómputo u otros servicios compatibles cerca de usuarios o instalaciones, sin depender de una ruta móvil de un operador específico. Revisa qué recursos admite cada Local Zone en su [guía de conceptos](https://docs.aws.amazon.com/local-zones/latest/ug/concepts-local-zones.html). |
| **Amazon CloudFront** | Una red de distribución que sirve contenido desde ubicaciones de borde y puede guardar objetos en caché. | Cuando quieres acercar la entrega de archivos u objetos web. CloudFront no sustituye a una instancia EC2 ejecutando lógica de aplicación en una Wavelength Zone; consulta [cómo entrega contenido](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/HowCloudFrontWorks.html). |

No necesitas mover toda una arquitectura al borde. AWS recomienda mantener en la Región los componentes menos sensibles a la latencia, los que comparten varias zonas y los que deben conservar estado; ubica en Wavelength solo el procesamiento que se beneficie de la conexión móvil cercana. La [guía de arquitectura para Wavelength](https://docs.aws.amazon.com/wavelength/latest/developerguide/architecture.html) explica este patrón de Región central y componentes de borde.

## Comprueba disponibilidad, operador y requisitos antes de diseñar

Al consultar el [mapa público de ubicaciones de AWS Wavelength](https://aws.amazon.com/wavelength/locations/) y la [tabla de zonas disponibles](https://docs.aws.amazon.com/wavelength/latest/developerguide/available-wavelength-zones.html) el **6 de octubre de 2026**, AWS mostraba ubicaciones en Norteamérica, Europa, África y Asia, asociadas a operadores como Bell, BT, KDDI, Verizon, Vodafone y Orange; la tabla también identifica a Sonatel para Dakar. En esas listas no aparecían ciudades de Latinoamérica. Es un resultado de la cobertura publicada en esa fecha, no una promesa sobre futuras ubicaciones. Consulta el inventario vigente antes de planificar.

La zona disponible para tu cuenta puede tener un nombre o una asignación distinta de la que ve otra cuenta. Desde la terminal puedes consultar las zonas Wavelength de la Región principal del despliegue, incluso antes de habilitarlas. Necesitas AWS CLI instalada, credenciales válidas para la cuenta que estás comprobando y permiso `ec2:DescribeAvailabilityZones`:

```bash
aws ec2 describe-availability-zones \
  --region us-east-1 \
  --all-availability-zones \
  --filters "Name=zone-type,Values=wavelength-zone" \
  --query 'AvailabilityZones[].{Zone:ZoneName,ZoneId:ZoneId,State:State,OptIn:OptInStatus}' \
  --output table
```

En el ejemplo, reemplaza `us-east-1` por la Región principal que corresponde a la ubicación que estás evaluando. Este comando solo consulta información; `--all-availability-zones` incluye zonas aunque tu cuenta todavía no haya optado por ellas. La [guía para encontrar zonas Wavelength](https://docs.aws.amazon.com/wavelength/latest/developerguide/wavelength-zones-describe.html) explica las diferencias entre la vista de tu cuenta y el inventario completo, y la [referencia de AWS CLI para `describe-availability-zones`](https://docs.aws.amazon.com/cli/latest/reference/ec2/describe-availability-zones.html) documenta el filtro de tipo de zona usado arriba.

Antes de desplegar, confirma también que el operador cubra a tus usuarios y consulta sus planes móviles y requisitos adicionales. No basta con elegir la ciudad más cercana: el tráfico de entrada habitual está pensado para dispositivos que llegan desde la red del operador en esa ubicación. AWS documenta excepciones de acceso para algunos socios en la página de [conectividad multiacceso](https://docs.aws.amazon.com/wavelength/latest/developerguide/multi-access.html).

Si necesitas contrastar decisiones de topología o conectividad AWS antes de elegir una zona, el [AWS User Group Networking Colombia](https://www.meetup.com/aws-user-group-networking-colombia/) describe sesiones sobre redes híbridas, enrutamiento entre cuentas, DNS y diseño de redes. Es una comunidad general de redes; su ficha no la presenta como soporte específico de Wavelength.

## Cómo empezar un despliegue

Este recorrido resume los componentes; los pasos exactos y los recursos compatibles dependen de la Región y la zona que elijas. La [guía oficial para empezar](https://docs.aws.amazon.com/wavelength/latest/developerguide/get-started-wavelength.html) contiene el procedimiento detallado de consola y AWS CLI.

1. **Valida la ubicación y la carga.** Busca la zona, identifica el operador asociado y revisa en la [guía de cuotas y consideraciones](https://docs.aws.amazon.com/wavelength/latest/developerguide/wavelength-quotas.html) los tipos de instancia, servicios compatibles y límites. Las cuotas de EC2 se gestionan en la Región principal; consulta AWS Service Quotas si necesitas verificar una cuota o pedir un aumento ajustable. Habla con el operador sobre los requisitos de conectividad para tus dispositivos.
2. **Habilita la zona para la cuenta.** En la consola EC2, selecciona la Región principal, abre *Account attributes → Zones* y administra el grupo Wavelength de esa Región. La zona debe estar habilitada antes de seleccionarla para crear recursos.
3. **Extiende la VPC a la zona.** Usa una VPC de la Región principal y crea una subred asociada a la Wavelength Zone. Crea un carrier gateway para la VPC y dirige a él el tráfico no local de la subred Wavelength. Una tabla IPv4 típica conserva `CIDR de la VPC → local` y añade `0.0.0.0/0 → cagw-id`. AWS puede crear la subred, el carrier gateway, la tabla y la asociación automáticamente cuando configuras el enrutamiento desde la consola. Si lo haces manualmente, verifica la ruta de la subred y las reglas de sus Security Groups y Network ACL. Para repasar el papel de las subredes, rutas, grupos de seguridad y NACL, continúa con nuestra guía de [Amazon VPC](/blog/conceptos-basicos-y-avanzados-de-amazon-vpc/).
4. **Lanza el componente de cómputo.** Selecciona un tipo de instancia que admita esa zona y asigna una Carrier IP a la interfaz de red de EC2. El carrier gateway traduce entre la dirección privada de la instancia y esa IPv4 del grupo de borde de red. El recurso AWS queda en la subred Wavelength; la Carrier IP permite el recorrido previsto a través del operador.
5. **Prueba el recorrido real.** Desde dispositivos conectados al operador y en la ubicación objetivo, mide la latencia y los errores del flujo completo de la aplicación. Compara con la misma carga en la Región y observa percentiles, capacidad, transferencia y costo. Una prueba desde otra red o desde la consola no representa necesariamente el camino de tus usuarios.

Para repasar VPC en español antes de crear recursos, mira estas grabaciones del canal comunitario AWS Girls:

- [AWS VPC 100](https://www.youtube.com/watch?v=7yq_7Dw4Qs8)
- [AWS VPC 200](https://www.youtube.com/watch?v=pF7cr3z1WTk)
- [AWS VPC Clase Práctica](https://www.youtube.com/watch?v=GIYD2k0dia4)

Son material complementario sobre VPC general, no tutoriales específicos de Wavelength. La [biblioteca de videos de AWS en español](https://dondeaprendoaws.com/aprender/videos/) reúne más grabaciones; para pasos y límites propios de Wavelength, usa la documentación vigente enlazada arriba.

AWS enlaza el [AWS Wavelength Workshop](https://catalog.workshops.aws/5g-edge-compute/en-US) desde la página de ubicaciones. El contenido está en inglés y recorre VPC, EC2, Systems Manager, EKS, ubicación de cargas, DNS y pruebas de rendimiento. Para seguir el laboratorio necesitas una cuenta AWS: el taller advierte que crea EC2, un clúster EKS, VPC interface endpoints y otros recursos con costo. Lee [Getting Started](https://catalog.workshops.aws/5g-edge-compute/en-US/introduction/getting-started) antes de iniciar y reserva tiempo para completar [Summary & Cleanup](https://catalog.workshops.aws/5g-edge-compute/en-US/summary); no ejecutes esos pasos en producción sin revisar los recursos que vas a crear.

La subred Wavelength no equivale a una subred pública regional: el carrier gateway admite IPv4, y el acceso entrante general iniciado desde Internet no está disponible por ese camino. Hay excepciones para algunos socios; no las supongas sin comprobar la matriz vigente. Una Carrier IP tampoco es una IP pública de EC2 intercambiable con una dirección de otra ubicación: pertenece a un grupo de borde de red. La [documentación de AWS sobre Carrier IP, carrier gateway y rutas](https://docs.aws.amazon.com/wavelength/latest/developerguide/how-wavelengths-work.html) describe la traducción NAT y el recorrido de esos paquetes.

## Límites que cambian la arquitectura

- **El catálogo de servicios no es el de una Región completa.** AWS documenta recursos como EC2, EBS, subredes VPC y carrier gateways, e integraciones con algunos servicios de administración y contenedores. La disponibilidad varía por zona y función; no presupongas que Lambda, S3, DynamoDB, SageMaker o cualquier servicio regional se ejecutan dentro de Wavelength. Revisa la lista de servicios y los límites para la zona elegida.
- **Los balanceadores requieren comprobación.** Según la guía de arquitectura consultada el 6 de octubre de 2026, Application Load Balancer está disponible solo en zonas seleccionadas; Network Load Balancer no se admite en Wavelength Zones y tampoco el balanceo entre varias Wavelength Zones. Revisa la tabla de [balanceo de carga para Wavelength](https://docs.aws.amazon.com/wavelength/latest/developerguide/architecture.html) antes de elegir un patrón de ingreso.
- **Hay restricciones de red y almacenamiento.** Las subredes Wavelength no admiten direcciones IPv6; los VPC endpoints se crean en una Availability Zone, no dentro de la Wavelength Zone. AWS también publica límites específicos para EBS e instancias, así que verifica las [consideraciones y cuotas](https://docs.aws.amazon.com/wavelength/latest/developerguide/wavelength-quotas.html) en vez de extrapolar la configuración de una Región.
- **No asumas comunicación directa entre zonas.** Instancias en dos Wavelength Zones distintas no se comunican si están en la misma VPC. Si el diseño necesita tráfico entre ellas, AWS indica separar las zonas en VPC distintas y conectarlas, por ejemplo, con Transit Gateway. Para datos compartidos o estado persistente, considera la Región principal y prueba el mecanismo de recuperación. Nuestra guía de [alta disponibilidad Multi-AZ](/blog/arquitecturas-de-alta-disponibilidad-en-aws/) explica por qué distribuir instancias, por sí solo, no garantiza que una aplicación se recupere.
- **La elegibilidad de cumplimiento no acredita tu aplicación.** AWS enumera para Wavelength programas como HIPAA, ISO, SOC y PCI DSS, pero aclara que los servicios de Wavelength requieren una evaluación separada de los que corren enteramente en una Región. La configuración, el cifrado, los permisos y las obligaciones regulatorias de tu carga siguen requiriendo revisión. Consulta la [validación de cumplimiento de AWS Wavelength](https://docs.aws.amazon.com/wavelength/latest/developerguide/compliance-validation.html) y confirma el alcance aplicable a tu caso.
- **El costo puede diferir del de la Región.** AWS indica que los recursos de Wavelength tienen precios distintos a los de la Región principal y que EC2 se ofrece bajo demanda allí; los Instance Savings Plans pueden aplicarse. Calcula cómputo, EBS y transferencia en la [página de precios de Wavelength](https://aws.amazon.com/wavelength/pricing/) y revisa también las condiciones comerciales del operador. Para localizar cargos de transferencia y separarlos de las horas y datos procesados por servicios de red, sigue con [cómo analizar los costos de transferencia de datos en AWS](/blog/guia-completa-analisis-de-costos-de-trafico-en-aws/).

## Recursos y comunidades para seguir

El [AWS User Group Perú](https://awsugperu.cloud/) mantiene una agenda, un directorio de grupos y recursos comunitarios. También puedes buscar otros grupos en nuestro [directorio de comunidades AWS](/comunidades/).

Si te interesa una sesión introductoria de redes, el AWS Student Builder Group de la Universidad Distrital publicó el encuentro virtual [“Amazon VPC Essentials: Fundamentos de Networking”](https://www.meetup.com/aws-sbg-at-francisco-jose-de-caldas-district-univ-bogota/events/316674045/) para el **21 de octubre de 2026, de 18:00 a 20:00, hora de Colombia**. La ficha indica que el enlace se muestra a asistentes y que los cupos son limitados; registra tu asistencia y confirma los detalles antes de participar. No es una sesión específica de Wavelength. Consulta también la [agenda de eventos AWS](/eventos/) para encontrar otras fechas.
