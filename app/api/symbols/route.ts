import { getSupabase } from '@/lib/supabase-server';
import { NextRequest, NextResponse } from 'next/server';

const WINDOW_CANDLES: Record<string, Record<string, number>> = {
  '24h': { '1h': 24, '15m': 96 },
  '1h': { '1h': 1, '15m': 4 },
  '15m': { '15m': 1, '1h': 0 },
};

export async function GET(req: NextRequest) {
  const performance = req.nextUrl.searchParams.get('performance') as '24h' | '1h' | '15m' | null;
  const intervalParam = (req.nextUrl.searchParams.get('interval') ?? '1h') as '1h' | '15m';
  const benchmark = (req.nextUrl.searchParams.get('benchmark') ?? 'USDT') as 'USDT' | 'BTC';
  const order = (req.nextUrl.searchParams.get('order') ?? 'desc') as 'desc' | 'asc';
  const prices = req.nextUrl.searchParams.get('prices') === '1';
  const interval = performance === '15m' ? '15m' : performance === '1h' ? '1h' : intervalParam;

  try {
    const supabase = getSupabase();

    if (!performance || performance === 'off') {
      const { data, error } = await supabase
        .from('perp_meta')
        .select('symbol')
        .order('symbol');
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      const symbols = (data ?? []).map((r) => r.symbol);
      if (!prices) return NextResponse.json(symbols);
      const { data: rows } = await supabase
        .from('candles')
        .select('symbol, ts, c')
        .eq('interval', '1h')
        .order('ts', { ascending: false })
        .limit(25000);
      const bySymbol = new Map<string, { c: number }[]>();
      for (const r of rows ?? []) {
        const list = bySymbol.get(r.symbol) ?? [];
        if (list.length < 25) {
          list.push({ c: Number(r.c) });
          bySymbol.set(r.symbol, list);
        }
      }
      const priceMap: Record<string, { close: number; change24h: number }> = {};
      for (const sym of symbols) {
        const list = bySymbol.get(sym);
        if (!list?.length) continue;
        const close = list[0].c;
        const old = list.length > 24 ? list[24].c : list[list.length - 1].c;
        priceMap[sym] = { close, change24h: old === 0 ? 0 : ((close - old) / old) * 100 };
      }
      return NextResponse.json({ symbols, prices: priceMap });
    }

    const N = WINDOW_CANDLES[performance]?.[interval] ?? 0;
    if (N === 0) {
      const { data, error } = await supabase.from('perp_meta').select('symbol').order('symbol');
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ symbols: (data ?? []).map((r) => r.symbol) });
    }

    const { data: rows, error } = await supabase
      .from('candles')
      .select('symbol, ts, c')
      .eq('interval', interval)
      .order('ts', { ascending: false })
      .limit(22000);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const bySymbol = new Map<string, { ts: string; c: number }[]>();
    for (const r of rows ?? []) {
      const list = bySymbol.get(r.symbol) ?? [];
      if (list.length < N + 1) {
        list.push({ ts: r.ts, c: Number(r.c) });
        bySymbol.set(r.symbol, list);
      }
    }
    const returns = new Map<string, number>();
    const priceMap: Record<string, { close: number }> = {};
    for (const [sym, list] of bySymbol.entries()) {
      if (list.length) priceMap[sym] = { close: list[0].c };
      if (list.length < 2) continue;
      const latest = list[0];
      const old = list[Math.min(N, list.length - 1)];
      if (old.c === 0) continue;
      returns.set(sym, ((latest.c - old.c) / old.c) * 100);
    }
    let btcReturn: number | null = null;
    if (benchmark === 'BTC' && returns.has('BTC')) btcReturn = returns.get('BTC')!;
    const list = Array.from(returns.entries()).map(([symbol, ret]) => ({
      symbol,
      return: btcReturn != null ? ret - btcReturn : ret,
    }));
    list.sort((a, b) => (order === 'desc' ? b.return - a.return : a.return - b.return));
    const symbols = list.map((x) => x.symbol);
    const { data: allData } = await supabase.from('perp_meta').select('symbol').order('symbol');
    for (const r of allData ?? []) {
      if (!symbols.includes(r.symbol)) symbols.push(r.symbol);
    }
    const returnsObj: Record<string, number> = {};
    for (const [sym, ret] of returns) {
      returnsObj[sym] = btcReturn != null ? ret - btcReturn : ret;
    }
    return NextResponse.json({ symbols, returns: returnsObj, prices: priceMap });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
