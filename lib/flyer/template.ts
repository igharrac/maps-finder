import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Observation } from './observations';

/**
 * De flyer als HTML, klaar om door Chromium naar PDF gezet te worden.
 *
 * Maten: A5 is 148 x 210 mm, wat bij 96 px/inch precies 559 x 794 px is. Daar
 * komt 3 mm afloop omheen, zoals elke drukker vraagt. Het ontwerp wordt NIET
 * geschaald — schalen verschuift alle marges en duwt tekst richting de snijlijn.
 * In plaats daarvan staat het op ware grootte in het midden en vullen we de
 * afloop met de randkleuren.
 */

export const TRIM_W = 559;
export const TRIM_H = 794;
export const PX_PER_MM = 96 / 25.4;
export const BLEED_MM = 3;
export const BLEED_PX = BLEED_MM * PX_PER_MM;
export const PAGE_W = TRIM_W + BLEED_PX * 2;
export const PAGE_H = TRIM_H + BLEED_PX * 2;

/**
 * Fonts worden ingesloten zodat de drukker niets hoeft te installeren.
 *
 * Bewust met een pad vanaf de projectmap en niet met require.resolve: de bundler
 * probeert zo'n dynamische resolve mee te bundelen en faalt daarop.
 */
function fontFace(family: string, pkg: string, file: string, weight: number): string {
  const path = join(process.cwd(), 'node_modules', pkg, 'files', file);
  const data = readFileSync(path).toString('base64');
  return `@font-face{font-family:"${family}";font-style:normal;font-weight:${weight};font-display:block;src:url(data:font/woff2;base64,${data}) format("woff2");}`;
}

let cachedFonts: string | null = null;

function fonts(): string {
  if (cachedFonts) return cachedFonts;
  const sg = '@fontsource/schibsted-grotesk';
  const is = '@fontsource/instrument-serif';
  cachedFonts = [
    fontFace('Schibsted Grotesk', sg, 'schibsted-grotesk-latin-400-normal.woff2', 400),
    fontFace('Schibsted Grotesk', sg, 'schibsted-grotesk-latin-600-normal.woff2', 600),
    fontFace('Schibsted Grotesk', sg, 'schibsted-grotesk-latin-700-normal.woff2', 700),
    fontFace('Instrument Serif', is, 'instrument-serif-latin-400-normal.woff2', 400),
  ].join('\n');
  return cachedFonts;
}

export type Sender = {
  name: string;
  website: string;
  email: string;
  phone: string;
};

export type FlyerData = {
  companyName: string;
  observations: Observation[];
  scanUrl: string;
  qrSvg: string;
  sender: Sender;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const C = {
  paper: '#FBFAF8',
  ink: '#1A1815',
  body: '#3B372F',
  muted: '#5F594F',
  pine: '#14594A',
  ochre: '#B7791F',
  line: '#E5E0D8',
  tint: '#F0EDE6',
};

function front(data: FlyerData): string {
  const items = data.observations
    .map(
      (o, i) => `
      <div style="display:flex;gap:13px;">
        <span style="flex-shrink:0;width:24px;font-family:'Instrument Serif',Georgia,serif;font-size:25px;line-height:1.1;color:${C.ochre};">${i + 1}</span>
        <div>
          <div style="font-size:17px;font-weight:600;line-height:1.3;">${escapeHtml(o.title)}</div>
          <div style="font-size:16px;line-height:1.42;color:${C.body};margin-top:2px;">${
            // Eerst wat we zagen, dan pas wat er mogelijk is. Zo staat het feit
            // vooraan en is meteen duidelijk waar de kans op rust.
            o.groundedIn ? `<span style="color:${C.muted};">${escapeHtml(o.groundedIn)}</span> ` : ''
          }${escapeHtml(o.body)}</div>
        </div>
      </div>`,
    )
    .join('');

  return `<div style="width:${TRIM_W}px;height:${TRIM_H}px;background:${C.paper};color:${C.ink};display:flex;flex-direction:column;overflow:hidden;">
  <div style="flex-grow:1;padding:32px 44px 0;display:flex;flex-direction:column;">
    <div style="font-size:28px;font-weight:700;line-height:1.2;letter-spacing:-0.018em;max-width:430px;">Waar kan jullie bedrijf slimmer werken?</div>

    <div style="font-size:16px;line-height:1.5;color:${C.body};margin-top:10px;max-width:440px;">
      Veel bedrijven zien kansen in digitalisering, maar niet altijd waar te beginnen. We keken alvast even mee.
    </div>

    <div style="width:56px;height:4px;background:${C.pine};margin-top:15px;"></div>

    <div style="font-size:19px;font-weight:600;line-height:1.32;margin-top:11px;">${
      data.observations.length === 3 ? 'Drie kansen' : 'Twee kansen'
    } die we voor ${escapeHtml(data.companyName)} zien</div>

    <div style="display:flex;flex-direction:column;gap:10px;margin-top:12px;">${items}</div>

    <div style="flex-grow:1;"></div>

    <div style="font-size:14px;line-height:1.45;color:${C.muted};margin-bottom:10px;">
      Dit zagen we van buitenaf. Wat er werkelijk speelt weten jullie zelf het beste.
    </div>
  </div>

  <div style="flex-shrink:0;background:${C.pine};color:#FFFFFF;padding:18px 44px 20px;">
    <div style="display:flex;align-items:center;gap:20px;">
      <div style="flex-shrink:0;width:78px;height:78px;border-radius:8px;background:#FFFFFF;display:flex;align-items:center;justify-content:center;">${data.qrSvg}</div>
      <div style="flex-grow:1;">
        <div style="font-size:19px;font-weight:600;line-height:1.3;">Benieuwd wat er voor jullie mogelijk is?</div>
        <div style="font-size:15px;line-height:1.45;opacity:0.86;margin-top:4px;">We denken graag 30 minuten vrijblijvend mee.</div>
        <div style="font-size:24px;font-weight:700;letter-spacing:-0.01em;margin-top:10px;">${escapeHtml(data.sender.phone)}</div>
      </div>
    </div>

    <div style="display:flex;align-items:center;gap:10px;margin-top:14px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.22);font-size:14.5px;">
      <span style="font-weight:600;">${escapeHtml(data.sender.name)}</span>
      <span style="opacity:0.5;">&middot;</span>
      <span style="opacity:0.84;">${escapeHtml(data.sender.website)}</span>
      <span style="margin-left:auto;opacity:0.84;">${escapeHtml(data.sender.email)}</span>
    </div>
  </div>
</div>`;
}

function back(sender: Sender): string {
  const benefits = [
    ['Minder handmatig werk', 'Terugkerende taken en administratie eenvoudiger inrichten.'],
    ['Meer inzicht in je bedrijf', 'Klanten, omzet en processen overzichtelijk bij elkaar.'],
    ['Slimmer omgaan met klantvragen', 'Aanvragen sneller binnenkrijgen en opvolgen.'],
    ['Een betere online klantreis', 'Van website tot offerte eenvoudiger en duidelijker.'],
    ['Systemen beter laten samenwerken', 'Minder dubbel invoeren, informatie loopt door.'],
    ['Praktisch starten met AI', 'Klein beginnen, kijken wat het echt oplevert.'],
  ]
    .map(
      ([title, body]) => `
      <div style="display:flex;gap:11px;">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="${C.pine}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-top:2px;"><path d="m5 13 4 4L19 7"></path></svg>
        <div>
          <div style="font-size:16px;font-weight:600;line-height:1.3;">${title}</div>
          <div style="font-size:14.5px;line-height:1.45;color:${C.muted};margin-top:2px;">${body}</div>
        </div>
      </div>`,
    )
    .join('');

  return `<div style="width:${TRIM_W}px;height:${TRIM_H}px;background:${C.paper};color:${C.ink};display:flex;flex-direction:column;overflow:hidden;">
  <div style="flex-grow:1;padding:40px 44px 0;display:flex;flex-direction:column;">
    <div style="font-size:28px;font-weight:700;line-height:1.18;letter-spacing:-0.015em;">Wat kunnen we voor je doen?</div>
    <div style="font-size:16px;line-height:1.55;color:${C.body};margin-top:10px;max-width:450px;">
      We kijken praktisch met je mee naar processen, klanten, data en systemen, en laten zien waar verbetering mogelijk is. Zonder dat je zelf technisch hoeft te zijn.
    </div>

    <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px 22px;margin-top:24px;">${benefits}</div>

    <div style="height:1px;background:${C.line};margin:24px 0 20px;"></div>

    <div style="font-size:19px;font-weight:700;letter-spacing:-0.01em;">Hoe dat gaat</div>
    <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;margin-top:14px;">
      <div>
        <div style="width:25px;height:25px;border-radius:50%;background:${C.pine};color:#fff;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;">1</div>
        <div style="font-size:15px;font-weight:600;margin-top:9px;line-height:1.3;">Een half uur</div>
        <div style="font-size:14.5px;line-height:1.45;color:${C.muted};margin-top:3px;">Vrijblijvend, bij jullie op locatie.</div>
      </div>
      <div>
        <div style="width:25px;height:25px;border-radius:50%;background:${C.pine};color:#fff;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;">2</div>
        <div style="font-size:15px;font-weight:600;margin-top:9px;line-height:1.3;">Wat we zien</div>
        <div style="font-size:14.5px;line-height:1.45;color:${C.muted};margin-top:3px;">Eén pagina, in gewone taal.</div>
      </div>
      <div>
        <div style="width:25px;height:25px;border-radius:50%;background:${C.pine};color:#fff;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;">3</div>
        <div style="font-size:15px;font-weight:600;margin-top:9px;line-height:1.3;">Jullie beslissen</div>
        <div style="font-size:14.5px;line-height:1.45;color:${C.muted};margin-top:3px;">Klein starten mag altijd.</div>
      </div>
    </div>

    <div style="flex-grow:1;"></div>

    <div style="font-size:13px;line-height:1.5;color:${C.muted};margin-bottom:18px;">
      <span style="font-weight:600;color:${C.body};">Onze expertise:</span>
      Design &middot; Development &middot; Data &amp; BI &middot; Informatieanalyse &middot; AI &amp; Automation
    </div>
  </div>

  <div style="flex-shrink:0;background:${C.pine};color:#fff;padding:18px 44px;display:flex;align-items:center;gap:14px;">
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11Z"></path><circle cx="12" cy="10" r="2.5"></circle></svg>
    <div style="flex-grow:1;">
      <div style="font-size:16px;font-weight:600;">${escapeHtml(sender.name)}</div>
      <div style="font-size:14.5px;opacity:0.84;margin-top:2px;">${escapeHtml(sender.website)} &middot; ${escapeHtml(sender.email)}</div>
    </div>
    <div style="flex-shrink:0;font-size:20px;font-weight:700;">${escapeHtml(sender.phone)}</div>
  </div>
</div>`;
}

/**
 * Bouwt het document. Per bedrijf een voorkant, en aan het eind één achterkant.
 *
 * Dat is bewust: de achterkant is voor iedereen gelijk, dus die laat je in
 * oplage drukken en alleen de voorkanten personaliseer je. Wil je dubbelzijdig
 * printen op kantoor, zet dan `interleave` aan.
 */
export function buildFlyerHtml(
  flyers: FlyerData[],
  options: { interleave?: boolean } = {},
): string {
  const sender = flyers[0]?.sender;
  const pages: string[] = [];

  for (const flyer of flyers) {
    pages.push(front(flyer));
    if (options.interleave && sender) pages.push(back(sender));
  }
  if (!options.interleave && sender) pages.push(back(sender));

  const sheets = pages
    .map((page) => `<div class="sheet"><div class="bleed-bottom"></div><div class="art">${page}</div></div>`)
    .join('\n');

  return `<!doctype html><html><head><meta charset="utf-8"><style>
${fonts()}
*{box-sizing:border-box;}
html,body{margin:0;padding:0;}
body{font-family:"Schibsted Grotesk","Helvetica Neue",Helvetica,sans-serif;}
.sheet{width:${PAGE_W}px;height:${PAGE_H}px;overflow:hidden;position:relative;background:${C.paper};page-break-after:always;break-after:page;}
.sheet:last-child{page-break-after:auto;break-after:auto;}
/* Het groene contactblok loopt op elke pagina tot de onderrand; deze strook
   zet dat door tot in de afloop. */
.bleed-bottom{position:absolute;left:0;right:0;bottom:0;height:${BLEED_PX + 1}px;background:${C.pine};}
.art{width:${TRIM_W}px;height:${TRIM_H}px;position:absolute;top:${BLEED_PX}px;left:${BLEED_PX}px;}
</style></head><body>${sheets}</body></html>`;
}
