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
