import { filterResources } from '../lib/directory-filter.mjs';
import { bindFacetSelections, bindFilterDisclosures } from './directory-filters.js';

const controls = document.querySelector('[data-creator-filter-controls]');
const list = document.querySelector('.creator-profile__link-list');
const cards = list ? [...list.querySelectorAll('[data-creator-resource-filter-card]')] : [];
const disclosure = controls?.querySelector('[data-filter-disclosure]');

if (controls && list && cards.length && disclosure) {
  bindFilterDisclosures([disclosure]);
  const records = cards.map((card, index) => ({
    card,
    directoryIndex: index,
    kind: card.dataset.kind || '',
    format: card.dataset.format || '',
    topics: (card.dataset.topics || '').split('|').filter(Boolean),
  }));
  const fields = ['kind', 'format', 'topic'];
  const binding = bindFacetSelections(controls, {
    fields,
    defaultSort: 'recommended',
    ownedFields: fields,
    disclosure,
    includeHash: true,
    onChange: update,
    onRestore: update,
  });

  const resultCount = document.querySelector('[data-result-count]');
  const empty = document.querySelector('[data-creator-filter-empty]');
  const notice = document.querySelector('[data-creator-filter-noscript]');
  if (notice) notice.hidden = true;

  function update() {
    const matching = filterResources(records, {
      kind: binding.getState().kind,
      format: binding.getState().format,
      topic: binding.getState().topic,
    });
    const matchingSet = new Set(matching);
    for (const record of records) {
      const visible = matchingSet.has(record);
      record.card.hidden = !visible;
      record.card.setAttribute('aria-hidden', visible ? 'false' : 'true');
    }
    if (resultCount) {
      resultCount.textContent = `${matching.length} ${matching.length === 1 ? resultCount.dataset.countSingular : resultCount.dataset.countPlural}`;
    }
    if (empty) {
      if (matching.length === 0) {
        empty.hidden = false;
      } else {
        empty.hidden = true;
      }
    }
  }

  update();
  controls.dataset.creatorFilterReady = '';
}

