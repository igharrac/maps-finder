/**
 * Test welke kansen op een flyer belanden, en hoe ze geformuleerd zijn.
 *
 *   node --experimental-strip-types lib/flyer/observations.test.ts
 *
 * De toonregels zijn hier net zo belangrijk als de logica: de doelgroep is niet
 * digitaal gedreven en vaak onzeker over AI. Een lijstje met wat er mis is werkt
 * averechts, hoe feitelijk het ook klopt.
 */
import assert from 'node:assert/strict';
import type { PlaceSummary } from '../places/types.ts';
import type { Signal } from '../scoring/signals.ts';
import { flyerReadiness, observationsForFlyer } from './observations.ts';

function place(overrides: Partial<PlaceSummary> = {}): PlaceSummary {
  return {
    placeId: 'test',
    name: 'Testbedrijf',
    address: 'Teststraat 1',
    lat: 52.44,
    lng: 4.83,
    primaryType: 'plumber',
    categoryLabel: 'Loodgieter',
    rating: 4.6,
    reviewCount: 128,
    websiteUri: 'https://voorbeeld.nl',
    businessStatus: 'OPERATIONAL',
    groupIds: ['installatie'],
    ...overrides,
  };
}

function probe(key: string, normalized: number, confidence = 1, value: unknown = null): Signal {
  return { key, kind: 'fact', label: key, value, normalized, confidence, detectedBy: 'website_probe' };
}

const REACHABLE = probe('site_reachable', 1);

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

const ALL_TONE_WORDS = /verkeerd|fout|mist|ontbreekt|geen |slecht|achter/i;

check('twee kansen leveren een flyer op', () => {
  const r = flyerReadiness(
    [REACHABLE, probe('has_request_form', 0, 0.65), probe('shows_reviews', 0, 0.7)],
    place(),
  );
  assert.equal(r.ready, true);
  assert.equal(r.observations.length, 3, 'twee onderbouwd plus de AI-suggestie');
});

check('één kans is te mager', () => {
  const r = flyerReadiness([REACHABLE, probe('mobile_friendly', 0)], place());
  assert.equal(r.ready, false);
  assert.match(r.reason ?? '', /één kans/);
});

check('de AI-suggestie staat nooit alleen', () => {
  const obs = observationsForFlyer([REACHABLE, probe('mobile_friendly', 0)], place());
  assert.equal(obs.length, 0);
});

check('bij drie onderbouwde kansen valt de AI-suggestie weg', () => {
  const obs = observationsForFlyer(
    [REACHABLE, probe('has_request_form', 0, 0.65), probe('shows_reviews', 0, 0.7), probe('mobile_friendly', 0)],
    place(),
  );
  assert.equal(obs.length, 3);
  assert.equal(obs.every((o) => o.groundedIn !== null), true, 'alles onderbouwd');
});

check('titels benoemen een uitkomst, geen gemis', () => {
  const obs = observationsForFlyer(
    [REACHABLE, probe('has_request_form', 0, 0.65), probe('mobile_friendly', 0), probe('https', 0)],
    place(),
  );
  for (const o of obs) {
    assert.doesNotMatch(o.title, ALL_TONE_WORDS, `titel klinkt als kritiek: "${o.title}"`);
  }
});

check('geen jargon in titel of tekst', () => {
  const obs = observationsForFlyer(
    [REACHABLE, probe('has_request_form', 0, 0.65), probe('shows_reviews', 0, 0.7), probe('mobile_friendly', 0)],
    place(),
  );
  const jargon = /\bAPI\b|machine learning|pipeline|cloud architect|LLM|automation stack|UX method/i;
  for (const o of obs) {
    assert.doesNotMatch(`${o.title} ${o.body}`, jargon, `jargon in "${o.title}"`);
  }
});

check('elke kans op een waarneming is onderbouwd', () => {
  const obs = observationsForFlyer(
    [REACHABLE, probe('has_request_form', 0, 0.65), probe('shows_reviews', 0, 0.7)],
    place(),
  );
  const withFact = obs.filter((o) => o.groundedIn !== null);
  assert.equal(withFact.length >= 2, true);
  assert.match(withFact[1].groundedIn ?? '', /128 klanten/);
});

check('geen website levert een vindbaarheidskans op, niet een verwijt', () => {
  const obs = observationsForFlyer(
    [probe('no_website_listed', 0), probe('has_request_form', 0, 0.65)],
    place({ websiteUri: null }),
  );
  const vindbaar = obs.find((o) => o.key === 'vindbaarheid');
  assert.ok(vindbaar);
  assert.match(vindbaar.title, /vindbaar/i);
  assert.doesNotMatch(vindbaar.title, ALL_TONE_WORDS);
});

check('onbereikbare site levert geen kansen op', () => {
  const r = flyerReadiness([probe('site_reachable', 0)], place());
  assert.equal(r.ready, false);
});

check('zonder analyse geen flyer', () => {
  const r = flyerReadiness(
    [{ key: 'rating', kind: 'fact', label: 'r', value: null, normalized: 1, confidence: 1, detectedBy: 'google_places' }],
    place(),
  );
  assert.equal(r.ready, false);
  assert.match(r.reason ?? '', /geanalyseerd/);
});

check('nooit meer dan drie kansen', () => {
  const obs = observationsForFlyer(
    [REACHABLE, probe('has_request_form', 0, 0.65), probe('shows_reviews', 0, 0.7), probe('mobile_friendly', 0), probe('https', 0)],
    place(),
  );
  assert.equal(obs.length, 3);
});

console.log(failures === 0 ? '\nAlles goed.' : `\n${failures} test(s) mislukt.`);
process.exit(failures === 0 ? 0 : 1);
