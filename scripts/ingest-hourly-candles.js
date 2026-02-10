import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

if (process.argv.includes('--refetch-today')) process.env.REFETCH_TODAY = '1';

const HL_API = 'https://api.hyperliquid.xyz/info';
const DEX = process.env.DEX ?? '';
const INTERVAL = process.env.INTERVAL ?? '1h';
const CANDLE_HOURS = Number(process.env.CANDLE_HOURS) || (INTERVAL === '15m' ? 1250 : 720);
const PAGE_SIZE = 500;
// Slower on GitHub: runner↔HL/Supabase latency, many batches, funding 60s cooldown every 6 batches.
// Override via env: BATCH_SIZE, BATCH_DELAY_MS, BATCH_COOLDOWN_MS, BATCH_COOLDOWN_EVERY
const BATCH_SIZE = Number(process.env.BATCH_SIZE) || 9;
const BATCH_DELAY_MS = Number(process.env.BATCH_DELAY_MS) || 500;
const BATCH_COOLDOWN_EVERY = Number(process.env.BATCH_COOLDOWN_EVERY) || 6;
const BATCH_COOLDOWN_MS = Number(process.env.BATCH_COOLDOWN_MS) || 60000;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function hlPost(body, retries = 4) {
  const res = await fetch(HL_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (res.status === 429 && retries > 0) {
    const wait = 8000 * (5 - retries);
    await sleep(wait);
    return hlPost(body, retries - 1);
  }
  if (!res.ok) throw new Error(`HL ${res.status}: ${await res.text()}`);
  return res.json();
}

/** Latest ts per symbol for our symbol list only (avoids missing symbols as table grows). */
async function getCandleMaxPerSymbol(supabase, symbols, interval) {
  const iv = interval ?? INTERVAL;
  if (!symbols?.length) return new Map();
  const { data, error } = await supabase
    .from('candles')
    .select('symbol, ts')
    .eq('interval', iv)
    .in('symbol', symbols)
    .order('ts', { ascending: false })
    .limit(10000);
  if (error) throw error;
  const map = new Map();
  for (const row of data ?? []) {
    if (!map.has(row.symbol)) map.set(row.symbol, row.ts);
  }
  return map;
}

/** Latest ts per symbol for our symbol list only. */
async function getFundingMaxPerSymbol(supabase, symbols) {
  if (!symbols?.length) return new Map();
  const { data, error } = await supabase
    .from('funding_history')
    .select('symbol, ts')
    .in('symbol', symbols)
    .order('ts', { ascending: false })
    .limit(10000);
  if (error) throw error;
  const map = new Map();
  for (const row of data ?? []) {
    if (!map.has(row.symbol)) map.set(row.symbol, row.ts);
  }
  return map;
}

function tsToMs(ts) {
  if (ts == null) return null;
  const ms = new Date(ts).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function candleRequestBody(symbol, startTimeMs, endTimeMs, interval) {
  const iv = interval ?? INTERVAL;
  return {
    type: 'candleSnapshot',
    req: { coin: symbol, interval: iv, startTime: startTimeMs, endTime: endTimeMs },
  };
}

function fundingRequestBody(symbol, startTimeMs, endTimeMs) {
  return { type: 'fundingHistory', coin: symbol, startTime: startTimeMs, endTime: endTimeMs };
}

async function fetchCandles(symbol, startTimeMs, endTimeMs, interval) {
  return hlPost(candleRequestBody(symbol, startTimeMs, endTimeMs, interval));
}

async function fetchFunding(symbol, startTimeMs, endTimeMs) {
  return hlPost(fundingRequestBody(symbol, startTimeMs, endTimeMs));
}

function candleTsToIntervalBoundary(ms, interval) {
  const iv = interval ?? INTERVAL;
  const step = iv === '15m' ? 15 * 60 * 1000 : 60 * 60 * 1000;
  const boundary = Math.floor(ms / step) * step;
  return new Date(boundary).toISOString().replace('Z', '+00:00');
}

function candleRows(rows, symbol, interval) {
  const iv = interval ?? INTERVAL;
  return (rows || []).map((r) => ({
    symbol,
    interval: iv,
    ts: candleTsToIntervalBoundary(new Date(r.t).getTime(), iv),
    o: String(r.o),
    h: String(r.h),
    l: String(r.l),
    c: String(r.c),
    v: Number(r.v) || 0,
    n: Number(r.n) || 0,
  }));
}

/** Only include candles whose period has closed (bar end <= now). */
function filterClosedCandles(rows, interval, nowMs = Date.now()) {
  const iv = interval ?? INTERVAL;
  const intervalMs = iv === '15m' ? 15 * 60 * 1000 : 60 * 60 * 1000;
  return rows.filter((r) => {
    const startMs = tsToMs(r.ts);
    return startMs != null && startMs + intervalMs <= nowMs;
  });
}

/** Dedupe by (symbol, interval, ts) keeping last occurrence so we never upsert duplicate keys. */
function dedupeCandleRows(rows) {
  const seen = new Map();
  for (const r of rows) {
    const key = `${r.symbol}\0${r.interval}\0${r.ts}`;
    seen.set(key, r);
  }
  return [...seen.values()];
}

function fundingRows(rows, symbol) {
  return (rows || []).map((r) => ({
    symbol,
    ts: new Date(r.time).toISOString().replace('Z', '+00:00'),
    funding_rate: String(r.fundingRate ?? ''),
    premium: r.premium != null ? String(r.premium) : null,
  }));
}

async function upsertCandles(supabase, rows) {
  if (!rows.length) return;
  const deduped = dedupeCandleRows(rows);
  const { error } = await supabase.from('candles').upsert(deduped, {
    onConflict: 'symbol,interval,ts',
  });
  if (error) throw error;
}

async function upsertFunding(supabase, rows) {
  if (!rows.length) return;
  const { error } = await supabase.from('funding_history').upsert(rows, {
    onConflict: 'symbol,ts',
  });
  if (error) throw error;
}

async function backfillCandles(supabase, symbol, knownMaxTs, interval) {
  const iv = interval ?? INTERVAL;
  const maxTs = knownMaxTs ?? null;
  const now = Date.now();
  const intervalMs = iv === '15m' ? 15 * 60 * 1000 : 60 * 60 * 1000;
  let total = 0;

  const lastClosedEndMs = Math.floor(now / intervalMs) * intervalMs;
  const requestEndMs = lastClosedEndMs - 1;
  if (maxTs) {
    let afterMax = tsToMs(maxTs) + intervalMs;
    while (afterMax <= requestEndMs) {
      const endMs = Math.min(requestEndMs, afterMax + PAGE_SIZE * intervalMs);
      const data = await fetchCandles(symbol, afterMax, endMs, iv);
      const rows = filterClosedCandles(candleRows(data, symbol, iv), iv, now);
      if (rows.length) await upsertCandles(supabase, rows);
      total += rows.length;
      if (rows.length < PAGE_SIZE) break;
      const lastT = data[data.length - 1]?.t;
      afterMax = lastT != null ? lastT + intervalMs : endMs + intervalMs;
    }
  } else {
    const startMs = now - PAGE_SIZE * intervalMs;
    const data = await fetchCandles(symbol, startMs, requestEndMs, iv);
    const rows = filterClosedCandles(candleRows(data, symbol, iv), iv, now);
    if (rows.length) await upsertCandles(supabase, rows);
    total += rows.length;
  }

  return total;
}

async function backfillFunding(supabase, symbol, knownMaxTs) {
  const maxTs = knownMaxTs ?? null;
  const now = Date.now();
  let total = 0;

  const fetchAndUpsert = async (startMs, endMs) => {
    const data = await fetchFunding(symbol, startMs, endMs);
    const rows = fundingRows(data, symbol);
    if (rows.length) await upsertFunding(supabase, rows);
    return {
      count: rows.length,
      lastTime: data?.[data.length - 1]?.time,
    };
  };

  // Front-fill only: fetch new funding after latest in DB
  if (maxTs) {
    let afterMs = tsToMs(maxTs) + 1;
    while (afterMs < now) {
      const { count, lastTime } = await fetchAndUpsert(afterMs, now);
      total += count;
      if (count < PAGE_SIZE) break;
      afterMs = (lastTime ?? afterMs) + 1;
    }
  } else {
    // No data yet: seed with one page of recent funding
    const startMs = now - 14 * 8 * 60 * 60 * 1000;
    const { count } = await fetchAndUpsert(startMs, now);
    total += count;
  }

  return total;
}

/** Refetch a fixed time range (e.g. today). Fetches in pages and upserts only closed candles. */
async function refetchCandleRange(supabase, symbol, interval, startMs, endMs) {
  const iv = interval ?? INTERVAL;
  const intervalMs = iv === '15m' ? 15 * 60 * 1000 : 60 * 60 * 1000;
  const now = Date.now();
  let total = 0;
  let currentStart = startMs;
  while (currentStart < endMs) {
    const pageEndMs = Math.min(endMs, currentStart + PAGE_SIZE * intervalMs);
    const data = await fetchCandles(symbol, currentStart, pageEndMs, iv);
    const rows = filterClosedCandles(candleRows(data, symbol, iv), iv, now);
    if (rows.length) await upsertCandles(supabase, rows);
    total += rows.length;
    if (rows.length < PAGE_SIZE) break;
    const lastT = data[data.length - 1]?.t;
    currentStart = lastT != null ? lastT + intervalMs : pageEndMs + intervalMs;
  }
  return total;
}

async function runRefetchTodayBatches(supabase, symbols, interval, startMs, endMs) {
  let candleTotal = 0;
  const numBatches = Math.ceil(symbols.length / BATCH_SIZE);
  for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
    const t = Date.now();
    const batch = symbols.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (symbol) => {
        try {
          const c = await refetchCandleRange(supabase, symbol, interval, startMs, endMs);
          return { symbol, c };
        } catch (err) {
          return { symbol, err: err.message };
        }
      })
    );
    for (const r of results) {
      if (r.err) console.error(`${r.symbol}: ${r.err}`);
      else {
        candleTotal += r.c;
        if (r.c) console.log(`${r.symbol}: ${interval} +${r.c} candles`);
      }
    }
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    console.log(`[${((Date.now() - t) / 1000).toFixed(1)}s] Batch ${batchNum}/${numBatches} (refetch ${interval})`);
    if (i + BATCH_SIZE < symbols.length) await sleep(BATCH_DELAY_MS);
  }
  return candleTotal;
}

const INGEST_MODE = process.env.INGEST_MODE ?? '';

async function runCandleBatches(supabase, symbols, candleMax, interval, skipFunding, fundingMax) {
  let candleTotal = 0;
  let fundingTotal = 0;
  const numBatches = Math.ceil(symbols.length / BATCH_SIZE);
  for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
    const t = Date.now();
    const batch = symbols.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (symbol) => {
        try {
          const c = await backfillCandles(supabase, symbol, candleMax.get(symbol), interval);
          const f = skipFunding ? 0 : await backfillFunding(supabase, symbol, fundingMax.get(symbol));
          return { symbol, c, f };
        } catch (err) {
          return { symbol, err: err.message };
        }
      })
    );
    for (const r of results) {
      if (r.err) console.error(`${r.symbol}: ${r.err}`);
      else {
        candleTotal += r.c;
        fundingTotal += r.f;
        if (r.c || r.f) console.log(`${r.symbol}: +${r.c} candles${skipFunding ? '' : `, +${r.f} funding`}`);
      }
    }
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    console.log(`[${((Date.now() - t) / 1000).toFixed(1)}s] Batch ${batchNum}/${numBatches} (${interval})`);
    if (i + BATCH_SIZE < symbols.length) await sleep(BATCH_DELAY_MS);
  }
  return { candleTotal, fundingTotal };
}

async function runFundingOnlyBatches(supabase, symbols, fundingMax) {
  let fundingTotal = 0;
  const numBatches = Math.ceil(symbols.length / BATCH_SIZE);
  for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
    const t = Date.now();
    const batch = symbols.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (symbol) => {
        try {
          const f = await backfillFunding(supabase, symbol, fundingMax.get(symbol));
          return { symbol, f };
        } catch (err) {
          return { symbol, err: err.message };
        }
      })
    );
    for (const r of results) {
      if (r.err) console.error(`${r.symbol}: ${r.err}`);
      else {
        fundingTotal += r.f;
        if (r.f) console.log(`${r.symbol}: +${r.f} funding`);
      }
    }
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    console.log(`[${((Date.now() - t) / 1000).toFixed(1)}s] Batch ${batchNum}/${numBatches} (funding)`);
    if (i + BATCH_SIZE < symbols.length) {
      await sleep(BATCH_DELAY_MS);
      if (batchNum % BATCH_COOLDOWN_EVERY === 0) {
        console.log(`Cooldown ${BATCH_COOLDOWN_MS / 1000}s (every ${BATCH_COOLDOWN_EVERY} batches)`);
        await sleep(BATCH_COOLDOWN_MS);
      }
    }
  }
  return fundingTotal;
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  console.log('SUPABASE_URL set:', !!url);
  console.log('SUPABASE_SERVICE_ROLE_KEY set:', !!key);
  console.log('INGEST_MODE:', INGEST_MODE || '(single)');
  if (!url || !key) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Add them as repo secrets.');
    process.exit(1);
  }

  const supabase = createClient(url, key);
  const tStart = Date.now();

  let t = Date.now();
  const metaData = await hlPost({ type: 'metaAndAssetCtxs', dex: DEX });
  const universe = metaData?.[0]?.universe ?? [];
  const symbolsFromEnv = process.env.COINS ? process.env.COINS.split(',').map((s) => s.trim()) : null;
  const symbols = symbolsFromEnv ?? universe.filter((a) => !a.isDelisted).map((a) => a.name);
  const metaRows = universe.filter((a) => !a.isDelisted).map((a) => ({
    symbol: a.name,
    sz_decimals: a.szDecimals ?? 0,
    max_leverage: a.maxLeverage ?? 0,
    meta: a,
  }));
  if (metaRows.length) {
    const { error } = await supabase.from('perp_meta').upsert(metaRows, { onConflict: 'symbol' });
    if (error) console.warn('perp_meta upsert:', error.message);
  }
  console.log(`[${((Date.now() - t) / 1000).toFixed(1)}s] HL meta + perp_meta upsert`);

  const fundingMax = await getFundingMaxPerSymbol(supabase, symbols);
  console.log(`[0.0s] Funding latest ts: ${fundingMax.size}/${symbols.length} symbols`);

  if (process.env.REFETCH_TODAY === '1') {
    const now = Date.now();
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    const startOfTodayMs = d.getTime();
    const intervalMs1h = 60 * 60 * 1000;
    const intervalMs15m = 15 * 60 * 1000;
    const lastClosed1h = Math.floor(now / intervalMs1h) * intervalMs1h;
    const lastClosed15m = Math.floor(now / intervalMs15m) * intervalMs15m;
    console.log(`Refetch today (UTC): ${new Date(startOfTodayMs).toISOString().slice(0, 10)} until last closed`);
    console.log(`  1h end: ${new Date(lastClosed1h).toISOString()}  15m end: ${new Date(lastClosed15m).toISOString()}`);
    console.log(`Refetching 1h candles for ${symbols.length} symbols (batch ${BATCH_SIZE})...`);
    const r1 = await runRefetchTodayBatches(supabase, symbols, '1h', startOfTodayMs, lastClosed1h);
    console.log(`Refetching 15m candles for ${symbols.length} symbols (batch ${BATCH_SIZE})...`);
    const r2 = await runRefetchTodayBatches(supabase, symbols, '15m', startOfTodayMs, lastClosed15m);
    console.log(`Done. 1h: ${r1} candles, 15m: ${r2} candles. Total: ${((Date.now() - tStart) / 1000).toFixed(1)}s`);
    return;
  }

  if (INGEST_MODE === 'hourly') {
    // 1h candles first, then 15m candles, then funding (once per hour)
    t = Date.now();
    const candleMax1h = await getCandleMaxPerSymbol(supabase, symbols, '1h');
    console.log(`[${((Date.now() - t) / 1000).toFixed(1)}s] Bulk load latest ts 1h: ${candleMax1h.size}/${symbols.length} symbols`);
    console.log(`Ingesting 1h candles for ${symbols.length} symbols (batch ${BATCH_SIZE}, ${BATCH_DELAY_MS}ms between batches)`);
    const r1 = await runCandleBatches(supabase, symbols, candleMax1h, '1h', true, fundingMax);
    t = Date.now();
    const candleMax15m = await getCandleMaxPerSymbol(supabase, symbols, '15m');
    console.log(`[${((Date.now() - t) / 1000).toFixed(1)}s] Bulk load latest ts 15m: ${candleMax15m.size}/${symbols.length} symbols`);
    console.log(`Ingesting 15m candles for ${symbols.length} symbols (batch ${BATCH_SIZE}, ${BATCH_DELAY_MS}ms between batches)`);
    const r2 = await runCandleBatches(supabase, symbols, candleMax15m, '15m', true, fundingMax);
    console.log(`Ingesting funding for ${symbols.length} symbols (batch ${BATCH_SIZE}, ${BATCH_DELAY_MS}ms between batches)`);
    const fundingTotal = await runFundingOnlyBatches(supabase, symbols, fundingMax);
    console.log(`Done. 1h candles: ${r1.candleTotal}, 15m candles: ${r2.candleTotal}, Funding: ${fundingTotal}. Total: ${((Date.now() - tStart) / 1000).toFixed(1)}s`);
    return;
  }

  const interval = process.env.INTERVAL ?? '1h';
  const skipFunding = process.env.SKIP_FUNDING === '1';
  t = Date.now();
  const candleMax = await getCandleMaxPerSymbol(supabase, symbols, interval);
  console.log(`[${((Date.now() - t) / 1000).toFixed(1)}s] Bulk load latest ts (${interval}): ${candleMax.size}/${symbols.length} symbols`);
  console.log(`Ingesting ${interval} candles${skipFunding ? '' : ' and funding'} for ${symbols.length} symbols (batch ${BATCH_SIZE}, ${BATCH_DELAY_MS}ms between batches)`);
  const { candleTotal, fundingTotal } = await runCandleBatches(supabase, symbols, candleMax, interval, skipFunding, fundingMax);
  console.log(`Done. Candles: ${candleTotal}, Funding: ${fundingTotal}. Total: ${((Date.now() - tStart) / 1000).toFixed(1)}s`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
