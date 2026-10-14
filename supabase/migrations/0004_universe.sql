-- Full US universe: rows can exist with market data only; details are filled in gradually.
alter table stocks
  add column if not exists has_details boolean not null default false,
  add column if not exists details_updated_at timestamptz,
  add column if not exists detail_failures int not null default 0;

-- everything ingested so far already has full details
update stocks set has_details = true, details_updated_at = coalesce(updated_at, now()) where sector is not null;

create index if not exists stocks_has_details_idx on stocks (has_details, details_updated_at);
