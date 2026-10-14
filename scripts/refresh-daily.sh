#!/bin/zsh
# Run by launchd: re-ingest all tickers, rescore, then check alerts. Logs to .data/refresh.log
cd "$(dirname "$0")/.." || exit 1
mkdir -p .data
export PATH="/Users/apple/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
{
  echo "=== refresh started $(date) ==="
  npm run refresh
  echo "=== refresh finished $(date) (exit $?) ==="
} >> .data/refresh.log 2>&1
