# MyScreener

Personal global stock screener (Next.js + Supabase), modelled on Simply Wall St's screener.

## Run
```bash
npm run dev        # works immediately on mock data
```

## Use real data
1. Create a Supabase project, run `supabase/migrations/0001_init.sql` in the SQL editor.
2. Copy `.env.example` to `.env.local` and fill in the URL + service-role key (server-only).
3. Also run `0002_alerts.sql`, `0003_snowflake_v2.sql` and `0004_universe.sql` from `supabase/migrations/` (or `supabase/setup.sql` for all three on a fresh project).
4. Edit `scripts/tickers.txt` (Yahoo symbols), then `npm run ingest`.

## Full US universe
`npm run universe` loads every US common stock/ADR (~5,900; Nasdaq, NYSE, NYSE American) from Nasdaq Trader's free official symbol files. `npm run quotes` refreshes price/market cap/PE/etc. for all rows in a few seconds (Yahoo batch quotes). `npm run enrich` (time-boxed, default 30 min; `-- --minutes 60`) adds full details + Snowflake scores, biggest companies first, so the whole universe fills in over a few nights; stale rows are then refreshed oldest-first. The screener hides not-yet-analysed stocks unless you untick "Fully analysed stocks only". `npm run refresh` = universe + quotes + enrich + rescore + alerts (what the daily job runs).

## Webhooks
Alert digests can be POSTed to Slack / Discord incoming webhooks or any HTTPS endpoint (`ALERT_WEBHOOK_URLS`, optional HMAC signing with `ALERT_WEBHOOK_SECRET`; see `.env.example`). To trigger work *into* the app from elsewhere, call `POST /api/alerts/run` with `Authorization: Bearer $CRON_SECRET`. (No free market-data API offers webhooks; Benzinga does, via sales.)

## Snowflake
8 axes (Value, Future, Past, Health, Dividends, Momentum, Quality, Sentiment), each a smooth 0–10 blend of several metrics (`src/lib/scoring.ts`). Click/drag an axis to set a minimum. After editing the scoring rules run `npm run rescore` (no Yahoo calls).

## Live prices
`/api/live` streams prices (SSE) for the stocks on screen. Default: Yahoo polling for all markets. Set `FINNHUB_API_KEY` to stream US stocks over Finnhub's free WebSocket (restart the dev server after adding it). Needs a long-running Node server (`npm run dev` / `npm start` / a VPS), not serverless.

## Daily refresh
`scripts/install-daily-refresh.sh [HH:MM]` installs a macOS launchd job (default 06:30) that runs `npm run refresh` (ingest + scoring + alerts); log in `.data/refresh.log`; remove with `--uninstall`. `.github/workflows/refresh.yml` is an optional cloud alternative.

## Alerts
Email: set `RESEND_API_KEY`, `ALERT_EMAIL_TO` (and `ALERT_EMAIL_FROM` for your verified domain) in `.env.local`. Each run sends one digest covering stocks that newly match; if sending fails the alerts still appear in the bell.

Select a saved screen and turn **Alerts on** (first run only records a baseline). `npm run alerts` (or `POST /api/alerts/run`, or the bell's **Check now**) re-runs every alert-enabled screen and records stocks that entered or left it; the bell shows unread ones. `npm run refresh` = ingest + alerts, suitable for a daily cron. For a hosted deploy, set `CRON_SECRET` and call `/api/alerts/run` with `Authorization: Bearer <secret>` (the in-app Check now button won't work once it's set).

## Layout
- `src/lib/metrics.ts` – metric registry (add a filter = add a column + one entry)
- `src/lib/scoring.ts` – Snowflake scoring rules (0–6 per axis)
- `src/lib/run-screen.ts` – filter spec -> Supabase query (mock fallback)
- `src/components/` – Snowflake radar filter + screener UI
- `src/lib/saved.ts` + `src/app/api/screens` – saved screens (Supabase `saved_screens`, or `.data/` JSON file in mock mode)
- `src/lib/alerts.ts` + `src/app/api/alerts` – diff saved-screen matches between runs
- `scripts/ingest.mts` – Yahoo Finance -> Supabase upsert + scoring

## TODO
More tickers (screen by exchange listing); Push alerts; retry failed emails; full ticker universe; fix P/B for minor-unit currencies instead of nulling it.
