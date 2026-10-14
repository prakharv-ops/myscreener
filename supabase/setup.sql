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
