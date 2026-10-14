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
