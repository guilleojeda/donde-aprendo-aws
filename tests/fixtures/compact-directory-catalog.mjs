import catalog from './catalog.json' with { type: 'json' };
import directoryResources from './compact-directory-resources.json' with { type: 'json' };
import pathResources from './compact-learning-path-resources.json' with { type: 'json' };
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// The existing fixture has 18 eligible content records. Keep its editorial
// samples and add a deterministic, valid volume case for the catalog-growth
// acceptance. The first 1,601 generated records make the base 1,619 content
// records; the last 1,000 are the approved growth scenario. These rows are
// isolated test data and are never a production catalog or editorial approval.
export const GROWTH_BASE_ADDITIONAL_COUNT = 1_601;
export const GROWTH_ADDED_COUNT = 1_000;
export const GROWTH_BASE_CONTENT_COUNT = 1_619;
export const GROWTH_TOTAL_CONTENT_COUNT = GROWTH_BASE_CONTENT_COUNT + GROWTH_ADDED_COUNT;
export const GROWTH_LAST_ID = 'growth-added-1000';

const syntheticTopics = Object.freeze([
  'Arquitectura', 'Cómputo', 'Datos', 'DevOps', 'Fundamentos',
  'Inteligencia Artificial', 'Seguridad', 'Serverless',
]);
const syntheticFormats = Object.freeze(['Artículo', 'Video', 'Curso']);
const syntheticCountries = Object.freeze(['AR', 'CL', 'CO', 'MX']);
const syntheticLevels = Object.freeze(['inicial', 'intermedio', 'avanzado']);

// Keep every existing resource/count while exercising series associations from
// the same creator-state fixture path used for selection eligibility.
const resourceId = 'fixture-no-country-reference';
// Keep counts/types while exercising the complete public identity through
// HTML attributes and the national agenda's community destination links.
const identityCommunityId = `fixture: identidad "Córdoba" &amp; AWS  ${'x'.repeat(215)}`;

function syntheticResource(phase, index) {
  const padded = String(index).padStart(4, '0');
  const topic = syntheticTopics[(index - 1) % syntheticTopics.length];
  const format = syntheticFormats[(index - 1) % syntheticFormats.length];
  const country = syntheticCountries[(index - 1) % syntheticCountries.length];
  const level = syntheticLevels[(index - 1) % syntheticLevels.length];
  const id = `growth-${phase}-${index}`;
  // Keep the existing editorial records first in the real catalog order. The
  // base batch precedes the added batch, while both remain after the fixture's
  // order-zero records.
  const order = phase === 'base' ? -index : -(GROWTH_BASE_ADDITIONAL_COUNT + index);
  return {
    id,
    title: `Recurso ${phase === 'base' ? 'base representativo' : 'agregado'} ${padded} de AWS ${topic}`,
    url: `https://growth.example.invalid/catalog/${phase}/${padded}`,
    description: `Descripción pública válida del recurso ${phase} ${padded}: AWS ${topic}, ${format} y crecimiento del catálogo.`,
    category: topic,
    order,
    featured: false,
    kind: 'content',
    format,
    topics: [topic],
    country,
    level,
    addedAt: `202${(index % 6) + 1}-01-01`,
    published: true,
    hidden: false,
    approvalRevoked: false,
    directoryControl: 'editorial',
    ...(phase === 'base' && index === 1 ? {
      submitterEmail: 'growth-private@example.invalid',
      privateNote: 'fixture-only private field must not reach the public projection',
    } : {}),
  };
}

export function createGrowthCatalog() {
  const base = [...catalog, ...directoryResources, ...pathResources].map((record) => ({
    ...record,
    ...(record.id === 'fixture-student-argentina' ? { id: identityCommunityId } : {}),
    ...(record.id === 'directory-security' ? { communityId: identityCommunityId } : {}),
  }));
  const growthBase = Array.from({ length: GROWTH_BASE_ADDITIONAL_COUNT }, (_, offset) =>
    syntheticResource('base', offset + 1));
  const growthAdded = Array.from({ length: GROWTH_ADDED_COUNT }, (_, offset) =>
    syntheticResource('added', offset + 1));
  return {
    items: [...base, ...growthBase, ...growthAdded],
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
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.stdout.write(`${JSON.stringify(createGrowthCatalog(), null, 2)}\n`);
}
