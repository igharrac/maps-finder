# Maps Finder

Lead discovery en lokale acquisitie. Vindt via Google Places lokale bedrijven die
commercieel interessant lijken en digitaal achterlopen, scoort ze uitlegbaar, en
ondersteunt het benaderen ervan met flyers.

Deze eerste mijlpaal bevat de **research workspace**: gebied zoeken, bedrijven
ophalen, kaart met statusmarkers, gesynchroniseerde resultatenlijst, filters en
prospects opslaan.

## Aan de slag

```bash
npm install
cp .env.example .env.local   # en vul de sleutels in
npm run dev
```

Open http://localhost:3000. Je wordt naar `/login` gestuurd.

### Google Cloud Console

Zet deze drie API's aan in hetzelfde project:

- **Maps JavaScript API** — de kaart
- **Places API (New)** — bedrijven zoeken
- **Geocoding API** — postcode of plaatsnaam omzetten naar coördinaten

Maak **twee** sleutels:

| Sleutel | Env-variabele | Beperking |
| --- | --- | --- |
| Browser | `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` | HTTP-referrer (`localhost:3000/*` + je domein), alleen Maps JavaScript API |
| Server | `GOOGLE_PLACES_SERVER_KEY` | IP-adres, alleen Places API (New) + Geocoding API |

De browsersleutel staat per definitie in de paginabron; beperking is de
bescherming, niet geheimhouding. De serversleutel verlaat de server nooit.

Zet daarnaast **quotalimieten per API** in Cloud Console. Een budgetwaarschuwing
vertelt je pas achteraf dat er geld weg is; een quotum voorkomt het.

### Supabase

1. Voer `supabase/migrations/0001_initial_schema.sql` uit in de SQL Editor.
2. Maak onder **Authentication → Users** eenmalig je eigen account aan. Er is
   bewust geen openbare registratie.
3. Vul `NEXT_PUBLIC_SUPABASE_URL` en `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

De publieke sleutel hoort in de browser en is alleen veilig doordat **Row Level
Security** op elke tabel aanstaat. Die policies zitten in de migratie. Zet ze
niet uit.

## Hoe het in elkaar zit

```
app/
  api/places/area      Postcode of plaats -> coördinaten (Geocoding)
  api/places/search    Bedrijven zoeken + scoren (Places API, server-side)
  api/prospects        Prospect opslaan, status wijzigen
  discover             De research workspace
  login                Inloggen
components/workspace   Kaart, filters, resultatenlijst, topbalk
lib/places             Places-client. Draait alleen op de server.
lib/scoring            Wegingen, signalen, scoreberekening
lib/supabase           Browser- en serverclient
supabase/migrations    Databaseschema met RLS
```

### Kostenbeheersing

- Elke zoekactie start de gebruiker zelf. Pannen en zoomen doet niets behalve de
  knop *Zoek in dit kaartgebied* tonen.
- Het veldmasker in `lib/places/client.ts` is bewust kort. Elk extra veld kan het
  verzoek naar een duurdere prijsklasse tillen.
- Eén verzoek levert maximaal 20 resultaten. Meer branches aanvinken betekent
  meer verzoeken.
- De teller rechtsboven op de kaart laat zien hoeveel Places-verzoeken deze
  sessie gedaan zijn.

### Gegevens van Google

Google staat toe `place_id` onbeperkt te bewaren; overige Places-content,
inclusief lat/lng, maximaal 30 aaneengesloten kalenderdagen.

Daarom staat alle Google-data in `prospect_sources` met een `expires_at` van 30
dagen, en bevat `prospects` alleen ons eigen materiaal: status, eigen label,
scores, signalen en notities. Verlopen brondata kan opgeruimd worden zonder onze
kennis te raken. Verplichte attributie staat linksonder op de kaart.

### Scoring

Twee deelscores in plaats van vijf:

- **Business Potential** — reviewvolume, beoordeling, branchepassing
- **Digital Maturity** — laag is gunstig; een lage score betekent meer ruimte

De **Opportunity Score** combineert Business Potential met de digitale
*achterstand* (100 − maturity). Alle wegingen staan in `lib/scoring/weights.ts`
en worden bij elke berekening meegeschreven, zodat een score reproduceerbaar is.

Elke score rust op signalen in `prospect_signals`. Signalen dragen een `kind`:
`fact` (waargenomen), `inference` (gevolgtrekking) of `recommendation`. De UI
mag die nooit door elkaar tonen.

> Met alleen Google-data is Digital Maturity in de praktijk niet veel meer dan
> "heeft wel of geen website". De `confidence` op de score laat dat zien. De
> website-verrijking die dit echt onderscheidend maakt is de volgende stap.

## Flyers

Bij elke opgeslagen prospect staat een vinkje **Flyer**. Selecteer er een aantal
en klik onderin op **Genereer flyers (PDF)**: je krijgt één PDF met per bedrijf
een gepersonaliseerde voorkant en aan het eind één gedeelde achterkant.

Eenmalig instellen:

```bash
npx playwright install chromium
```

Lukt die download niet, dan valt de generator terug op de Google Chrome die al
op je machine staat.

Vul daarnaast in `.env.local` je afzendergegevens in (`FLYER_BUSINESS_NAME`,
`FLYER_WEBSITE`, `FLYER_EMAIL`, `FLYER_PHONE`) en `FLYER_SCAN_BASE_URL`. Zonder
telefoonnummer weigert de generator.

### Waarom bedrijven overgeslagen worden

Een bedrijf krijgt alleen een eigen flyer als er minstens twee concrete
waarnemingen zijn. De regels daarvoor staan in `lib/flyer/observations.ts`:

- Alleen **feiten**, nooit gevolgtrekkingen of aanbevelingen.
- Alleen signalen met voldoende zekerheid. Een copyrightjaartal is te zwak.
- Elke zin beschrijft wat *wij* zagen, niet wat waar is over het bedrijf.
  "Wij vonden geen aanvraagformulier" blijft kloppen ook als er één achter
  JavaScript zit; "u heeft geen aanvraagformulier" niet.
- Was de site onbereikbaar, dan geen flyer. Een storing van vijf minuten is
  geen bevinding om te drukken.

Dat is bewust streng. Een generieke flyer die niet aanslaat kost papier; een
gedrukte bewering die niet klopt kost je het bedrijf.

### Formaat

A5 (148 × 210 mm) met 3 mm afloop, tekst als vector, fonts ingesloten. Klaar om
te uploaden bij een online drukker. De generator meet elke pagina en weigert een
PDF te maken als er tekst zou wegvallen.

### QR-codes

**Zolang `FLYER_SCAN_BASE_URL` leeg is** wijst de QR naar `FLYER_WEBSITE` en
wordt er geen trackingcode aangemaakt. Zo kun je nu al drukken zonder dat de
code op een 404 uitkomt; je meet alleen nog niets.

Zodra de applicatie online staat vul je `FLYER_SCAN_BASE_URL` in. Vanaf dan
krijgt elke flyer een eigen code die naar `/scan/{code}` wijst. Die route legt de
scan vast en stuurt door naar `NEXT_PUBLIC_SCAN_REDIRECT_URL`. Codes zijn
willekeurig, niet oplopend, en een herdruk hergebruikt dezelfde code.

Het vastleggen loopt via de databasefunctie `record_scan` (migratie 0002), niet
via de service-key: de bezoeker is niet ingelogd, en die functie kan precies één
ding en geeft niets terug.

Zet `FLYER_SCAN_BASE_URL` pas als de applicatie echt bereikbaar is op dat
adres. Een gedrukte QR die naar een 404 wijst kun je niet meer terughalen.

## Nog te bouwen

Campagnes, Flyer Mode, het prospectdetailpaneel en de AI-analyselaag. Zie het projectdocument voor de volgorde.
