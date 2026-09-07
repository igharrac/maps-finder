/**
 * Test of we een pagina herkennen die pas met JavaScript gevuld wordt.
 *
 *   node --experimental-strip-types lib/enrichment/clientRendered.test.ts
 *
 * Dit is de bewaking op een stille fout. Zo'n pagina levert HTML op die er
 * gezond uitziet — status 200, netjes opgemaakt — maar waar niets in staat.
 * Alle detectoren melden dan "niet gevonden", en dat zou als feit over het
 * bedrijf worden opgeschreven.
 */
import assert from 'node:assert/strict';
import { looksClientRendered, zichtbareTekst } from './clientRendered.ts';
import { extractContacts } from './contacts.ts';

let failures = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ok   ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`  FOUT ${name}: ${(error as Error).message}`);
  }
}

const scripts = '<script src="/a.js"></script><script src="/b.js"></script><script src="/c.js"></script>';

console.log('\nherkenning');

check('leeg React-wortelelement is een shell', () =>
  assert.equal(looksClientRendered(`<body><div id="root"></div>${scripts}</body>`), true));

check('leeg Next.js-wortelelement is een shell', () =>
  assert.equal(looksClientRendered(`<body><div id="__next"></div>${scripts}</body>`), true));

check('veel scripts en nauwelijks tekst is een shell', () =>
  assert.equal(looksClientRendered(`<body><div class="app">Laden…</div>${scripts}</body>`), true));

check('gewone pagina met inhoud is GEEN shell', () => {
  const html = `<body><h1>Dakdekker</h1><p>${'Wij vervangen dakbedekking in heel Noord-Holland. '.repeat(20)}</p></body>`;
  assert.equal(looksClientRendered(html), false);
});

check('pagina met inhoud plus veel scripts is GEEN shell', () => {
  const html = `<body><h1>Dakdekker</h1><p>${'Vakkundig en snel geholpen bij lekkage. '.repeat(25)}</p>${scripts}</body>`;
  assert.equal(looksClientRendered(html), false);
});

check('lege invoer is geen shell maar gewoon niets', () =>
  assert.equal(looksClientRendered(''), false));

check('tekst in scripts telt niet mee als inhoud', () => {
  const html = `<body><div id="app">x</div><script>${'"tekst",'.repeat(500)}</script><script src="a.js"></script><script src="b.js"></script></body>`;
  assert.equal(looksClientRendered(html), true);
});

check('zichtbareTekst laat script- en style-inhoud weg', () =>
  assert.equal(
    zichtbareTekst('<style>.a{color:red}</style><p>Hallo</p><script>var x=1</script>'),
    'Hallo',
  ));

console.log('\nna het renderen wordt het wél gevonden');

// Zoals de footer van dakdienst-vangelder.nl eruitziet zodra JavaScript klaar is.
const gerenderd = `
<footer>
  <p>Uw betrouwbare dakdekker voor heel Nederland. Vakkundig, snel en met 15 jaar garantie.</p>
  <a href="tel:+31850607813">085 060 7813</a>
  <a href="mailto:info@dakdienst-vangelder.nl">info@dakdienst-vangelder.nl</a>
  <span>Werkgebied: Zaandam en omgeving</span>
  <span>KvK: 96634286</span>
  <a href="https://www.linkedin.com/company/dakdienst-vangelder">LinkedIn</a>
</footer>`;

check('de gerenderde footer levert wél een telefoonnummer op', () => {
  const c = extractContacts({
    url: 'https://dakdienst-vangelder.nl/dakdekker-zaandam',
    status: 200,
    html: gerenderd,
    headers: {},
    elapsedMs: 100,
  });
  assert.equal(c.telefoons.length, 1);
  assert.equal(c.telefoons[0].canoniek, '+31850607813');
  assert.equal(c.telefoons[0].weergave, '085 060 7813');
  assert.deepEqual(
    c.emails.map((e) => e.adres),
    ['info@dakdienst-vangelder.nl'],
  );
  assert.equal(c.emails[0].soort, 'rol');
  assert.equal(c.kvk, '96634286');
  assert.equal(c.socials.length, 1);
});

console.log(failures === 0 ? '\nAlles goed.' : `\n${failures} test(s) mislukt.`);
process.exit(failures === 0 ? 0 : 1);
