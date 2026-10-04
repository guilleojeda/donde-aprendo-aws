/** Stable event collections derived only from the published event mode. */
export const EVENT_COLLECTIONS = Object.freeze({
  online: Object.freeze({
    path: '/eventos/online/',
    label: 'Eventos AWS online',
    title: 'Eventos AWS online | ¿Dónde Aprendo AWS?',
    description: 'Encontrá próximos eventos AWS online organizados por comunidades de Latinoamérica. Consultá fechas, horarios, comunidad organizadora y enlaces de inscripción.',
    intro: 'Explorá próximos eventos AWS online de comunidades de Latinoamérica. En cada ficha encontrás fecha, horario, comunidad organizadora y cómo inscribirte.',
    modes: Object.freeze(['online']),
  }),
  presenciales: Object.freeze({
    path: '/eventos/presenciales/',
    label: 'Eventos AWS presenciales e híbridos',
    title: 'Eventos AWS presenciales e híbridos | ¿Dónde Aprendo AWS?',
    description: 'Encontrá eventos AWS con participación presencial organizados por comunidades de Latinoamérica, incluidos los híbridos. Consultá fechas, horarios, lugar e inscripción.',
    intro: 'Explorá eventos AWS con participación presencial, incluidos los híbridos. En cada ficha encontrás fecha, horario, comunidad organizadora, lugar e inscripción.',
    modes: Object.freeze(['in-person', 'hybrid']),
  }),
});

const collectionsByPath = new Map(Object.values(EVENT_COLLECTIONS).map((collection) => [collection.path, collection]));

export function eventCollectionForPath(path) {
  return collectionsByPath.get(path);
}

/** Filter already-deduplicated groups by their stable representative event mode. */
export function eventGroupsForModes(groups, modes) {
  if (modes === undefined) return groups;
  const includedModes = new Set(modes);
  return groups.filter(({ event }) => includedModes.has(event.mode));
}
