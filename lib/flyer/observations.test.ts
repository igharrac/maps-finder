/**
 * Test wanneer een bedrijf een eigen flyer krijgt, en wat erop komt.
 *
 *   node --experimental-strip-types lib/flyer/observations.test.ts
 *
 * De kernregel: een flyer moet minstens één BEZIT bevatten naast een GEMIS. Een
 * flyer die alleen opsomt wat iemand mist is kritiek van een vreemde; die gaat
 * niet over zijn bedrijf.
 */
import assert from 'node:assert/strict';
import type { PlaceSummary } from '../places/types.ts';
import type { Signal } from '../scoring/signals.ts';
import { flyerReadiness } from './observations.ts';

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

check('reputatie + gemis levert een flyer op, bezit eerst', () => {
  const r = flyerReadiness(
    [REACHABLE, probe('shows_reviews', 0, 0.7), probe('has_request_form', 0, 0.65)],
    place(),
  );
  assert.equal(r.ready, true);
  assert.equal(r.observations[0].kind, 'asset');
  assert.match(r.observations[0].title, /128 klanten/);
  assert.equal(r.observations[1].kind, 'gap');
});

check('alleen gemissen levert GEEN flyer op', () => {
  const r = flyerReadiness(
    [REACHABLE, probe('has_request_form', 0, 0.65), probe('mobile_friendly', 0), probe('https', 0)],
    place({ rating: 3.1, reviewCount: 4 }),
  );
  assert.equal(r.ready, false);
  assert.match(r.reason ?? '', /opgebouwd|kritiek/);
});

check('geen website is alleen niet genoeg', () => {
  const r = flyerReadiness([probe('no_website_listed', 0)], place({ websiteUri: null, reviewCount: 3, rating: 3.2 }));
  assert.equal(r.ready, false);
});

check('geen website MET sterke reputatie is wel genoeg', () => {
  const r = flyerReadiness(
    [probe('no_website_listed', 0)],
    place({ websiteUri: null, reviewCount: 128, rating: 4.6 }),
  );
  assert.equal(r.ready, true);
  assert.equal(r.observations[0].kind, 'asset');
  assert.match(r.observations[0].body, /alleen op Google/);
});

check('klein bedrijf met acht reviews en een 4,8 telt als bezit', () => {
  const r = flyerReadiness(
    [REACHABLE, probe('shows_reviews', 0, 0.7), probe('has_request_form', 0, 0.65)],
    place({ reviewCount: 8, rating: 4.8 }),
  );
  assert.equal(r.ready, true);
  assert.match(r.observations[0].title, /8 klanten/);
});

check('vier reviews met een 4,8 is te mager', () => {
  const r = flyerReadiness(
    [REACHABLE, probe('shows_reviews', 0, 0.7), probe('has_request_form', 0, 0.65)],
    place({ reviewCount: 4, rating: 4.8 }),
  );
  assert.equal(r.ready, false);
  assert.match(r.reason ?? '', /4 reviews met een 4,8/);
});

check('lang bestaan telt als bezit', () => {
  const r = flyerReadiness(
    [
      REACHABLE,
      probe('mobile_friendly', 0),
      probe('founded_year', 0, 0.6, { year: 2013, ageYears: 13 }),
    ],
    place({ reviewCount: 2, rating: 3.0 }),
  );
  assert.equal(r.ready, true);
  assert.match(r.observations[0].title, /13 jaar/);
});

check('site op orde levert geen flyer op', () => {
  const r = flyerReadiness(
    [REACHABLE, probe('has_request_form', 1, 0.9), probe('mobile_friendly', 1), probe('shows_reviews', 1, 0.7), probe('https', 1)],
    place(),
  );
  assert.equal(r.ready, false);
  assert.match(r.reason ?? '', /op orde/);
});

check('onbereikbare site levert nooit een flyer op', () => {
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

check('nooit meer dan drie waarnemingen', () => {
  const r = flyerReadiness(
    [
      REACHABLE,
      probe('shows_reviews', 0, 0.7),
      probe('founded_year', 0, 0.6, { year: 1995, ageYears: 31 }),
      probe('has_request_form', 0, 0.65),
      probe('mobile_friendly', 0),
      probe('https', 0),
    ],
    place(),
  );
  assert.equal(r.ready, true);
  assert.equal(r.observations.length, 3);
  assert.equal(r.observations.filter((o) => o.kind === 'gap').length >= 1, true);
});

console.log(failures === 0 ? '\nAlles goed.' : `\n${failures} test(s) mislukt.`);
process.exit(failures === 0 ? 0 : 1);
