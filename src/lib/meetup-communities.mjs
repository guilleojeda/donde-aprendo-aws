import { COUNTRY_LABELS } from './resource-discovery.mjs';
import { projectPublicRecord } from './catalog.mjs';

const COMMUNITY_TYPES = new Set(['User Group', 'Student Builder Group']);

export function canonicalMeetupSourceUrl(value) {
  if (typeof value !== 'string') return null;
  let url;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== 'https:' || url.hostname !== 'www.meetup.com'
    || url.username || url.password || url.port || url.search || url.hash
    || !/^\/[a-z0-9_-]+\/$/iu.test(url.pathname)) {
    return null;
  }
  const locator = url.origin + url.pathname;
  return url.href === locator ? locator : null;
}

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
    const url = canonicalMeetupSourceUrl(group.url);
    if (!url || urls.has(url.toLowerCase())) {
      throw new Error(`Meetup group ${group.id} has an invalid or duplicate URL`);
    }
    ids.add(group.id);
    urls.add(url.toLowerCase());

    const country = COUNTRY_LABELS[group.country];
    const description = group.type === 'User Group'
      ? `Comunidad de usuarios de AWS en ${country}. Consulta sus encuentros y conecta con el grupo local en Meetup.`
      : `Comunidad estudiantil de AWS en ${country}. Consulta sus actividades y conecta con estudiantes en Meetup.`;
    const record = {
      id: `meetup-${group.id}`,
      title: group.name,
      url,
      meetupSourceUrl: url,
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
    if (Object.hasOwn(group, 'city')) record.city = group.city;
    projectPublicRecord(record, index);
    return record;
  });
}
