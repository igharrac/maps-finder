/**
 * Test de herkenning van het oprichtingsjaar.
 *
 *   node --experimental-strip-types lib/enrichment/founded.test.ts
 *
 * Google levert dit veld niet; we lezen het uit wat het bedrijf zelf op zijn
 * site zet. Dat is rommelige lopende tekst, dus de valse positieven zijn het
 * belangrijkst: een adres of telefoonnummer met een jaartal erin mag geen
 * oprichtingsjaar worden.
 */
import assert from 'node:assert/strict';
import { detectSignals, type PageInput } from './detectors.ts';

function page(body: string): PageInput {
  return {
    url: 'https://voorbeeld.nl',
    status: 200,
    html: `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width"></head><body>${body}</body></html>`,
    headers: {},
    elapsedMs: 300,
  };
}

function founded(body: string) {
  const signal = detectSignals(page(body)).find((s) => s.key === 'founded_year');
  return signal?.value as { year: number; ageYears: number; young: boolean; established: boolean } | undefined;
}

let failures = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ok   ${name}`);
  } catch (error) {
    failures += 1;
    console.log(`  FOUT ${name}\n       ${(error as Error).message}`);
  }
}

const thisYear = new Date().getFullYear();

check('"sinds 1987"', () => assert.equal(founded('<p>Sinds 1987 uw partner in de Zaanstreek.</p>')?.year, 1987));
check('"opgericht in 1998"', () => assert.equal(founded('<p>Opgericht in 1998.</p>')?.year, 1998));
check('"bestaat sinds 2021"', () => assert.equal(founded('<p>Bestaat sinds 2021.</p>')?.year, 2021));
check('"al ruim 40 jaar" wordt een jaartal', () =>
  assert.equal(founded('<p>Al ruim 40 jaar vakmanschap.</p>')?.year, thisYear - 40));
check('"25 jaar ervaring"', () =>
  assert.equal(founded('<p>Met 25 jaar ervaring in installatietechniek.</p>')?.year, thisYear - 25));

check('jong bedrijf wordt als jong gemarkeerd', () => {
  const f = founded(`<p>Bestaat sinds ${thisYear - 1}.</p>`);
  assert.equal(f?.young, true);
  assert.equal(f?.established, false);
});

check('lang gevestigd wordt als gevestigd gemarkeerd', () => {
  const f = founded('<p>Sinds 1975 actief.</p>');
  assert.equal(f?.established, true);
  assert.equal(f?.young, false);
});

check('los jaartal is GEEN oprichtingsjaar', () =>
  assert.equal(founded('<p>Bel ons: 075 612 84 20. Postbus 1998, Zaandam.</p>'), undefined));
check('copyrightregel is GEEN oprichtingsjaar', () =>
  assert.equal(founded('<footer>&copy; 2019 Testbedrijf</footer>'), undefined));
check('jaartal in de toekomst wordt genegeerd', () =>
  assert.equal(founded(`<p>Sinds ${thisYear + 5} actief.</p>`), undefined));

console.log(failures === 0 ? '\nAlles goed.' : `\n${failures} test(s) mislukt.`);
process.exit(failures === 0 ? 0 : 1);
