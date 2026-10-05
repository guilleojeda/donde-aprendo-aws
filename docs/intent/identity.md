# Identidad y presentación

¿Dónde Aprendo AWS? usa un signo de apertura «¿» azul tinta con un punto naranja.
El signo sugiere un recorrido y acompaña el nombre completo en cabecera y pie;
el favicon usa el mismo símbolo. Las versiones de un solo color conservan su
forma. El SVG es la fuente editable de marca y la imagen social general conserva
una exportación PNG de 1200×630.

Todas las familias, incluido el blog, comparten navegación, pie y Fira Sans
local. El fondo ligeramente cálido, los paneles blancos y la jerarquía tipográfica
hacen legibles directorios y textos largos. Azul #263457, papel #FAF8F4, texto
#48546A y secundario #606B7B forman la base. Naranja #E87722 se reserva al logo y
decoración; los indicadores con texto usan #A4470B sobre #FFF1E6. Los controles
tienen límites y foco visibles; el color nunca es el único indicador necesario.

Los textos propios usan tuteo (Aprende, Encuentra, Elige, Puedes, Comparte).
Los títulos y encabezados propios usan mayúsculas de oración y «español» en
minúscula; los nombres de servicios y las siglas conservan su capitalización.
Los títulos, nombres y descripciones externos del catálogo y las citas literales
conservan la voz de sus autores. DynamoDB sigue siendo el dueño del catálogo.
La portada presenta orientación, accesos por familia y objetivo, recomendaciones
y eventos reales, además del formulario moderado y su FAQ. Las cinco respuestas
para aprender permanecen visibles. No existe una sección de socios ni un
componente de patrocinio que la sustituya; el pie conserva sus vínculos
editoriales y sociales ordinarios.

El rediseño conserva rutas, enlaces compartibles, filtros, búsqueda privada,
agenda y zonas horarias, calendario, campos del formulario y recibo real. Los
errores nativos de validación se muestran junto a cada campo y se asocian con
aria-describedby; al corregirse desaparecen sin perder las ayudas.

El blog usa una columna de lectura de 680 px, tarjetas con títulos en HTML y un
archivo completo por año. Sus portadas forman seis familias: fundamentos,
certificación, práctica, desarrollo/serverless, seguridad y datos/IA. Las
ilustraciones comparten el recorrido azul y los puntos naranjas de la marca;
son motivos editoriales, sin representar una arquitectura técnica. Cada
artículo declara su portada y descripción alternativa; los relacionados
reutilizan las del artículo destino. Las figuras técnicas del cuerpo conservan
su contenido, proporción y atribución.

Los maestros editables viven en `public/assets/editorial/`. Ejecutar
`node scripts/generate-brand-assets.mjs` regenera sus PNG de 1200×630 y las
exportaciones generales de la marca con Sharp, ya incluido en el proyecto.
