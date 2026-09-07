/**
 * Test het uitlezen van contactgegevens uit een pagina.
 *
 *   node --experimental-strip-types lib/enrichment/contacts.test.ts
 *
 * De valse positieven zijn hier het belangrijkst. Een bestandsnaam als
 * logo@2x.png ziet eruit als een e-mailadres, een jaartal en een KvK-nummer
 * zien eruit als een telefoonnummer. Een verkeerd contactgegeven is erger dan
 * een ontbrekend contactgegeven: het kost een telefoontje naar een vreemde.
 */
import assert from 'node:assert/strict';
import {
  extractContactpagina,
  extractContacts,
  extractEmails,
  extractTelefoons,
  normaliseerTelefoon,
} from './contacts.ts';

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

const adressen = (html: string) => extractEmails(html).map((e) => e.adres);

console.log('\ne-mail');

check('mailto-link wordt gevonden', () =>
  assert.deepEqual(adressen('<a href="mailto:info@kuiper.nl">Mail ons</a>'), ['info@kuiper.nl']));

check('adres in lopende tekst wordt gevonden', () =>
  assert.deepEqual(adressen('<p>Stuur gerust een mail naar Info@Kuiper.NL hoor.</p>'), [
    'info@kuiper.nl',
  ]));

check('hetzelfde adres telt maar één keer', () =>
  assert.equal(
    adressen('<a href="mailto:info@kuiper.nl">info@kuiper.nl</a>').length,
    1,
  ));

check('bestandsnaam met @ is GEEN e-mailadres', () =>
  assert.deepEqual(adressen('<img src="/assets/logo@2x.png">'), []));

check('adres van de sitebouwer wordt genegeerd', () =>
  assert.deepEqual(adressen('<script>dsn:"https://a@sentry.io/123"</script>'), []));

check('voorbeeldadres uit een template wordt genegeerd', () =>
  assert.deepEqual(adressen('<p>naam@example.com</p>'), []));

check('rolpostbus wordt als rol herkend', () => {
  const [mail] = extractEmails('<a href="mailto:verkoop@kuiper.nl">x</a>');
  assert.equal(mail.soort, 'rol');
});

check('persoonsadres wordt als persoonlijk herkend', () => {
  const [mail] = extractEmails('<a href="mailto:jan.kuiper@kuiper.nl">x</a>');
  assert.equal(mail.soort, 'persoonlijk');
});

check('rolpostbus met achtervoegsel blijft rol', () => {
  const [mail] = extractEmails('<a href="mailto:info-nl@kuiper.nl">x</a>');
  assert.equal(mail.soort, 'rol');
});

check('rolpostbus staat vóór het persoonsadres', () => {
  const lijst = extractEmails(
    '<p>jan@kuiper.nl</p><a href="mailto:info@kuiper.nl">x</a>',
  );
  assert.equal(lijst[0].soort, 'rol');
});

console.log('\ntelefoon');

check('vast nummer met streepjes', () =>
  assert.equal(normaliseerTelefoon('075-612 84 20'), '0756128420'));

check('mobiel nummer aaneen', () => assert.equal(normaliseerTelefoon('0612345678'), '0612345678'));

check('internationaal met nul tussen haakjes', () =>
  assert.equal(normaliseerTelefoon('+31 (0)75 612 84 20'), '+31756128420'));

check('00-31 notatie', () => assert.equal(normaliseerTelefoon('0031756128420'), '+31756128420'));

check('jaartal is GEEN telefoonnummer', () => assert.equal(normaliseerTelefoon('1987'), null));

check('KvK-nummer is GEEN telefoonnummer', () =>
  assert.equal(normaliseerTelefoon('34112233'), null));

check('te lang nummer wordt geweigerd', () =>
  assert.equal(normaliseerTelefoon('012345678901234'), null));

check('tel-link wordt gevonden', () =>
  assert.deepEqual(extractTelefoons('<a href="tel:+31756128420">bel</a>'), ['+31756128420']));

check('nummer in lopende tekst wordt gevonden', () =>
  assert.deepEqual(extractTelefoons('<p>Bel ons: 075 612 84 20</p>'), ['0756128420']));

check('postcode en huisnummer leveren geen nummer op', () =>
  assert.deepEqual(extractTelefoons('<p>Industrieweg 12, 1521 NE Wormerveer</p>'), []));

console.log('\noverige gegevens');

check('contactpagina wordt absoluut gemaakt', () =>
  assert.equal(
    extractContactpagina('<a href="/contact">Contact</a>', 'https://kuiper.nl/home'),
    'https://kuiper.nl/contact',
  ));

check('mailto telt niet als contactpagina', () =>
  assert.equal(
    extractContactpagina('<a href="mailto:info@kuiper.nl">Contact</a>', 'https://kuiper.nl/'),
    null,
  ));

check('KvK-nummer wordt gelezen', () => {
  const c = extractContacts({
    url: 'https://kuiper.nl',
    status: 200,
    html: '<footer>KvK: 34112233 · BTW NL123456789B01</footer>',
    headers: {},
    elapsedMs: 100,
  });
  assert.equal(c.kvk, '34112233');
  assert.equal(c.btw, 'NL123456789B01');
});

check('lege pagina levert lege gegevens, geen fout', () => {
  const c = extractContacts({ url: 'https://x.nl', status: 0, html: '', headers: {}, elapsedMs: 0 });
  assert.deepEqual(c.emails, []);
  assert.equal(c.contactpagina, null);
});

console.log(failures === 0 ? '\nAlles goed.' : `\n${failures} test(s) mislukt.`);
process.exit(failures === 0 ? 0 : 1);
