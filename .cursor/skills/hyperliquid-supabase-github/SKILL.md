---
name: hyperliquid-supabase-github
description: Fetches all public Hyperliquid data (meta, asset ctxs, candles, funding), stores in Supabase, runs on GitHub Actions. Use when working on ingest, Supabase schema, or scheduled jobs in this repo.
---

# Hyperliquid + Supabase + GitHub

## Data we ingest (discover from HL, then take all)
- **metaAndAssetCtxs** (dex `""`) → universe list + per-asset snapshot. Store: `perp_meta` (universe), `asset_ctxs` (mark_px, funding, open_interest, etc.) at run ts.
- **candleSnapshot** per symbol → `candles` (symbol, interval, ts, o,h,l,c,v,n). Paginate 500; interval 1h default.
- **fundingHistory** per symbol → `funding_history` (symbol, ts, funding_rate, premium). Paginate 500.

## HL API
- POST `https://api.hyperliquid.xyz/info`, body `{ type, ...params }`. Time-range responses: max 500 elements; use last timestamp as next startTime.

## Tables
- perp_meta (symbol, sz_decimals, max_leverage, meta jsonb)
- candles (symbol, interval, ts, o,h,l,c,v,n)
- funding_history (symbol, ts, funding_rate, premium)
- asset_ctxs (symbol, ts, mark_px, mid_px, oracle_px, funding, open_interest, day_ntl_vlm, prev_day_px, premium, impact_pxs)

## Ingest behavior
- Verify Supabase first: min(ts) and max(ts) per symbol. Fetch only gaps: before min (backfill) and after max (tail). No re-fetch of existing range.
- Paginate: HL returns 500/request, 5000 max candles. Script paginates until range is filled.
- Rate limit: 1200 weight/min. Min 3.5s between HL calls; sliding weight window; 429 retry with 8s backoff.

## Conventions
- Lean: one ingest script, one workflow. No extra .md.
- Secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. Optional vars: `COINS`, `INTERVAL`, `DEX`, `CANDLE_HOURS`.

## Next tasks
1. Vercel app: DB views and alert types.
2. Alerts: triggers and actions.
