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
      <div style="display:flex;gap:15px;">
        <span style="flex-shrink:0;width:30px;font-family:'Instrument Serif',Georgia,serif;font-size:30px;line-height:1.05;color:${C.ochre};">0${i + 1}</span>
        <div>
          <div style="font-size:17.5px;font-weight:600;line-height:1.32;">${escapeHtml(o.title)}</div>
          <div style="font-size:16px;line-height:1.5;color:${C.body};margin-top:4px;">${escapeHtml(o.body)}</div>
        </div>
      </div>`,
    )
    .join('');

  return `<div style="width:${TRIM_W}px;height:${TRIM_H}px;background:${C.paper};color:${C.ink};display:flex;flex-direction:column;overflow:hidden;">
  <div style="flex-grow:1;padding:34px 44px 0;display:flex;flex-direction:column;">
    <div style="font-size:13px;font-weight:600;letter-spacing:0.16em;text-transform:uppercase;color:${C.ochre};">Voor de mensen van</div>
    <div style="font-size:28px;font-weight:700;line-height:1.16;letter-spacing:-0.018em;margin-top:8px;">${escapeHtml(data.companyName)}</div>
    <div style="width:66px;height:5px;background:${C.pine};margin-top:18px;"></div>
    <div style="font-size:20px;font-weight:600;line-height:1.3;margin-top:18px;">${
      data.observations.length === 1 ? 'Iets dat ons opviel' : `${data.observations.length === 2 ? 'Twee' : 'Drie'} dingen die ons opvielen`
    }</div>
    <div style="display:flex;flex-direction:column;gap:15px;margin-top:16px;">${items}</div>
    <div style="flex-grow:1;"></div>
    <div style="display:flex;gap:13px;padding:15px 17px;background:${C.tint};border-radius:10px;margin-bottom:16px;">
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="${C.pine}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-top:2px;"><circle cx="12" cy="12" r="9"></circle><path d="M12 16v-4M12 8h.01"></path></svg>
      <div style="font-size:16px;line-height:1.5;">Dit zagen wij van buitenaf, in tien minuten. Misschien zitten we ernaast &mdash; daarom kost het eerste gesprek niets.</div>
    </div>
  </div>
  <div style="flex-shrink:0;background:${C.pine};color:#FFFFFF;padding:22px 44px 24px;">
    <div style="display:flex;align-items:center;gap:24px;">
      <div style="flex-shrink:0;display:flex;flex-direction:column;align-items:center;gap:6px;">
        <div style="width:88px;height:88px;border-radius:8px;background:#FFFFFF;display:flex;align-items:center;justify-content:center;">${data.qrSvg}</div>
      </div>
      <div style="flex-grow:1;">
        <div style="font-size:20px;font-weight:600;line-height:1.3;">Scan voor wat wij zouden aanpakken</div>
        <div style="font-size:14.5px;opacity:0.82;margin-top:6px;">${escapeHtml(data.scanUrl.replace(/^https?:\/\//, ''))}</div>
        <div style="font-size:25px;font-weight:700;letter-spacing:-0.01em;margin-top:12px;">${escapeHtml(data.sender.phone)}</div>
      </div>
    </div>
    <div style="display:flex;align-items:center;gap:10px;margin-top:18px;padding-top:14px;border-top:1px solid rgba(255,255,255,0.22);font-size:15px;">
      <span style="font-weight:600;">${escapeHtml(data.sender.name)}</span>
      <span style="opacity:0.5;">&middot;</span>
      <span style="opacity:0.84;">${escapeHtml(data.sender.email)}</span>
    </div>
  </div>
</div>`;
}

function back(sender: Sender): string {
  const steps = [
    ['Een half uur', 'Bij u op locatie, u vertelt waar het schuurt.'],
    ['Kort voorstel', 'Eén pagina, vaste prijs.'],
    ['Werkend opgeleverd', 'In weken, niet in maanden.'],
  ]
    .map(
      ([title, body], i) => `
      <div>
        <div style="width:26px;height:26px;border-radius:50%;background:${C.pine};color:#fff;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;">${i + 1}</div>
        <div style="font-size:15px;font-weight:600;margin-top:10px;line-height:1.3;">${title}</div>
        <div style="font-size:15px;line-height:1.45;color:${C.muted};margin-top:4px;">${body}</div>
      </div>`,
    )
    .join('');

  const items = [
    [
      'De offerte gaat via de telefoon',
      'Aanvragen komen binnen als telefoontje of los mailtje. Wie op locatie staat, kan niet opnemen.',
    ],
    [
      'De website staat er wel, maar vraagt niets',
      'Geen aanvraagformulier, geen manier om iets in gang te zetten. En op een telefoon nauwelijks te lezen.',
    ],
    [
      'Goede reviews die niemand ziet',
      'Jaren aan tevreden klanten op Google, en nergens te vinden waar een nieuwe klant staat te twijfelen.',
    ],
  ]
    .map(
      ([title, body], i) => `
      <div style="display:flex;gap:18px;">
        <span style="flex-shrink:0;width:40px;font-family:'Instrument Serif',Georgia,serif;font-size:34px;line-height:1;color:${C.ochre};">0${i + 1}</span>
        <div>
          <div style="font-size:18.5px;font-weight:600;line-height:1.3;">${title}</div>
          <div style="font-size:16px;line-height:1.5;color:${C.body};margin-top:5px;">${body}</div>
        </div>
      </div>`,
    )
    .join('');

  return `<div style="width:${TRIM_W}px;height:${TRIM_H}px;background:${C.paper};color:${C.ink};display:flex;flex-direction:column;overflow:hidden;">
  <div style="flex-grow:1;padding:40px 44px 0;display:flex;flex-direction:column;">
    <div style="font-size:30px;font-weight:700;line-height:1.15;letter-spacing:-0.015em;">Wat wij vaak tegenkomen</div>
    <div style="font-size:16px;line-height:1.5;color:${C.muted};margin-top:10px;">Drie dingen die bij bijna elk goedlopend bedrijf spelen.</div>
    <div style="display:flex;flex-direction:column;gap:15px;margin-top:22px;">${items}</div>
    <div style="height:1px;background:${C.line};margin:20px 0 18px;"></div>
    <div style="font-size:20px;font-weight:700;letter-spacing:-0.01em;">Zo werkt het</div>
    <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px;margin-top:14px;">${steps}</div>
    <div style="flex-grow:1;"></div>
    <div style="display:flex;gap:13px;padding:16px 18px;background:${C.tint};border-radius:10px;margin-bottom:20px;">
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="${C.pine}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-top:1px;"><path d="M21 12a8 8 0 0 1-11.4 7.2L4 20.5l1.4-5A8 8 0 1 1 21 12Z"></path></svg>
      <div style="font-size:16px;line-height:1.5;"><span style="font-weight:600;">Valt er bij u weinig te halen?</span> Dan zeggen wij dat gewoon.</div>
    </div>
  </div>
  <div style="flex-shrink:0;background:${C.pine};color:#fff;padding:18px 44px;display:flex;align-items:center;gap:14px;">
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11Z"></path><circle cx="12" cy="10" r="2.5"></circle></svg>
    <div style="flex-grow:1;">
      <div style="font-size:16px;font-weight:600;">${escapeHtml(sender.name)}</div>
      <div style="font-size:14.5px;opacity:0.84;margin-top:2px;">${escapeHtml(sender.website)} &middot; ${escapeHtml(sender.email)}</div>
    </div>
    <div style="flex-shrink:0;font-size:21px;font-weight:700;">${escapeHtml(sender.phone)}</div>
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
