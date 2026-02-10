import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const supabase = createClient(url, key);

  console.log('=== Candles coverage (1h and 15m) ===\n');
  console.log('For full per-symbol report, run scripts/verify.sql in Supabase SQL editor.\n');

  for (const interval of ['1h', '15m']) {
    const { count, error } = await supabase
      .from('candles')
      .select('*', { count: 'exact', head: true })
      .eq('interval', interval);

    if (error) {
      console.error(interval, error.message);
      continue;
    }

    const { data: sample } = await supabase
      .from('candles')
      .select('symbol, ts')
      .eq('interval', interval)
      .order('ts', { ascending: false })
      .limit(500);

    const bySymbol = new Map();
    for (const r of sample ?? []) {
      if (!bySymbol.has(r.symbol)) bySymbol.set(r.symbol, { min: r.ts, max: r.ts, n: 0 });
      const s = bySymbol.get(r.symbol);
      s.n++;
      if (r.ts < s.min) s.min = r.ts;
      if (r.ts > s.max) s.max = r.ts;
    }

    console.log(`--- ${interval}: total rows = ${count ?? 0} ---`);
    const symbols = [...bySymbol.keys()].sort();
    for (const sym of symbols.slice(0, 15)) {
      const s = bySymbol.get(sym);
      console.log(`  ${sym}: sample count=${s.n}, min=${s.min}, max=${s.max}`);
    }
    if (symbols.length > 15) console.log(`  ... and ${symbols.length - 15} more symbols`);
    console.log('');
  }

  console.log('=== Funding history (sample) ===');
  const { data: fundRows, error: fundErr } = await supabase
    .from('funding_history')
    .select('symbol, ts')
    .order('ts', { ascending: false })
    .limit(5);
  if (fundErr) console.error(fundErr.message);
  else console.log(fundRows ?? []);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
