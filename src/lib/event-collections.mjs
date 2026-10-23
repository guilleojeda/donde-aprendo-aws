/** Stable event collections derived only from the published event mode. */
export const EVENT_COLLECTIONS = Object.freeze({
  online: Object.freeze({
    path: '/eventos/online/',
    label: 'Eventos AWS online e híbridos',
    title: 'Eventos AWS online e híbridos | ¿Dónde Aprendo AWS?',
    description: 'Encuentra eventos AWS publicados con participación online, incluidos los híbridos y los finalizados, organizados por comunidades de Latinoamérica. Consulta fechas, horarios, comunidad organizadora y enlaces al evento.',
    intro: 'Explora eventos AWS publicados con participación online, incluidos los híbridos y los finalizados, de comunidades de Latinoamérica. En cada ficha encuentras fecha, horario, comunidad organizadora y enlaces al evento.',
    modes: Object.freeze(['online', 'hybrid']),
  }),
  presenciales: Object.freeze({
    path: '/eventos/presenciales/',
    label: 'Eventos AWS presenciales e híbridos',
    title: 'Eventos AWS presenciales e híbridos | ¿Dónde Aprendo AWS?',
    description: 'Encuentra eventos AWS publicados con participación presencial, incluidos los finalizados y los híbridos, organizados por comunidades de Latinoamérica. Consulta fechas, horarios, lugar y enlaces al evento.',
    intro: 'Explora eventos AWS publicados con participación presencial, incluidos los finalizados y los híbridos. En cada ficha encuentras fecha, horario, comunidad organizadora, lugar y enlaces al evento.',
    modes: Object.freeze(['in-person', 'hybrid']),
  }),
});

const collectionsByPath = new Map(Object.values(EVENT_COLLECTIONS).map((collection) => [collection.path, collection]));

export function eventCollectionForPath(path) {
  return collectionsByPath.get(path);
}

/** Filter deduplicated groups by whether any published co-host has an included mode. */
export function eventGroupsForModes(groups, modes) {
  if (modes === undefined) return groups;
  const includedModes = new Set(modes);
  return groups.filter(({ events }) => events.some(({ mode }) => includedModes.has(mode)));
}
