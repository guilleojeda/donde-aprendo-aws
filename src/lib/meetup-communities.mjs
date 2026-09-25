import { COUNTRY_LABELS } from './resource-discovery.mjs';
import { projectPublicRecord } from './catalog.mjs';

const COMMUNITY_TYPES = new Set(['User Group', 'Student Builder Group']);

/** Turn a manually reviewed Meetup directory snapshot into approved catalog items. */
export function mapMeetupCommunities(directory) {
  if (!Array.isArray(directory?.groups) || directory.groups.length === 0) {
    throw new Error('Meetup directory has no groups');
  }

  const ids = new Set();
  const urls = new Set();
  return directory.groups.map((group, index) => {
    if (!/^\d+$/u.test(group.id) || ids.has(group.id)) {
      throw new Error(`Meetup group ${index + 1} has a duplicate or invalid ID`);
    }
    if (!Object.hasOwn(COUNTRY_LABELS, group.country) || !COMMUNITY_TYPES.has(group.type)) {
      throw new Error(`Meetup group ${group.id} has an invalid country or type`);
    }
    if (typeof group.name !== 'string' || !group.name.trim() || group.name.trim() !== group.name) {
      throw new Error(`Meetup group ${group.id} has an invalid name`);
    }
    let url;
    try { url = new URL(group.url); } catch { throw new Error(`Meetup group ${group.id} has an invalid URL`); }
    if (url.protocol !== 'https:' || url.hostname !== 'www.meetup.com' || !/^\/[a-z0-9_-]+\/$/iu.test(url.pathname)
      || url.search || url.hash || urls.has(url.href)) {
      throw new Error(`Meetup group ${group.id} has an invalid or duplicate URL`);
    }
    ids.add(group.id);
    urls.add(url.href);

    const country = COUNTRY_LABELS[group.country];
    const description = group.type === 'User Group'
      ? `Comunidad de usuarios de AWS en ${country}. Consulta sus encuentros y conecta con el grupo local en Meetup.`
      : `Comunidad estudiantil de AWS en ${country}. Consulta sus actividades y conecta con estudiantes en Meetup.`;
    const record = {
      id: `meetup-${group.id}`,
      title: group.name,
      url: url.href,
      description,
      category: 'Comunidad',
      order: -100 - index,
      featured: false,
      kind: 'community',
      format: group.type,
      topics: ['Comunidad'],
      country: group.country,
      published: true,
    };
    projectPublicRecord(record, index);
    return record;
  });
}
