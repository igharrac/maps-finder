-- Maps Finder — initieel schema
--
-- Uitgangspunt: gegevens die van Google komen zijn TIJDELIJK en staan uitsluitend
-- in prospect_sources met een expires_at. Onze eigen intelligence (status, scores,
-- signalen, notities) staat in de overige tabellen en heeft geen vervaldatum.
-- Google staat toe place_id onbeperkt te bewaren; overige Places-content, inclusief
-- lat/lng, maximaal 30 aaneengesloten kalenderdagen.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- enums

create type prospect_status as enum (
  'discovered',
  'saved',
  'analyzed',
  'high_potential',
  'flyer_planned',
  'flyer_delivered',
  'contacted',
  'responded',
  'meeting',
  'opportunity',
  'customer',
  'rejected'
);

-- Scheiding die de AI-laag moet respecteren: een aanname mag nooit als feit gelden.
create type claim_kind as enum ('fact', 'inference', 'recommendation');

create type outreach_kind as enum (
  'flyer_planned',
  'flyer_delivered',
  'qr_scan',
  'call',
  'email',
  'meeting',
  'note'
);

-- ---------------------------------------------------------------- prospects

create table prospects (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null references auth.users (id) on delete cascade,

  -- Stabiele verwijzing naar de bron. Mag onbeperkt bewaard worden.
  google_place_id   text not null,

  -- Eigen label van de gebruiker. Dit is ONZE data en verloopt niet, zodat een
  -- prospect herkenbaar blijft als de brongegevens verlopen zijn.
  own_label         text,

  status            prospect_status not null default 'discovered',
  analyzed_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint prospects_unique_place_per_owner unique (owner_id, google_place_id)
);

create index prospects_owner_status_idx on prospects (owner_id, status);

-- ---------------------------------------------------------------- bronlaag

-- Alles wat van een externe bron komt. Bewust gescheiden van prospects zodat
-- verlopen brondata verwijderd kan worden zonder onze eigen kennis te raken.
-- De payload is opzettelijk jsonb: de bron bepaalt de vorm, wij niet.
create table prospect_sources (
  id            uuid primary key default gen_random_uuid(),
  prospect_id   uuid not null references prospects (id) on delete cascade,
  source        text not null default 'google_places',
  source_ref    text not null,
  payload       jsonb not null,
  fetched_at    timestamptz not null default now(),
  expires_at    timestamptz not null default (now() + interval '30 days'),

  constraint prospect_sources_unique unique (prospect_id, source)
);

create index prospect_sources_expiry_idx on prospect_sources (expires_at);

-- ---------------------------------------------------------------- scores

-- Eén rij per berekening. De gebruikte wegingen worden meegeschreven zodat een
-- score achteraf reproduceerbaar en uitlegbaar is.
create table prospect_scores (
  id                  uuid primary key default gen_random_uuid(),
  prospect_id         uuid not null references prospects (id) on delete cascade,
  model_version       text not null,
  opportunity_score   smallint not null check (opportunity_score between 0 and 100),
  business_potential  smallint not null check (business_potential between 0 and 100),
  digital_maturity    smallint not null check (digital_maturity between 0 and 100),
  weights             jsonb not null,
  computed_at         timestamptz not null default now(),

  constraint prospect_scores_unique_version unique (prospect_id, model_version)
);

-- ---------------------------------------------------------------- signalen

-- De waarneembare feiten waar een score op rust. Zonder deze rijen is een score
-- niet uitlegbaar en mag de UI hem niet tonen.
create table prospect_signals (
  id            uuid primary key default gen_random_uuid(),
  prospect_id   uuid not null references prospects (id) on delete cascade,
  key           text not null,
  kind          claim_kind not null default 'fact',
  label         text not null,
  value         jsonb,
  confidence    real check (confidence between 0 and 1),
  observed_at   timestamptz not null default now(),
  detected_by   text not null default 'website_probe',

  constraint prospect_signals_unique_key unique (prospect_id, key)
);

create index prospect_signals_prospect_idx on prospect_signals (prospect_id);

-- ---------------------------------------------------------------- kansen

create table prospect_opportunities (
  id              uuid primary key default gen_random_uuid(),
  prospect_id     uuid not null references prospects (id) on delete cascade,
  title           text not null,
  fact            text not null,
  inference       text,
  recommendation  text,
  confidence      real check (confidence between 0 and 1),
  skills          text[] not null default '{}',
  sort_order      smallint not null default 0,
  created_at      timestamptz not null default now()
);

create index prospect_opportunities_prospect_idx on prospect_opportunities (prospect_id, sort_order);

-- ---------------------------------------------------------------- campagnes

create table campaigns (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users (id) on delete cascade,
  name         text not null,
  area_label   text,
  created_at   timestamptz not null default now(),
  archived_at  timestamptz
);

create index campaigns_owner_idx on campaigns (owner_id, archived_at);

create table campaign_prospects (
  campaign_id         uuid not null references campaigns (id) on delete cascade,
  prospect_id         uuid not null references prospects (id) on delete cascade,
  flyer_planned_at    timestamptz,
  flyer_delivered_at  timestamptz,
  delivery_note       text,
  sort_order          smallint not null default 0,
  added_at            timestamptz not null default now(),

  primary key (campaign_id, prospect_id)
);

-- ---------------------------------------------------------------- contactmomenten

create table outreach_events (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users (id) on delete cascade,
  prospect_id  uuid not null references prospects (id) on delete cascade,
  campaign_id  uuid references campaigns (id) on delete set null,
  kind         outreach_kind not null,
  occurred_at  timestamptz not null default now(),
  payload      jsonb not null default '{}'::jsonb
);

create index outreach_events_prospect_idx on outreach_events (prospect_id, occurred_at desc);

-- Voorkomt dat een bedrijf per ongeluk twee keer een flyer krijgt: één bezorging
-- per prospect per campagne.
create unique index outreach_events_one_delivery_per_campaign
  on outreach_events (prospect_id, campaign_id)
  where kind = 'flyer_delivered';

-- ---------------------------------------------------------------- notities

create table notes (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users (id) on delete cascade,
  prospect_id  uuid not null references prospects (id) on delete cascade,
  body         text not null,
  created_at   timestamptz not null default now()
);

create index notes_prospect_idx on notes (prospect_id, created_at desc);

-- ---------------------------------------------------------------- trackingcodes

-- De code is willekeurig, niet oplopend, zodat een publieke /scan/{code}-URL
-- niets prijsgeeft over aantallen of volgorde.
create table tracking_codes (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users (id) on delete cascade,
  code         text not null unique,
  prospect_id  uuid references prospects (id) on delete cascade,
  campaign_id  uuid references campaigns (id) on delete cascade,
  created_at   timestamptz not null default now(),
  revoked_at   timestamptz
);

create index tracking_codes_code_idx on tracking_codes (code) where revoked_at is null;

-- ---------------------------------------------------------------- updated_at

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger prospects_set_updated_at
  before update on prospects
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------- RLS
--
-- Zonder deze policies geeft de publieke Supabase-sleutel iedereen die de
-- paginabron opent volledige toegang tot de database.

alter table prospects              enable row level security;
alter table prospect_sources       enable row level security;
alter table prospect_scores        enable row level security;
alter table prospect_signals       enable row level security;
alter table prospect_opportunities enable row level security;
alter table campaigns              enable row level security;
alter table campaign_prospects     enable row level security;
alter table outreach_events        enable row level security;
alter table notes                  enable row level security;
alter table tracking_codes         enable row level security;

create policy prospects_owner on prospects
  for all using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy campaigns_owner on campaigns
  for all using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy outreach_events_owner on outreach_events
  for all using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy notes_owner on notes
  for all using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy tracking_codes_owner on tracking_codes
  for all using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

-- Kindtabellen erven de eigenaar via hun prospect.
create policy prospect_sources_owner on prospect_sources
  for all using (exists (select 1 from prospects p where p.id = prospect_id and p.owner_id = (select auth.uid())))
  with check (exists (select 1 from prospects p where p.id = prospect_id and p.owner_id = (select auth.uid())));

create policy prospect_scores_owner on prospect_scores
  for all using (exists (select 1 from prospects p where p.id = prospect_id and p.owner_id = (select auth.uid())))
  with check (exists (select 1 from prospects p where p.id = prospect_id and p.owner_id = (select auth.uid())));

create policy prospect_signals_owner on prospect_signals
  for all using (exists (select 1 from prospects p where p.id = prospect_id and p.owner_id = (select auth.uid())))
  with check (exists (select 1 from prospects p where p.id = prospect_id and p.owner_id = (select auth.uid())));

create policy prospect_opportunities_owner on prospect_opportunities
  for all using (exists (select 1 from prospects p where p.id = prospect_id and p.owner_id = (select auth.uid())))
  with check (exists (select 1 from prospects p where p.id = prospect_id and p.owner_id = (select auth.uid())));

create policy campaign_prospects_owner on campaign_prospects
  for all using (exists (select 1 from campaigns c where c.id = campaign_id and c.owner_id = (select auth.uid())))
  with check (exists (select 1 from campaigns c where c.id = campaign_id and c.owner_id = (select auth.uid())));
