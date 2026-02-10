import 'dotenv/config';
/**
 * Fetch only gaps: before min(ts) and after max(ts) in DB. Paginate to get full history (HL: 500/req, 5000 max).
 * Rate limit: 1200 weight/min; min 3.5s between HL calls to stay under.
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY. Optional: COINS, INTERVAL (1h), DEX, CANDLE_HOURS (720 = 30d).
 */
const HL_INFO = 'https://api.hyperliquid.xyz/info';
const PAGINATION = 500;
const HL_CANDLES_MAX = 5000;
const WEIGHT_LIMIT_PER_MIN = 1200;
const WEIGHT_BASE = 20;
const MIN_MS_BETWEEN_CALLS = 3500;

const window = [];
let lastCallTime = 0;

function getSum() {
  const cutoff = Date.now() - 60000;
  while (window.length && window[0].t < cutoff) window.shift();
  return window.reduce((s, { w }) => s + w, 0);
}

async function waitForWeight(weight) {
  while (getSum() + weight > WEIGHT_LIMIT_PER_MIN) {
    const wait = window.length ? window[0].t + 60000 - Date.now() + 100 : 2000;
    await new Promise((r) => setTimeout(r, Math.max(500, wait)));
  }
  const elapsed = Date.now() - lastCallTime;
  if (elapsed < MIN_MS_BETWEEN_CALLS) await new Promise((r) => setTimeout(r, MIN_MS_BETWEEN_CALLS - elapsed));
}

function recordWeight(weight) {
  lastCallTime = Date.now();
  window.push({ t: lastCallTime, w: weight });
}

function weightCandleSnapshot(numItems) {
  return WEIGHT_BASE + Math.ceil((numItems || 0) / 60);
}
function weightFundingHistory(numItems) {
  return WEIGHT_BASE + Math.ceil((numItems || 0) / 20);
}

async function post(type, body = {}, retries = 2) {
  const maxWeight = type === 'candleSnapshot' ? WEIGHT_BASE + Math.ceil(500 / 60) : type === 'fundingHistory' ? WEIGHT_BASE + Math.ceil(500 / 20) : WEIGHT_BASE;
  for (let attempt = 0; attempt <= retries; attempt++) {
    await waitForWeight(maxWeight);
    const res = await fetch(HL_INFO, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, ...body }),
    });
    const text = await res.text();
    if (res.status === 429 && attempt < retries) {
      await new Promise((r) => setTimeout(r, (attempt + 1) * 8000));
      continue;
    }
    if (!res.ok) throw new Error(`HL ${type} ${res.status}: ${text}`);
    const data = text ? JSON.parse(text) : null;
    const w = type === 'candleSnapshot' ? weightCandleSnapshot(Array.isArray(data) ? data.length : 0) : type === 'fundingHistory' ? weightFundingHistory(Array.isArray(data) ? data.length : 0) : WEIGHT_BASE;
    recordWeight(w);
    return data;
  }
}

async function run() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(url, key);
  const dex = process.env.DEX ?? '';
  const interval = process.env.INTERVAL || '1h';
  const filterCoins = process.env.COINS ? process.env.COINS.split(',').map((c) => c.trim()).filter(Boolean) : null;
  const candleHours = parseInt(process.env.CANDLE_HOURS, 10) || 720;
  const endTime = Date.now();
  const startTimeCandles = endTime - candleHours * 60 * 60 * 1000;
  const startTimeFunding = endTime - 8 * 24 * 60 * 60 * 1000;

  const [meta, assetCtxs] = await post('metaAndAssetCtxs', dex ? { dex } : {});
  const universe = meta?.universe ?? [];
  const ctxs = Array.isArray(assetCtxs) ? assetCtxs : [assetCtxs];
  const now = new Date().toISOString();

  const symbols = universe
    .map((u, i) => ({ name: u.name, meta: u, ctx: ctxs[i] }))
    .filter(({ name }) => !filterCoins || filterCoins.includes(name))
    .filter(({ meta }) => !meta.isDelisted);

  const symbolList = symbols.map((s) => s.name);

  // DB: min and max ts per symbol for candles and funding
  const BATCH = 30;
  const minCandle = {};
  const maxCandle = {};
  const minFunding = {};
  const maxFunding = {};
  for (let i = 0; i < symbolList.length; i += BATCH) {
    const chunk = symbolList.slice(i, i + BATCH);
    const [cMin, cMax, fMin, fMax] = await Promise.all([
      Promise.all(chunk.map((s) => supabase.from('candles').select('ts').eq('symbol', s).eq('interval', interval).order('ts', { ascending: true }).limit(1).maybeSingle())),
      Promise.all(chunk.map((s) => supabase.from('candles').select('ts').eq('symbol', s).eq('interval', interval).order('ts', { ascending: false }).limit(1).maybeSingle())),
      Promise.all(chunk.map((s) => supabase.from('funding_history').select('ts').eq('symbol', s).order('ts', { ascending: true }).limit(1).maybeSingle())),
      Promise.all(chunk.map((s) => supabase.from('funding_history').select('ts').eq('symbol', s).order('ts', { ascending: false }).limit(1).maybeSingle())),
    ]);
    chunk.forEach((s, j) => {
      if (cMin[j]?.data?.ts) minCandle[s] = new Date(cMin[j].data.ts).getTime();
      if (cMax[j]?.data?.ts) maxCandle[s] = new Date(cMax[j].data.ts).getTime();
      if (fMin[j]?.data?.ts) minFunding[s] = new Date(fMin[j].data.ts).getTime();
      if (fMax[j]?.data?.ts) maxFunding[s] = new Date(fMax[j].data.ts).getTime();
    });
  }

  // Ranges to fetch: only before existing min and after existing max
  const candleRanges = (coin) => {
    const minT = minCandle[coin];
    const maxT = maxCandle[coin];
    const ranges = [];
    if (maxT == null || maxT < endTime - 60 * 60 * 1000) {
      ranges.push({ from: maxT != null ? maxT + 1 : startTimeCandles, to: endTime });
    }
    if (minT == null || minT > startTimeCandles) {
      const to = minT != null ? minT - 1 : endTime;
      if (startTimeCandles <= to) ranges.push({ from: startTimeCandles, to });
    }
    return ranges;
  };
  const fundingRanges = (coin) => {
    const minT = minFunding[coin];
    const maxT = maxFunding[coin];
    const ranges = [];
    if (maxT == null || maxT < endTime - 60 * 60 * 1000) {
      ranges.push({ from: maxT != null ? maxT + 1 : startTimeFunding, to: endTime });
    }
    if (minT == null || minT > startTimeFunding) {
      const to = minT != null ? minT - 1 : endTime;
      if (startTimeFunding <= to) ranges.push({ from: startTimeFunding, to });
    }
    return ranges;
  };

  // perp_meta + asset_ctxs
  const metaRows = symbols.map(({ name, meta: m }) => ({ symbol: name, sz_decimals: m.szDecimals ?? null, max_leverage: m.maxLeverage ?? null, meta: m }));
  if (metaRows.length) {
    const { error } = await supabase.from('perp_meta').upsert(metaRows, { onConflict: 'symbol' });
    if (error) console.error('perp_meta', error);
    else console.log('perp_meta:', metaRows.length);
  }

  const ctxRows = symbols
    .filter(({ ctx }) => ctx)
    .map(({ name, ctx }) => ({
      symbol: name,
      ts: now,
      mark_px: ctx.markPx != null ? Number(ctx.markPx) : null,
      mid_px: ctx.midPx != null ? Number(ctx.midPx) : null,
      oracle_px: ctx.oraclePx != null ? Number(ctx.oraclePx) : null,
      funding: ctx.funding != null ? Number(ctx.funding) : null,
      open_interest: ctx.openInterest != null ? Number(ctx.openInterest) : null,
      day_ntl_vlm: ctx.dayNtlVlm != null ? Number(ctx.dayNtlVlm) : null,
      prev_day_px: ctx.prevDayPx != null ? Number(ctx.prevDayPx) : null,
      premium: ctx.premium != null ? Number(ctx.premium) : null,
      impact_pxs: ctx.impactPxs ?? null,
    }));
  if (ctxRows.length) {
    const { error } = await supabase.from('asset_ctxs').upsert(ctxRows, { onConflict: 'symbol,ts' });
    if (error) console.error('asset_ctxs', error);
    else console.log('asset_ctxs:', ctxRows.length);
  }

  let candleCalls = 0;
  let fundingCalls = 0;
  const failed = [];

  for (const { name: coin } of symbols) {
    try {
      const ranges = candleRanges(coin);
      for (const { from, to } of ranges) {
        let fromT = from;
        let total = 0;
        while (fromT <= to) {
          const candles = await post('candleSnapshot', { req: { coin, interval, startTime: fromT, endTime: to } });
          candleCalls++;
          if (!candles?.length) break;
          const rows = candles.map((c) => ({
            symbol: coin,
            interval,
            ts: new Date(c.T).toISOString(),
            o: Number(c.o),
            h: Number(c.h),
            l: Number(c.l),
            c: Number(c.c),
            v: Number(c.v),
            n: c.n ?? null,
          }));
          const { error } = await supabase.from('candles').upsert(rows, { onConflict: 'symbol,interval,ts' });
          if (error) {
            console.error(coin, 'candles', error);
            break;
          }
          total += rows.length;
          const lastT = candles[candles.length - 1].T;
          if (lastT >= to || candles.length < PAGINATION) break;
          fromT = lastT + 1;
        }
        if (total) console.log(coin, 'candles:', total);
      }

      const franges = fundingRanges(coin);
      for (const { from, to } of franges) {
        let fromT = from;
        let total = 0;
        while (fromT <= to) {
          const funding = await post('fundingHistory', { coin, startTime: fromT, endTime: to });
          fundingCalls++;
          if (!funding?.length) break;
          const rows = funding.map((f) => ({
            symbol: coin,
            ts: new Date(f.time).toISOString(),
            funding_rate: Number(f.fundingRate),
            premium: f.premium != null ? Number(f.premium) : null,
          }));
          const { error } = await supabase.from('funding_history').upsert(rows, { onConflict: 'symbol,ts' });
          if (error) {
            console.error(coin, 'funding', error);
            break;
          }
          total += rows.length;
          const lastT = funding[funding.length - 1].time;
          if (lastT >= to || funding.length < PAGINATION) break;
          fromT = lastT + 1;
        }
        if (total) console.log(coin, 'funding:', total);
      }
    } catch (err) {
      console.error(coin, err.message);
      failed.push(coin);
    }
  }

  console.log('HL calls: candles', candleCalls, 'funding', fundingCalls);
  if (failed.length) console.error('Failed:', failed.join(', '));
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
