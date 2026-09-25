import { filterResources } from '../lib/directory-filter.mjs';

const directory = document.querySelector('[data-directory-controls]');
const list = document.querySelector('[data-resource-list]');

if (directory && list) {
  const search = directory.querySelector('[data-resource-search]');
  const kinds = [...directory.querySelectorAll('[data-kind-filter]')];
  const formatSelect = directory.querySelector('[data-format-filter]');
  const topicSelect = directory.querySelector('[data-topic-filter]');
  const cards = [...list.querySelectorAll('[data-resource-index]')];
  const records = cards.map((card) => ({
    card,
    kind: card.dataset.kind,
    format: card.dataset.format,
    topics: (card.dataset.topics || '').split('|').filter(Boolean),
    search: card.dataset.search || '',
  }));
  const noResults = document.querySelector('[data-no-results]');
  const resultCount = document.querySelector('[data-result-count]');
  const showMore = document.querySelector('[data-show-more]');
  const showMoreWrap = document.querySelector('[data-show-more-wrap]');
  const pageSize = 8;
  const state = { query: '', kind: 'content', format: '', topic: '', expanded: false };

  document.documentElement.classList.add('js');

  const update = () => {
    const matching = filterResources(records, state);
    const visible = new Set((state.expanded ? matching : matching.slice(0, pageSize)).map(({ card }) => card));

    cards.forEach((card) => {
      const isVisible = visible.has(card);
      card.hidden = !isVisible;
      card.setAttribute('aria-hidden', String(!isVisible));
    });

    kinds.forEach((button) => {
      const selected = button.dataset.kindFilter === state.kind;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', String(selected));
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

  kinds.forEach((button) => {
    button.addEventListener('click', () => {
      state.kind = button.dataset.kindFilter || 'content';
      state.format = '';
      state.topic = '';
      if (formatSelect) formatSelect.value = '';
      if (topicSelect) topicSelect.value = '';
      for (const option of formatSelect?.options ?? []) {
        if (option.value) {
          option.hidden = !records.some((record) => record.kind === state.kind && record.format === option.value);
          option.disabled = option.hidden;
        }
      }
      for (const option of topicSelect?.options ?? []) {
        if (option.value) {
          option.hidden = !records.some((record) => record.kind === state.kind && record.topics.includes(option.value));
          option.disabled = option.hidden;
        }
      }
      state.expanded = false;
      update();
    });
  });

  formatSelect?.addEventListener('change', () => {
    state.format = formatSelect.value;
    state.expanded = false;
    update();
  });
  topicSelect?.addEventListener('change', () => {
    state.topic = topicSelect.value;
    state.expanded = false;
    update();
  });

  showMore?.addEventListener('click', () => {
    state.expanded = !state.expanded;
    update();
    if (!state.expanded) list.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  kinds.find((button) => button.dataset.kindFilter === state.kind)?.click();
}
