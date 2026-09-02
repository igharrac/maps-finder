import { randomBytes } from 'node:crypto';

/**
 * Trackingcodes voor de QR op een flyer.
 *
 * De code is willekeurig en niet oplopend, zodat een publieke /scan/{code}-URL
 * niets prijsgeeft over hoeveel flyers er zijn of in welke volgorde ze gemaakt
 * werden. Database-id's komen nooit in een URL terecht.
 *
 * Alfabet zonder klinkers (geen toevallige woorden) en zonder 0/O/1/I/L, zodat
 * iemand die de code overtypt zich niet vergist.
 */
const ALPHABET = '23456789BCDFGHJKMNPQRSTVWXYZ';
const LENGTH = 6;

export function generateTrackingCode(): string {
  const bytes = randomBytes(LENGTH * 2);
  let code = '';
  for (let i = 0; code.length < LENGTH && i < bytes.length; i += 1) {
    // Rejection sampling: bytes boven het grootste veelvoud van de
    // alfabetlengte weggooien, anders zijn de eerste tekens iets waarschijnlijker.
    const max = Math.floor(256 / ALPHABET.length) * ALPHABET.length;
    if (bytes[i] >= max) continue;
    code += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return code.length === LENGTH ? code : generateTrackingCode();
}
