import { readFileSync } from 'node:fs';

const base = JSON.parse(readFileSync(new URL('./catalog.json', import.meta.url), 'utf8'));
const template = {
  recordType: 'event',
  description: 'Evento público para verificar el calendario.',
  timeZone: 'America/Argentina/Cordoba',
  organizer: 'AWS User Group Argentina',
  mode: 'in-person',
  country: 'AR',
  communityId: 'fixture-community-argentina',
  published: true,
};
const event = (id, title, city, date, registrationUrl) => ({
  ...template, id, title, city, place: city,
  startsAt: `${date}T10:00:00-03:00`, endsAt: `${date}T12:00:00-03:00`, registrationUrl,
});
const archive = Array.from({ length: 240 }, (_, index) => event(
  `phase6-archive-${index}`, `Evento de archivo ${index}`, 'Córdoba', '2024-05-03',
  `https://example.com/phase6/archive/${index}`,
));
const shortCity = event('phase6-short-city', 'Encuentro AWS en Córdoba', 'Córdoba', '2099-01-02',
  'https://example.com/phase6/short-city');
const longCity = event('phase6-long-city', 'Otro encuentro de AWS', 'A'.repeat(100), '2099-06-01',
  'https://example.com/phase6/long-city');
const lastDay = event('phase6-last-day', 'Encuentro al final del calendario', 'Córdoba', '9999-12-31',
  'https://example.com/phase6/last-day');
process.stdout.write(`${JSON.stringify([...base, ...archive, shortCity, longCity, lastDay])}\n`);
