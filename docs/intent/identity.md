# Identidad y presentación

¿Dónde Aprendo AWS? usa un signo de apertura «¿» azul tinta con un punto naranja.
El signo sugiere un recorrido y acompaña el nombre completo en cabecera y pie;
el favicon usa el mismo símbolo. Las versiones de un solo color conservan su
forma. El SVG es la fuente editable de marca y la imagen social general conserva
una exportación PNG de 1200×630.

Todas las familias, incluido el blog, comparten navegación, pie y Fira Sans
local. El tema claro conserva fondo cálido, paneles blancos y encabezados navy;
el oscuro usa fondo grafito azulado, superficies diferenciadas y texto suave.
Ambos conservan la jerarquía tipográfica y los acentos de marca. El naranja se
reserva al logo y decoración; los indicadores con texto tienen pares propios de
texto y superficie. Los controles tienen límites y foco visibles; el color nunca
es el único indicador necesario.

`src/styles/themes/light.css` y `dark.css` son los únicos dueños de colores de UI.
Definen el mismo contrato de roles semánticos para superficies, texto, acciones,
enlaces, foco, controles y estados, incluidos los roles `--astro-code-*` del
resaltado estático. Los componentes y estilos consumidores no definen colores ni
variantes de tema. Un mismo uso comparte rol; texto y fondo de una acción no se
acoplan solo porque sus valores claros coincidan. Los medios editoriales conservan
sus colores y no se invierten con filtros.

`BaseLayout` incluye ambas paletas en el `head`, claro primero y oscuro después,
inicialmente condicionado por `prefers-color-scheme: dark`. Un único script
clásico inline, procedente de `src/scripts/theme.js`, lee y aplica la elección
antes del cuerpo y conecta después el botón. Activa el oscuro cambiando el
`media` de esa paleta; no mantiene además una clase o atributo de tema. Esto
mantiene una definición por paleta y evita coordinar descargas al alternar.

Sin elección válida guardada, el sitio sigue el sistema y sus cambios. El botón
«Modo oscuro», también visible en móvil, expone `aria-pressed`; cambia de inmediato
y después intenta guardar `light` o `dark` en `dondeaprendoaws.theme` del
`localStorage` de ese navegador y origen. La elección manual prevalece entre
páginas y visitas. No se envía al servidor, URL ni Analytics. No hay un tercer modo
ni un control de restablecimiento a Sistema.

Si el navegador impide leer o escribir almacenamiento, el botón sigue funcionando
en memoria durante el documento, sin prometer persistencia entre documentos.
Al restaurar desde BFCache se relee la preferencia, salvo una elección local cuya
escritura falló, que se conserva. Las otras pestañas ya abiertas no se sincronizan
de inmediato: recogen la preferencia al cargar o restaurarse. Sin JavaScript el
CSS sigue al sistema y el botón permanece oculto. Cambiar tema conserva foco,
menús, formularios, filtros y operaciones pendientes. Los logos estándar e inverso
se seleccionan desde las paletas con dimensiones estables, incluso si la elección
manual difiere del sistema.

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

Las respuestas del FAQ de portada se abren y cierran con puntero y teclado,
también cuando JavaScript está desactivado o no se ejecuta. El navegador maneja
el acordeón con controles nativos; varias respuestas pueden permanecer abiertas
y el foco sigue en la pregunta al abrirla o cerrarla. Se conservan los enlaces
y el contenido de las respuestas.

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

En móvil, el menú conserva el foco entre su botón, el toggle de tema y sus enlaces
en orden DOM mientras está abierto; el toggle queda fuera del panel. Escape cierra
el menú y devuelve el foco a su botón. Al pasar a escritorio,
se cierra el estado móvil y la navegación con Tab continúa hacia el contenido.
Los cambios de ancho mantienen el foco en un control visible. Las URLs
inexistentes muestran «Página no encontrada» y un enlace para volver al inicio,
con estado HTTP 404 y la dirección solicitada conservada. Las reglas de Amplify
aplican este comportamiento después de las redirecciones de dominio.
