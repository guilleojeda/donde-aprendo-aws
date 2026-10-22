import assert from 'node:assert/strict';
import test from 'node:test';
import offer from './fixtures/certification-offer.json' with { type: 'json' };
import { lookupResourceCollection, resolveResourceCollectionFaq, groupCertificationResources } from '../src/lib/resource-collections.mjs';
import { landingSearchPages } from '../src/lib/landing-search.mjs';
import { buildSearchIndex, searchIndex } from '../src/lib/unified-search.mjs';

// Snapshot expectations come from the dated official-source research, not the
// product registry. Recheck changing AWS facts at delivery; this is not a promise
// that these exam codes stay current indefinitely.
const path = '/aprender/certificaciones/';
const collection = lookupResourceCollection(path);
const faq = resolveResourceCollectionFaq(collection, []);

test('certifications metadata describes choosing a credential and preparing for it', () => {
  assert.match(collection.title, /certificaciones AWS/iu);
  assert.match(collection.title, /elegir/iu);
  assert.match(collection.title, /preparar/iu);
  assert.match(collection.description, /certificaciones/iu);
  assert.match(collection.description, /eleg|objetivo|perfil/iu);
});

test('the complete offer is searchable even when the resource catalog is empty', () => {
  const index = buildSearchIndex([], [], [], landingSearchPages([]));
  const destinations = index.filter(({ url }) => url === path);
  assert.equal(destinations.length, 1, 'The existing hub remains one search destination.');
  for (const certification of offer.certifications) {
    for (const code of certification.codes) {
      assert.ok(searchIndex(index, code).some(({ url }) => url === path),
        `${code}: discovery must not depend on a published resource mentioning it.`);
    }
  }
  for (const { question, answer } of faq) {
    assert.ok(destinations[0].search.includes(question), 'Search includes the resolved FAQ question.');
    assert.ok(destinations[0].search.includes(answer), 'Search includes the resolved FAQ answer.');
  }
});

const faqCoverage = [
  ['offer and categories', /qu[eé].*certificaci|cu[aá]les.*certificaci|niveles|categor[ií]as/iu, /Foundational|Associate|Professional|Specialty|Business/u],
  ['choosing by objective and experience', /elegir|cu[aá]l.*(?:eleg|conviene|certificaci[oó]n)|por d[oó]nde empezar/iu, /objetivo|experiencia|perfil/iu],
  ['prior certification is not mandatory', /obligatori|requisit|antes de|previa/iu, /no (?:es |son |hay |se )?(?:obligatori|requisit|exig)|no exige|no necesitas/iu],
  ['certification versus a course certificate', /curso.*certific|certificad|insignia/iu, /examen/iu],
  ['microcredentials as a different assessment', /microcredencial/iu, /pr[aá]ctic|evaluaci[oó]n|diferente/iu],
  ['beta, updates and retirement', /beta|actualiza|retiro|retira/iu, /beta|versi[oó]n|retiro|retira/iu],
  ['exam code and older material', /c[oó]digo|versi[oó]n|material.*(?:anterio|antigu)|actualiza/iu, /gu[ií]a|temario|objetivos/iu],
  ['Spanish exam and resource availability', /espa[nñ]ol|idioma/iu, /examen|recurso|material/iu],
  ['free study versus paid access and exam fee', /gratis|gratuit|pago/iu, /examen|suscripci[oó]n|proveedor/iu],
  ['experience, programming and AWS account', /experiencia|program|cuenta.*AWS/iu, /recomend|requisit|pr[aá]ctica|servicios/iu],
  ['resource selection and dated review', /seleccion|revis|actualiz.*recurso/iu, /fecha/iu],
  ['price, taxes and current promotions', /cu[aá]nto cuesta|precio|costo|pagar/iu, /impuesto|moneda|promoci[oó]n|tarifa/iu],
  ['booking and online or test-center modality', /inscrib|agend|reserv|rendir|modalidad/iu, /Pearson|centro|online|en l[ií]nea/iu],
  ['results and retries', /resultado|reintent|reprueb|desaprueb/iu, /d[ií]as|intento|pol[ií]tica/iu],
  ['rescheduling and cancellation', /cancel|reprogram/iu, /24|pol[ií]tica|condicion/iu],
  ['validity and renewal', /vigencia|venc|renov|recertific|dura.*certificaci[oó]n/iu, /tres a[nñ]os|3 a[nñ]os|recertific|renov/iu],
  ['limited local coverage', /no hay|todas.*certificaci|sin.*recurso/iu, /oficial/iu],
  ['contributing resources and reporting corrections', /suger|report|correg|propon|contribu/iu, /suger|report|contribu|contact|formulario/iu],
];

for (const [topic, questionPattern, answerPattern] of faqCoverage) {
  test(`the general FAQ addresses ${topic}`, () => {
    const candidates = faq.filter(({ question }) => questionPattern.test(question));
    assert.ok(candidates.length, `A reader can find the question about ${topic}.`);
    assert.ok(candidates.some(({ answer }) => answerPattern.test(answer)),
      `The answer addresses ${topic}, rather than only naming it in a question.`);
  });
}

test('general answers and official references remain available without catalog examples', () => {
  assert.equal(new Set(faq.map(({ question }) => question)).size, faq.length);
  assert.ok(faq.every(({ question, answer }) => question.trim() && answer.trim()));
  const links = faq.flatMap(({ links = [] }) => links);
  assert.ok(links.some(({ href }) => new URL(href, 'https://dondeaprendoaws.com').hostname === 'aws.amazon.com'),
    'Answers link to the official conditions rather than inventing site-owned AWS policies.');
  assert.ok(links.every(({ href }) => !href.includes('#resource-')),
    'An empty catalog must not leave a fabricated resource example in a general answer.');
});

test('historical library group IDs remain usable without equating SysOps with CloudOps', () => {
  const groups = groupCertificationResources([
    { id: 'old', title: 'SysOps Administrator SOA-C02' },
    { id: 'saa', title: 'SAA-C03' },
    { id: 'sap', title: 'SAP-C02' },
    { id: 'clf', title: 'CLF-C02' },
  ]);
  const sysops = groups.find(({ id }) => id === 'sysops');
  assert.deepEqual(sysops.filterResources.map(({ id }) => id), ['old']);
  assert.match(sysops.description, /anterior|hist[oó]ric|retirad/iu);
  const architects = groups.find(({ id }) => id === 'solutions-architect');
  assert.deepEqual(architects.filterResources.map(({ id }) => id), ['saa', 'sap']);
  assert.match(architects.description, /Associate.*Professional|Professional.*Associate/iu);
  assert.deepEqual(groups.find(({ id }) => id === 'cloud-practitioner').filterResources.map(({ id }) => id), ['clf']);
});
