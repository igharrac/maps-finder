/**
 * Test de detectie tegen voorbeeldpagina's. Geen netwerk nodig.
 *
 *   node --experimental-strip-types lib/enrichment/detectors.test.ts
 *
 * De derde casus is de belangrijkste: een site met alleen een zoekveld mag NIET
 * als "heeft een aanvraagformulier" gelden. Dat is precies het soort fout dat op
 * een gepersonaliseerde flyer pijnlijk wordt.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { detectSignals, type PageInput } from './detectors.ts';

const dir = join(import.meta.dirname, 'fixtures');

function page(file: string, overrides: Partial<PageInput> = {}): PageInput {
  return {
    url: 'https://voorbeeld.nl',
    status: 200,
    html: readFileSync(join(dir, file), 'utf8'),
    headers: {},
    elapsedMs: 400,
    ...overrides,
  };
}

function value(signals: ReturnType<typeof detectSignals>, key: string) {
  const found = signals.find((s) => s.key === key);
  assert.ok(found, `signaal ${key} ontbreekt`);
  return found;
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

console.log('verouderde site (geen viewport, geen formulier, 2017, http)');
{
  const s = detectSignals(page('verouderd.html', { url: 'http://voorbeeld.nl' }));
  check('geen beveiligde verbinding', () => assert.equal(value(s, 'https').normalized, 0));
  check('geen mobiele weergave', () => assert.equal(value(s, 'mobile_friendly').normalized, 0));
  check('geen aanvraagformulier', () => assert.equal(value(s, 'has_request_form').normalized, 0));
  check('geen reviews op de site', () => assert.equal(value(s, 'shows_reviews').normalized, 0));
  check('herkent WordPress', () => assert.equal(value(s, 'cms').label, 'Gebouwd met WordPress'));
  check('jaartal 2017 gevonden', () =>
    assert.equal((value(s, 'recently_updated').value as { year: number }).year, 2017));
}

console.log('moderne site (viewport, offerteformulier, reviews, 2026)');
{
  const s = detectSignals(page('modern.html'));
  check('beveiligde verbinding', () => assert.equal(value(s, 'https').normalized, 1));
  check('mobiele weergave', () => assert.equal(value(s, 'mobile_friendly').normalized, 1));
  check('aanvraagformulier gevonden', () =>
    assert.equal(value(s, 'has_request_form').normalized, 1));
  check('reviews op de site', () => assert.equal(value(s, 'shows_reviews').normalized, 1));
}

console.log('site met alleen een zoekveld');
{
  const s = detectSignals(page('alleen-zoekveld.html'));
  check('zoekveld telt NIET als aanvraagformulier', () =>
    assert.equal(value(s, 'has_request_form').normalized, 0));
  check('mobiele weergave wordt wel herkend', () =>
    assert.equal(value(s, 'mobile_friendly').normalized, 1));
}

console.log('onbereikbare site');
{
  const s = detectSignals({ url: 'https://voorbeeld.nl', status: 0, html: '', headers: {}, elapsedMs: 0 });
  check('bereikbaarheid is 0', () => assert.equal(value(s, 'site_reachable').normalized, 0));
  check('geen verdere signalen', () => assert.equal(s.length, 1));
}

console.log(failures === 0 ? '\nAlles goed.' : `\n${failures} test(s) mislukt.`);
process.exit(failures === 0 ? 0 : 1);
