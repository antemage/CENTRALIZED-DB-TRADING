'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Chart from '@/components/Chart';
import SymbolSelect from '@/components/SymbolSelect';
import TimeBar from '@/components/TimeBar';

type CandleRow = { ts: string; o: number; h: number; l: number; c: number; v: number };

const LIMIT = 500;
const INTERVALS = ['1h', '15m'] as const;
const SORT_OPTIONS = ['24h', '1h', '15m', 'off'] as const;

function nextCloseMs(interval: string): number {
  const now = Date.now();
  const ms = interval === '15m' ? 15 * 60 * 1000 : 60 * 60 * 1000;
  const next = Math.ceil(now / ms) * ms;
  return next - now;
}

function ToolbarMeta({ lastClose, interval, tz }: { lastClose: number | null; interval: string; tz: 'UTC' | 'IST' }) {
  const [countdown, setCountdown] = useState('--');
  const [now, setNow] = useState('');
  useEffect(() => {
    const tick = () => {
      const ms = nextCloseMs(interval);
      const s = Math.floor(ms / 1000);
      const m = Math.floor(s / 60);
      const sec = s % 60;
      setCountdown(`${m}:${sec.toString().padStart(2, '0')}`);
      const d = new Date();
      setNow(tz === 'IST'
        ? d.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false })
        : d.toLocaleTimeString('en-GB', { timeZone: 'UTC', hour12: false }));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [interval, tz]);
  return (
    <div className="toolbar-meta">
      <span>Close: <span className="meta-value">{lastClose != null ? lastClose.toLocaleString(undefined, { maximumFractionDigits: 4 }) : '--'}</span></span>
      <span>Time: <span className="meta-value">{now || '--'}</span></span>
      <span>Next: <span className="meta-value">{countdown}</span></span>
    </div>
  );
}

export default function Home() {
  const [symbols, setSymbols] = useState<string[]>([]);
  const [prices, setPrices] = useState<Record<string, { close: number; change24h?: number }>>({});
  const [returns, setReturns] = useState<Record<string, number>>({});
  const [symbol, setSymbol] = useState('');
  const [interval, setInterval] = useState<'1h' | '15m'>('1h');
  const [sortBy, setSortBy] = useState<'24h' | '1h' | '15m' | 'off'>('24h');
  const [order, setOrder] = useState<'desc' | 'asc'>('desc');
  const [benchmark, setBenchmark] = useState<'USDT' | 'BTC'>('USDT');
  const [maLength, setMaLength] = useState(20);
  const [candles, setCandles] = useState<CandleRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMoreOlder, setHasMoreOlder] = useState(true);
  const [tz, setTz] = useState<'UTC' | 'IST'>('UTC');
  const lastCandleTsRef = useRef<string>('');

  const performance = sortBy === 'off' ? undefined : sortBy;
  const symbolsQuery = performance
    ? `performance=${performance}&interval=${interval}&benchmark=${benchmark}&order=${order}&prices=1`
    : 'prices=1';

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/symbols?${symbolsQuery}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.error) return;
        const list = data.symbols ?? data;
        setSymbols(Array.isArray(list) ? list : []);
        if (data.prices) setPrices(data.prices);
        if (data.returns) setReturns(data.returns);
        if (!symbol && list?.length) setSymbol(list[0]);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [symbolsQuery]);

  const loadCandles = useCallback(async (sym: string, opts?: { before?: string; after?: string }) => {
    const params = new URLSearchParams({ symbol: sym, interval, limit: String(LIMIT) });
    if (opts?.before) params.set('before', opts.before);
    if (opts?.after) params.set('after', opts.after);
    const res = await fetch(`/api/candles?${params}`);
    const data = await res.json();
    if (!res.ok || data.error) return [];
    return Array.isArray(data) ? data : [];
  }, [interval]);

  useEffect(() => {
    if (!symbol) {
      setCandles([]);
      setHasMoreOlder(true);
      return;
    }
    setLoading(true);
    setHasMoreOlder(true);
    loadCandles(symbol)
      .then((rows) => {
        setCandles(rows);
        setHasMoreOlder(rows.length >= LIMIT);
      })
      .finally(() => setLoading(false));
  }, [symbol, interval, loadCandles]);

  lastCandleTsRef.current = candles.length ? candles[candles.length - 1].ts : '';

  // Poll for new candles so dashboard updates when ingest writes to Supabase
  useEffect(() => {
    if (!symbol || !candles.length) return;
    const id = setInterval(() => {
      const after = lastCandleTsRef.current;
      if (!after) return;
      loadCandles(symbol, { after }).then((rows) => {
        if (rows.length) setCandles((prev) => [...prev, ...rows]);
      });
    }, 15000);
    return () => clearInterval(id);
  }, [symbol, interval, loadCandles, candles.length]);

  const handleLoadMore = useCallback((before: string) => {
    if (!symbol || loadingMore) return;
    setLoadingMore(true);
    loadCandles(symbol, { before })
      .then((rows) => {
        if (rows.length < LIMIT) setHasMoreOlder(false);
        if (rows.length) setCandles((prev) => [...rows, ...prev]);
      })
      .finally(() => setLoadingMore(false));
  }, [symbol, loadCandles, loadingMore]);

  const handleLoadNewer = useCallback((after: string) => {
    if (!symbol || loadingMore) return;
    setLoadingMore(true);
    loadCandles(symbol, { after })
      .then((rows) => {
        if (rows.length) setCandles((prev) => [...prev, ...rows]);
      })
      .finally(() => setLoadingMore(false));
  }, [symbol, loadCandles, loadingMore]);

  const lastCandleTs = candles.length ? candles[candles.length - 1].ts : null;

  return (
    <>
      <header className="toolbar">
        <SymbolSelect
          symbols={symbols}
          selected={symbol}
          onSelect={setSymbol}
          prices={Object.keys(prices).length ? prices : undefined}
          returns={Object.keys(returns).length ? returns : undefined}
          performance={performance}
          disabled={loading}
          sortBy={sortBy}
          order={order}
          benchmark={benchmark}
          onSortByChange={setSortBy}
          onOrderChange={() => setOrder((o) => (o === 'desc' ? 'asc' : 'desc'))}
          onBenchmarkChange={setBenchmark}
        />
        <div className="tf">
          {INTERVALS.map((tf) => (
            <button
              key={tf}
              type="button"
              className={interval === tf ? 'active' : ''}
              onClick={() => setInterval(tf)}
            >
              {tf}
            </button>
          ))}
        </div>
        <label>
          MA
          <input
            type="number"
            min={1}
            max={200}
            value={maLength}
            onChange={(e) => setMaLength(Math.max(1, Math.min(200, Number(e.target.value) || 20)))}
            style={{ width: 56 }}
          />
        </label>
        <ToolbarMeta
          lastClose={candles.length ? Number(candles[candles.length - 1].c) : null}
          interval={interval}
          tz={tz}
        />
      </header>
      <div className="chart-wrap">
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--muted)' }}>
            Loading…
          </div>
        ) : (
          <Chart
            data={candles}
            maLength={maLength}
            onLoadMore={handleLoadMore}
            onLoadNewer={handleLoadNewer}
            loadingMore={loadingMore}
            hasMoreOlder={hasMoreOlder}
          />
        )}
      </div>
      <TimeBar lastCandleTs={lastCandleTs} interval={interval} tz={tz} onTzChange={setTz} />
    </>
  );
}
