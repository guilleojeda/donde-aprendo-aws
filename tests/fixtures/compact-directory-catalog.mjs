import catalog from './catalog.json' with { type: 'json' };
import directoryResources from './compact-directory-resources.json' with { type: 'json' };
import pathResources from './compact-learning-path-resources.json' with { type: 'json' };

// Keep every existing resource/count while exercising series associations from
// the same creator-state fixture path used for selection eligibility.
const resourceId = 'fixture-no-country-reference';
const fixture = {
  items: [...catalog, ...directoryResources, ...pathResources],
  profiles: [
    { id: 'fixture-series-ana', displayName: 'Ana de pruebas', slug: 'fixture-series-ana', published: true, hidden: false },
    { id: 'fixture-series-bea', displayName: 'Bea de pruebas', slug: 'fixture-series-bea', published: true, hidden: false },
  ],
  placements: [
    { id: 'fixture-placement-ana', profileId: 'fixture-series-ana', resourceId, selected: true, series: { 'fixture-series-visible': { position: 0 } } },
    { id: 'fixture-placement-bea', profileId: 'fixture-series-bea', resourceId, selected: false, series: { 'fixture-series-withdrawn': { position: 0 } } },
  ],
  series: [
    { id: 'fixture-series-visible', profileId: 'fixture-series-ana', name: 'Ruta Zafiro de pruebas', slug: 'ruta-zafiro', version: 1 },
    { id: 'fixture-series-withdrawn', profileId: 'fixture-series-bea', name: 'Ruta Opalo retirada', slug: 'ruta-opalo', version: 1 },
  ],
};
process.stdout.write(`${JSON.stringify(fixture, null, 2)}\n`);
