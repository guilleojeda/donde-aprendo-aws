import catalog from './catalog.json' with { type: 'json' };
import directoryResources from './compact-directory-resources.json' with { type: 'json' };
import pathResources from './compact-learning-path-resources.json' with { type: 'json' };

// Keep every existing resource/count while exercising series associations from
// the same creator-state fixture path used for selection eligibility.
const resourceId = 'fixture-no-country-reference';
// Keep counts/types while exercising the complete public identity through
// HTML attributes and the national agenda's community destination links.
const identityCommunityId = `fixture: identidad "Córdoba" &amp; AWS  ${'x'.repeat(215)}`;
const fixture = {
  items: [...catalog, ...directoryResources, ...pathResources].map((record) => ({
    ...record,
    ...(record.id === 'fixture-student-argentina' ? { id: identityCommunityId } : {}),
    ...(record.id === 'directory-security' ? { communityId: identityCommunityId } : {}),
  })),
  creators: [
    {
      id: 'fixture-series-ana', schemaVersion: 2, version: 1,
      displayName: 'Ana de pruebas', slug: 'fixture-series-ana', published: true, hidden: false,
      placements: {
        'fixture-placement-ana': { resourceId, selectedForDirectory: true },
      },
      order: { featured: [], ordinary: ['fixture-placement-ana'] },
      series: {
        'fixture-series-visible': {
          name: 'Ruta Zafiro de pruebas', slug: 'ruta-zafiro', chapters: ['fixture-placement-ana'],
        },
      },
    },
    {
      id: 'fixture-series-bea', schemaVersion: 2, version: 1,
      displayName: 'Bea de pruebas', slug: 'fixture-series-bea', published: true, hidden: false,
      placements: {
        'fixture-placement-bea': { resourceId, selectedForDirectory: false },
      },
      order: { featured: [], ordinary: ['fixture-placement-bea'] },
      series: {
        'fixture-series-withdrawn': {
          name: 'Ruta Opalo retirada', slug: 'ruta-opalo', chapters: ['fixture-placement-bea'],
        },
      },
    },
  ],
};
process.stdout.write(`${JSON.stringify(fixture, null, 2)}\n`);
