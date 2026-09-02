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

## Nog te bouwen

Campagnes, Flyer Mode, prospectdetailpaneel, website-verrijking en de
AI-analyselaag. Zie het projectdocument voor de volgorde.
