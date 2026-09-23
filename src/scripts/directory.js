const directory = document.querySelector('[data-directory-controls]');
const list = document.querySelector('[data-resource-list]');

if (directory && list) {
  const search = directory.querySelector('[data-resource-search]');
  const chips = [...directory.querySelectorAll('[data-category-filter]')];
  const cards = [...list.querySelectorAll('[data-resource-index]')];
  const noResults = document.querySelector('[data-no-results]');
  const resultCount = document.querySelector('[data-result-count]');
  const showMore = document.querySelector('[data-show-more]');
  const showMoreWrap = document.querySelector('[data-show-more-wrap]');
  const pageSize = 8;
  const state = { query: '', category: '', expanded: false };

  document.documentElement.classList.add('js');

  const normalize = (value) => value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es');

  const update = () => {
    const query = normalize(state.query.trim());
    const matching = cards.filter((card) => {
      const categoryMatches = !state.category || card.dataset.category === state.category;
      const searchMatches = !query || normalize(card.dataset.search || '').includes(query);
      return categoryMatches && searchMatches;
    });
    const visible = state.expanded ? matching : matching.slice(0, pageSize);

    cards.forEach((card) => {
      const isVisible = visible.includes(card);
      card.hidden = !isVisible;
      card.setAttribute('aria-hidden', String(!isVisible));
    });

    chips.forEach((chip) => {
      const isSelected = chip.dataset.categoryFilter === state.category;
      chip.classList.toggle('is-selected', isSelected);
      chip.setAttribute('aria-pressed', String(isSelected));
    });

    const visibleCount = matching.length;
    if (resultCount) {
      resultCount.textContent = visibleCount === 1 ? '1 recurso' : `${visibleCount} recursos`;
    }
    if (noResults) noResults.hidden = visibleCount !== 0;
    if (showMoreWrap && showMore) {
      showMoreWrap.hidden = visibleCount <= pageSize;
      showMore.textContent = state.expanded ? 'Mostrar menos' : 'Mostrar Todos';
      showMore.setAttribute('aria-expanded', String(state.expanded));
      showMore.disabled = visibleCount === 0;
    }
  };

  search?.addEventListener('input', () => {
    state.query = search.value;
    state.expanded = false;
    update();
  });

  chips.forEach((chip) => {
    chip.addEventListener('click', () => {
      const category = chip.dataset.categoryFilter || '';
      state.category = state.category === category ? '' : category;
      state.expanded = false;
      update();
    });
  });

  showMore?.addEventListener('click', () => {
    state.expanded = !state.expanded;
    update();
    if (!state.expanded) list.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  update();
}
