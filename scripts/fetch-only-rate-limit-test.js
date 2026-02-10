/**
 * Fetch-only script: same HL API calls as ingest (candles + funding per symbol) but no DB.
 * Use to tune BATCH_SIZE and BATCH_DELAY_MS. Run: node scripts/fetch-only-rate-limit-test.js
 * Env: INTERVAL (1h|15m), BATCH_SIZE, BATCH_DELAY_MS, optional COINS=SYM1,SYM2
 */
import 'dotenv/config';

const HL_API = 'https://api.hyperliquid.xyz/info';
const INTERVAL = process.env.INTERVAL ?? '1h';
const BATCH_SIZE = Number(process.env.BATCH_SIZE) || 8;
const BATCH_DELAY_MS = Number(process.env.BATCH_DELAY_MS) || 3000;
const BATCH_COOLDOWN_EVERY = Number(process.env.BATCH_COOLDOWN_EVERY) || 6;
const BATCH_COOLDOWN_MS = Number(process.env.BATCH_COOLDOWN_MS) || 60000;

// Small window so each symbol = 1 candle + 1 funding request (focus on rate limits)
const INTERVAL_MS = INTERVAL === '15m' ? 15 * 60 * 1000 : 60 * 60 * 1000;
const WINDOW_MS = 2 * INTERVAL_MS;

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

async function fetchCandles(symbol, startTimeMs, endTimeMs) {
  return hlPost({
    type: 'candleSnapshot',
    req: { coin: symbol, interval: INTERVAL, startTime: startTimeMs, endTime: endTimeMs },
  });
}

async function fetchFunding(symbol, startTimeMs, endTimeMs) {
  return hlPost({ type: 'fundingHistory', coin: symbol, startTime: startTimeMs, endTime: endTimeMs });
}

async function main() {
  const meta = await hlPost({ type: 'metaAndAssetCtxs' });
  const universe = meta?.[0]?.universe ?? [];
  const symbolsFromEnv = process.env.COINS ? process.env.COINS.split(',').map((s) => s.trim()) : null;
  const symbols = symbolsFromEnv ?? universe.filter((a) => !a.isDelisted).map((a) => a.name);

  const now = Date.now();
  const endMs = now;
  const startMs = now - WINDOW_MS;

  console.log(`Fetch-only (no DB). INTERVAL=${INTERVAL} BATCH_SIZE=${BATCH_SIZE} BATCH_DELAY_MS=${BATCH_DELAY_MS}`);
  console.log(`Symbols: ${symbols.length}. Window: ${WINDOW_MS / 1000}s. Each symbol = 1 candle + 1 funding request.\n`);

  const tStart = Date.now();
  const numBatches = Math.ceil(symbols.length / BATCH_SIZE);

  for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
    const t = Date.now();
    const batch = symbols.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async (symbol) => {
        const [c, f] = await Promise.all([
          fetchCandles(symbol, startMs, endMs),
          fetchFunding(symbol, startMs, endMs),
        ]);
        return { symbol, candles: (c ?? []).length, funding: (f ?? []).length };
      })
    );
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    console.log(`[${((Date.now() - t) / 1000).toFixed(1)}s] Batch ${batchNum}/${numBatches}`);
    if (i + BATCH_SIZE < symbols.length) {
      await sleep(BATCH_DELAY_MS);
      if (batchNum % BATCH_COOLDOWN_EVERY === 0) {
        console.log(`Cooldown ${BATCH_COOLDOWN_MS / 1000}s (every ${BATCH_COOLDOWN_EVERY} batches)`);
        await sleep(BATCH_COOLDOWN_MS);
      }
    }
  }

  console.log(`\nDone. Total: ${((Date.now() - tStart) / 1000).toFixed(1)}s`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
