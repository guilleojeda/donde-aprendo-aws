import { aggregateSearchData, searchIndex, TYPE_LABELS } from '../lib/unified-search.mjs';

const form = document.querySelector('[data-unified-search]');
const queryInput = document.querySelector('#site-query');
const typeSelect = document.querySelector('#site-type');
const status = document.querySelector('[data-search-status]');
const list = document.querySelector('[data-search-results]');
const more = document.querySelector('[data-search-more]');
const pageSize = 20;
let indexPromise;
let matches = [];
let shown = 0;
let searchVersion = 0;

function loadIndex() {
  indexPromise ??= fetch('/search-index.json')
    .then((response) => {
      if (!response.ok) throw new Error(`Search index: HTTP ${response.status}`);
      return response.json();
    });
  return indexPromise;
}

function showNextPage() {
  const page = matches.slice(shown, shown + pageSize);
  for (const result of page) {
    const item = document.createElement('li');
    const link = document.createElement('a');
    const label = document.createElement('span');
    const title = document.createElement('strong');
    const description = document.createElement('p');
    link.href = result.url;
    label.textContent = TYPE_LABELS[result.type] ?? 'Recurso';
    title.textContent = result.title;
    description.textContent = result.description;
    link.append(label, title, description);
    item.append(link);
    list.append(item);
  }
  shown += page.length;
  more.hidden = shown >= matches.length;
  if (!more.hidden) more.textContent = `Mostrar ${Math.min(pageSize, matches.length - shown)} más`;
}

function recordAggregateSearch(query, type, count) {
  if (typeof window.gtag !== 'function') return;
  window.gtag('event', 'content_search', aggregateSearchData(query, type, count));
}

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const version = ++searchVersion;
  const query = queryInput.value.trim();
  if (!query) {
    status.textContent = 'Escribí una búsqueda para ver resultados.';
    return;
  }
  const type = typeSelect.value;
  status.textContent = 'Buscando…';
  list.replaceChildren();
  more.hidden = true;
  try {
    const index = await loadIndex();
    if (version !== searchVersion) return;
    matches = searchIndex(index, query, type);
    shown = 0;
    status.textContent = matches.length
      ? `${matches.length} ${matches.length === 1 ? 'resultado' : 'resultados'}.`
      : 'No encontramos resultados. Probá con otras palabras o elegí «Todo el sitio».';
    showNextPage();
    recordAggregateSearch(query, type, matches.length);
  } catch {
    if (version !== searchVersion) return;
    indexPromise = undefined;
    status.textContent = 'La búsqueda no está disponible en este momento. Intentá de nuevo.';
  }
});

more?.addEventListener('click', showNextPage);
