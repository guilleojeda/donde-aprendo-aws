const COMMUNITY_FORMAT_NAMES = Object.freeze({
  'User Group': ['AWS User Group', 'AWS User Groups'],
  'Student Builder Group': ['Student Builder Group', 'Student Builder Groups'],
  'Grupo de estudio': ['grupo de estudio', 'grupos de estudio'],
  'Comunidad en línea': ['comunidad en línea', 'comunidades en línea'],
});

export function communityFormatCounts(communities) {
  const counts = new Map();
  for (const community of communities) {
    if (!Object.hasOwn(COMMUNITY_FORMAT_NAMES, community.format)) {
      throw new Error(`No community display name is defined for ${community.format}`);
    }
    counts.set(community.format, (counts.get(community.format) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right, 'es', { sensitivity: 'base' }))
    .map(([format, count]) => ({
      format,
      count,
      label: COMMUNITY_FORMAT_NAMES[format][count === 1 ? 0 : 1],
    }));
}

export function communityFormatSummary(communities) {
  const counts = communityFormatCounts(communities);
  if (counts.length === 0) return 'No hay comunidades publicadas por ahora.';
  if (counts.length === 1) return `${counts[0].count} ${counts[0].label}`;
  return `${counts.slice(0, -1).map(({ count, label }) => `${count} ${label}`).join(', ')} y ${counts.at(-1).count} ${counts.at(-1).label}`;
}

export function communityFactText(communities, countryName) {
  if (communities.length === 0) {
    return countryName
      ? `Todavía no hay comunidades AWS publicadas en ${countryName}.`
      : 'Todavía no hay comunidades AWS publicadas en el directorio.';
  }
  return countryName
    ? `Comunidades AWS en ${countryName}: ${communityFormatSummary(communities)}.`
    : `El directorio reúne ${communityFormatSummary(communities)}.`;
}
