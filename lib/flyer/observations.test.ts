/**
 * Test wanneer een bedrijf wel en niet een eigen flyer krijgt.
 *
 *   node --experimental-strip-types lib/flyer/observations.test.ts
 *
 * Deze regels bepalen wat er gedrukt bij iemand door de bus valt, dus ze horen
 * vastgelegd te zijn. De belangrijkste gevallen zijn de weigeringen: een site
 * die op orde is en een site die toevallig plat lag mogen géén flyer opleveren.
 */
import assert from 'node:assert/strict';
import type { PlaceSummary } from '../places/types.ts';
import type { Signal } from '../scoring/signals.ts';
import { flyerReadiness } from './observations.ts';

const place: PlaceSummary = {
  placeId: 'test',
  name: 'Testbedrijf',
  address: 'Teststraat 1',
  lat: 52.44,
  lng: 4.83,
  primaryType: 'plumber',
  categoryLabel: 'Loodgieter',
  rating: 4.6,
  reviewCount: 128,
  websiteUri: null,
  businessStatus: 'OPERATIONAL',
};

function probe(key: string, normalized: number, confidence = 1): Signal {
  return { key, kind: 'fact', label: key, value: null, normalized, confidence, detectedBy: 'website_probe' };
}

function google(key: string): Signal {
  return { key, kind: 'fact', label: key, value: null, normalized: 1, confidence: 1, detectedBy: 'google_places' };
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

check('geen website is op zichzelf genoeg voor een flyer', () => {
  const r = flyerReadiness([probe('no_website_listed', 0)], place);
  assert.equal(r.ready, true);
  assert.equal(r.observations.length, 1);
});

check('zonder website-analyse geen flyer', () => {
  const r = flyerReadiness([google('rating')], place);
  assert.equal(r.ready, false);
  assert.match(r.reason ?? '', /geanalyseerd/);
});

check('onbereikbare site levert nooit een flyer op', () => {
  const r = flyerReadiness([probe('site_reachable', 0)], place);
  assert.equal(r.ready, false);
  assert.match(r.reason ?? '', /niet bereikbaar/);
});

check('site die op orde is levert geen flyer op', () => {
  const r = flyerReadiness(
    [
      probe('site_reachable', 1),
      probe('has_request_form', 1, 0.9),
      probe('mobile_friendly', 1),
      probe('shows_reviews', 1, 0.7),
      probe('https', 1),
    ],
    place,
  );
  assert.equal(r.ready, false);
  assert.match(r.reason ?? '', /op orde/);
});

check('twee gebreken zijn genoeg', () => {
  const r = flyerReadiness(
    [probe('site_reachable', 1), probe('has_request_form', 0, 0.65), probe('mobile_friendly', 0)],
    place,
  );
  assert.equal(r.ready, true);
  assert.equal(r.observations.length, 2);
});

check('één gebrek is te mager', () => {
  const r = flyerReadiness(
    [probe('site_reachable', 1), probe('mobile_friendly', 0), probe('has_request_form', 1, 0.9)],
    place,
  );
  assert.equal(r.ready, false);
});

check('signalen met te lage zekerheid tellen niet mee', () => {
  const r = flyerReadiness(
    [probe('site_reachable', 1), probe('has_request_form', 0, 0.3), probe('mobile_friendly', 0, 0.3)],
    place,
  );
  assert.equal(r.ready, false);
});

check('nooit meer dan drie bevindingen op één flyer', () => {
  const r = flyerReadiness(
    [
      probe('site_reachable', 1),
      probe('has_request_form', 0, 0.65),
      probe('mobile_friendly', 0),
      probe('shows_reviews', 0, 0.7),
      probe('https', 0),
    ],
    place,
  );
  assert.equal(r.ready, true);
  assert.equal(r.observations.length, 3);
});

console.log(failures === 0 ? '\nAlles goed.' : `\n${failures} test(s) mislukt.`);
process.exit(failures === 0 ? 0 : 1);
