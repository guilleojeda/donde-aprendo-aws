import { RESOURCE_COLLECTIONS } from './resource-collections.mjs';
import { EVENT_COLLECTIONS } from './event-collections.mjs';
import { communityCountryPages, eventCountryPath } from './community-country-pages.mjs';
import { COUNTRY_LABELS } from './resource-discovery.mjs';

/** Page destinations, distinct from individual cards and their expiry. */
export function landingSearchPages(resources) {
  return [
    { path: '/aprender/', title: 'Recursos para aprender AWS en español', description: 'Artículos, videos y cursos de AWS por tema, formato y nivel.', label: 'Biblioteca de recursos' },
    { path: '/creadores/', title: 'Creadores y canales de AWS en español', description: 'Personas, blogs, canales de YouTube, podcasts y newsletters para seguir aprendiendo AWS.', label: 'Creadores y canales' },
    { path: '/comunidades/', title: 'Comunidades AWS de Latinoamérica', description: 'Encontrá AWS User Groups y Student Builder Groups por país para aprender y participar.', label: 'Directorio de comunidades' },
    { path: '/eventos/', title: 'Próximos eventos AWS en Latinoamérica', description: 'Agenda de meetups, charlas y encuentros AWS por país, fecha y modalidad.', label: 'Agenda de eventos' },
    ...RESOURCE_COLLECTIONS,
    ...Object.values(EVENT_COLLECTIONS),
    ...communityCountryPages(resources).flatMap(({ country, path }) => {
      const name = COUNTRY_LABELS[country];
      return [
        { path, title: `Comunidades AWS en ${name}`, description: `Encontrá grupos AWS en ${name}, sus enlaces y cómo participar.`, label: 'Comunidades por país', search: `AWS User Groups Student Builder Groups Cloud Clubs ${country}` },
        { path: eventCountryPath(country), title: `Eventos AWS en ${name}`, description: `Consultá próximos eventos, meetups y charlas de AWS en ${name}, con fechas, horarios e inscripción.`, label: 'Agenda por país', search: country },
      ];
    }),
  ].map((page) => ({
    ...page,
    title: page.title.split(' | ')[0],
    search: [page.search, page.intro, page.guide?.heading, page.guide?.body].filter(Boolean).join(' '),
  }));
}
