/**
 * Controleert de BAG-koppeling tegen de echte dienst van PDOK.
 *
 *   node --experimental-strip-types lib/locations/bag.live.ts
 *
 * Dit is geen unittest maar een rooktest: hij gaat het internet op. Draai hem
 * als de pandlabels leeg blijven in de app — dan zie je meteen of het aan de
 * verbinding ligt, aan het antwoord van PDOK, of aan onze eigen matching.
 */
import { lookupPand } from './bag.ts';

const proefjes = [
  {
    naam: 'Woonhuis in een woonwijk (Zaandam)',
    lat: 52.438966,
    lng: 4.831159,
    address: 'Pantepad 43, 1506 Zaandam, Nederland',
    verwacht: 'woonadres',
  },
  {
    naam: 'Bedrijventerrein Zuiderhout (Zaandam)',
    lat: 52.4218,
    lng: 4.8262,
    address: null,
    verwacht: 'bedrijfspand of winkel_of_horeca',
  },
];

for (const proef of proefjes) {
  const uitkomst = await lookupPand(proef);
  console.log(`\n${proef.naam}`);
  console.log(`  verwacht:     ${proef.verwacht}`);
  console.log(`  gevonden:     ${uitkomst.functie}`);
  console.log(`  gebruiksdoel: ${uitkomst.gebruiksdoelen.join(', ') || '—'}`);
  console.log(`  pand:         ${uitkomst.bagAdres ?? '—'}`);
  console.log(`  afstand:      ${uitkomst.afstandMeters ?? '—'} m`);
  if (uitkomst.reden) console.log(`  reden:        ${uitkomst.reden}`);
}

console.log(
  '\nKomt hier overal "onbekend" met een reden uit, dan is api.pdok.nl niet bereikbaar.',
);
