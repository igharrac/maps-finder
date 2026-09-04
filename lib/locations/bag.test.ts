/**
 * Test de vertaling van BAG-gebruiksdoelen naar een pandfunctie, en het
 * uitlezen van huisnummer en postcode uit een Google-adres.
 *
 *   node --experimental-strip-types lib/locations/bag.test.ts
 *
 * Het adres uitlezen is geen bijzaak: in een pand met woningen boven en een
 * bedrijfsruimte beneden bepaalt het huisnummer welk verblijfsobject we
 * pakken. Zonder die match kiest de lookup het dichtstbijzijnde punt, en dat
 * is daar vaak de verkeerde.
 */
import assert from 'node:assert/strict';
import { classificeer, parseAdres } from './bag.ts';

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

console.log('\nclassificeer');

check('alleen woonfunctie is een woonadres', () =>
  assert.equal(classificeer(['woonfunctie']), 'woonadres'));

check('industriefunctie is een bedrijfspand', () =>
  assert.equal(classificeer(['industriefunctie']), 'bedrijfspand'));

check('kantoorfunctie is een bedrijfspand', () =>
  assert.equal(classificeer(['kantoorfunctie']), 'bedrijfspand'));

check('overige gebruiksfunctie (loods, opslag) is een bedrijfspand', () =>
  assert.equal(classificeer(['overige gebruiksfunctie']), 'bedrijfspand'));

check('winkelfunctie is winkel of horeca, geen bedrijfspand', () =>
  assert.equal(classificeer(['winkelfunctie']), 'winkel_of_horeca'));

check('wonen plus werken is gemengd, niet woonadres', () =>
  assert.equal(classificeer(['woonfunctie', 'kantoorfunctie']), 'gemengd'));

check('winkel met woning erboven is gemengd', () =>
  assert.equal(classificeer(['winkelfunctie', 'woonfunctie']), 'gemengd'));

check('niets bekend blijft onbekend', () => assert.equal(classificeer([]), 'onbekend'));

check('een onbekend gebruiksdoel wordt niet geraden', () =>
  assert.equal(classificeer(['verzonnenfunctie']), 'onbekend'));

console.log('\nparseAdres');

check('gewoon Nederlands adres', () => {
  const a = parseAdres('Industrieweg 12, 1521 NE Wormerveer, Nederland');
  assert.equal(a.huisnummer, 12);
  assert.equal(a.postcode, '1521NE');
  assert.equal(a.huisletter, null);
});

check('huisletter wordt meegenomen', () => {
  const a = parseAdres('Provincialeweg 88 A, 1506 MD Zaandam, Nederland');
  assert.equal(a.huisnummer, 88);
  assert.equal(a.huisletter, 'A');
});

check('postcode zonder spatie', () => {
  const a = parseAdres('Dorpsstraat 4, 1531HB Wormer, Nederland');
  assert.equal(a.huisnummer, 4);
  assert.equal(a.postcode, '1531HB');
});

check('straatnaam met een cijfer erin verwart het huisnummer niet', () => {
  const a = parseAdres('1e Industriestraat 7, 1013 AB Amsterdam, Nederland');
  assert.equal(a.huisnummer, 7);
});

check('adres zonder huisnummer levert null, geen gok', () => {
  const a = parseAdres('Havengebied, 1505 Zaandam, Nederland');
  assert.equal(a.huisnummer, null);
});

check('geen adres levert overal null', () => {
  const a = parseAdres(null);
  assert.deepEqual(a, { huisnummer: null, huisletter: null, postcode: null });
});

console.log(failures === 0 ? '\nAlles goed.' : `\n${failures} test(s) mislukt.`);
process.exit(failures === 0 ? 0 : 1);
