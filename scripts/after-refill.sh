#!/bin/zsh
# One-off: once the refill enrichment finishes, clear "0% gross margin" values (not applicable for banks),
# then re-run dedupe and rescore so scores use the cleaned data.
cd "$(dirname "$0")/.." || exit 1
while pgrep -f "scripts/enrich.mts" >/dev/null; do sleep 60; done
set -a; . ./.env.local; set +a
curl -s -X PATCH "$SUPABASE_URL/rest/v1/stocks?gross_margin=eq.0" -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Content-Type: application/json" -d '{"gross_margin":null}' -o /dev/null -w "cleared zero gross margins: HTTP %{http_code}\n"
npm run -s dedupe && npm run -s rescore
echo "after-refill finished $(date)"
