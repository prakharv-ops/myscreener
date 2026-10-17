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
