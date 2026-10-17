-- One wide row per listing. Personal tool: no RLS-per-user, read via server-side service key.
create table if not exists stocks (
  symbol text primary key,
  name text not null,
  exchange text,
  country text,
  sector text,
  industry text,
  currency text,
  description text,
  is_primary_listing boolean default true,

  price numeric,
  market_cap numeric,
  pe numeric,
  pb numeric,
  peg numeric,
  eps numeric,
  roe numeric,
  roa numeric,
  debt_to_equity numeric,
  beta numeric,
  div_yield numeric,
  earnings_growth_past_1y numeric,
  earnings_growth_past_5y numeric,
  earnings_growth_est_1y numeric,
  analyst_target numeric,
  analyst_count int,
  ret_7d numeric,
  ret_1y numeric,
  ret_5y numeric,

  score_value smallint,
  score_future smallint,
  score_past smallint,
  score_health smallint,
  score_dividends smallint,
  score_total smallint,

  fts tsvector generated always as (
    to_tsvector('english', coalesce(name,'') || ' ' || coalesce(industry,'') || ' ' || coalesce(description,''))
  ) stored,
  updated_at timestamptz default now()
);

create index if not exists stocks_country_idx on stocks (country);
create index if not exists stocks_sector_idx on stocks (sector);
create index if not exists stocks_mcap_idx on stocks (market_cap desc);
create index if not exists stocks_fts_idx on stocks using gin (fts);

create table if not exists saved_screens (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  spec jsonb not null,
  created_at timestamptz default now()
);

alter table stocks enable row level security;
alter table saved_screens enable row level security;
-- No policies: only the service-role key (server only) can access.
alter table saved_screens
  add column if not exists alerts_enabled boolean not null default false,
  add column if not exists last_matches text[],
  add column if not exists last_run_at timestamptz;

create table if not exists screen_alerts (
  id uuid primary key default gen_random_uuid(),
  screen_id uuid not null references saved_screens(id) on delete cascade,
  screen_name text not null,
  symbol text not null,
  stock_name text,
  kind text not null check (kind in ('entered', 'exited')),
  seen boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists screen_alerts_unseen_idx on screen_alerts (seen, created_at desc);
alter table screen_alerts enable row level security;
-- Snowflake v2: 8 axes, scores are smooth 0-10 values (one decimal) instead of 0-6 integers.
alter table stocks
  add column if not exists profit_margin numeric,
  add column if not exists analyst_rating numeric,
  add column if not exists score_momentum numeric(3,1),
  add column if not exists score_quality numeric(3,1),
  add column if not exists score_sentiment numeric(3,1);

alter table stocks
  alter column score_value type numeric(3,1),
  alter column score_future type numeric(3,1),
  alter column score_past type numeric(3,1),
  alter column score_health type numeric(3,1),
  alter column score_dividends type numeric(3,1),
  alter column score_total type numeric(4,1);

-- old 0-6 scores are meaningless on the new scale; run `npm run rescore` (or `npm run ingest`) afterwards.
update stocks set score_value = null, score_future = null, score_past = null, score_health = null, score_dividends = null, score_total = null;
-- Full US universe: rows can exist with market data only; details are filled in gradually.
alter table stocks
  add column if not exists has_details boolean not null default false,
  add column if not exists details_updated_at timestamptz,
  add column if not exists detail_failures int not null default 0;

-- everything ingested so far already has full details
update stocks set has_details = true, details_updated_at = coalesce(updated_at, now()) where sector is not null;

create index if not exists stocks_has_details_idx on stocks (has_details, details_updated_at);
-- Global universe (~20k stocks): more metrics, USD-normalised market cap, regions, facet view.
alter table stocks
  add column if not exists region text,
  add column if not exists market_cap_usd numeric,
  add column if not exists forward_pe numeric,
  add column if not exists ps numeric,
  add column if not exists ev_ebitda numeric,
  add column if not exists fcf_yield numeric,
  add column if not exists revenue_growth numeric,
  add column if not exists gross_margin numeric,
  add column if not exists operating_margin numeric,
  add column if not exists current_ratio numeric,
  add column if not exists payout_ratio numeric,
  add column if not exists insider_pct numeric,
  add column if not exists institution_pct numeric,
  add column if not exists short_pct numeric,
  add column if not exists avg_volume numeric,
  add column if not exists employees int,
  add column if not exists pct_from_high numeric,
  add column if not exists ret_1m numeric,
  add column if not exists ret_3m numeric,
  add column if not exists ret_6m numeric,
  add column if not exists ret_ytd numeric;

create index if not exists stocks_mcap_usd_idx on stocks (market_cap_usd desc nulls last);
create index if not exists stocks_total_idx on stocks (score_total desc nulls last);
create index if not exists stocks_region_idx on stocks (region);
create index if not exists stocks_industry_idx on stocks (industry);

-- filter chips: one cheap query instead of paging through every row
create or replace view stock_facets as
  select 'region'::text as kind, region as name, count(*)::int as n from stocks where has_details and region is not null group by region
  union all select 'country', country, count(*)::int from stocks where has_details and country is not null group by country
  union all select 'sector', sector, count(*)::int from stocks where has_details and sector is not null group by sector
  union all select 'industry', industry, count(*)::int from stocks where has_details and industry is not null group by industry;
