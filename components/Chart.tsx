'use client';

import { useEffect, useRef } from 'react';
import { createChart, ColorType, IChartApi, ISeriesApi, CandlestickData, LineData, HistogramData } from 'lightweight-charts';

type CandleRow = { ts: string; o: number; h: number; l: number; c: number; v: number };

function toTime(ts: string) {
  return Math.floor(new Date(ts).getTime() / 1000) as any;
}

function computeMA(closes: number[], period: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) { out.push(NaN); continue; }
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += closes[j];
    out.push(sum / period);
  }
  return out;
}

export default function Chart({
  data,
  maLength,
  onLoadMore,
  onLoadNewer,
  loadingMore,
  hasMoreOlder = true,
}: {
  data: CandleRow[];
  maLength: number;
  onLoadMore?: (before: string) => void;
  onLoadNewer?: (after: string) => void;
  loadingMore?: boolean;
  hasMoreOlder?: boolean;
}) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<IChartApi | null>(null);
  const candleSeries = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const maSeries = useRef<ISeriesApi<'Line'> | null>(null);
  const volSeries = useRef<ISeriesApi<'Histogram'> | null>(null);
  const loadMoreRequested = useRef<string | null>(null);
  const initialFitDone = useRef(false);
  const prevDataLength = useRef(0);
  const lastLoadWasPrepend = useRef(false);
  const lastLoadMoreTime = useRef(0);
  const LOAD_MORE_COOLDOWN_MS = 1500;

  useEffect(() => {
    if (!chartRef.current || !data.length) return;

    const create = () => {
      const chart = createChart(chartRef.current!, {
        layout: { background: { type: ColorType.Solid, color: '#0d0d0d' }, textColor: '#888' },
        grid: { vertLines: { color: '#1a1a1a' }, horzLines: { color: '#1a1a1a' } },
        rightPriceScale: { borderColor: '#2a2a2a', scaleMargins: { top: 0.1, bottom: 0.2 }, ticksVisible: true },
        timeScale: { borderColor: '#2a2a2a', timeVisible: true, secondsVisible: false, ticksVisible: true },
        crosshair: { vertLine: { labelBackgroundColor: '#3b82f6' }, horzLine: { labelBackgroundColor: '#3b82f6' } },
        handleScroll: { vertTouchDrag: false },
      });
      const candlestickSeries = chart.addCandlestickSeries({
        upColor: '#22c55e', downColor: '#ef4444', borderVisible: false,
        wickUpColor: '#22c55e', wickDownColor: '#ef4444',
      });
      const volumeSeries = chart.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: '' });
      volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.75, bottom: 0 }, borderVisible: false });
      chartInstance.current = chart;
      candleSeries.current = candlestickSeries;
      maSeries.current = chart.addLineSeries({ color: '#f59e0b', lineWidth: 2, priceLineVisible: false, lastValueVisible: true });
      volSeries.current = volumeSeries;
    };

    if (!chartInstance.current) create();

    const chart = chartInstance.current!;
    const preserveRange = chart.timeScale().getVisibleLogicalRange();
    const prevLen = prevDataLength.current;
    const added = data.length - prevLen;

    const candles: CandlestickData[] = data.map((r) => ({
      time: toTime(r.ts), open: Number(r.o), high: Number(r.h), low: Number(r.l), close: Number(r.c),
    }));
    candleSeries.current!.setData(candles);
    const closes = data.map((r) => Number(r.c));
    const maValues = computeMA(closes, Math.max(1, maLength));
    const maData: LineData[] = data
      .map((r, i) => (Number.isFinite(maValues[i]) ? { time: toTime(r.ts), value: maValues[i] } : null))
      .filter(Boolean) as LineData[];
    maSeries.current!.setData(maData);
    const volumeData: HistogramData[] = data.map((r) => ({
      time: toTime(r.ts),
      value: Number(r.v),
      color: Number(r.c) >= Number(r.o) ? 'rgba(34, 197, 94, 0.4)' : 'rgba(239, 68, 68, 0.4)',
    }));
    volSeries.current!.setData(volumeData);

    const rangeToApply =
      lastLoadWasPrepend.current && added > 0
        ? { from: 0, to: Math.min(80, data.length - 1) }
        : preserveRange;
    lastLoadWasPrepend.current = false;

    if (rangeToApply) {
      requestAnimationFrame(() => {
        if (chartInstance.current) chartInstance.current.timeScale().setVisibleLogicalRange(rangeToApply);
      });
    }

    prevDataLength.current = data.length;

    if (!initialFitDone.current) {
      chartInstance.current!.timeScale().fitContent();
      initialFitDone.current = true;
    }

    if (onLoadMore && hasMoreOlder && data.length > 0) {
      const oldestTs = data[0].ts;
      const handler = (range: { from: number; to: number } | null) => {
        if (!range || loadingMore) return;
        const atLeft = range.from < 30;
        const cooldownOk = Date.now() - lastLoadMoreTime.current > LOAD_MORE_COOLDOWN_MS;
        const notSameRequest = loadMoreRequested.current !== oldestTs;
        if (atLeft && cooldownOk && notSameRequest) {
          lastLoadMoreTime.current = Date.now();
          loadMoreRequested.current = oldestTs;
          lastLoadWasPrepend.current = true;
          onLoadMore(oldestTs);
        }
      };
      const t = setTimeout(() => {
        chart.timeScale().subscribeVisibleLogicalRangeChange(handler);
      }, 300);
      return () => {
        clearTimeout(t);
        try { chart.timeScale().unsubscribeVisibleLogicalRangeChange(handler); } catch (_) {}
        loadMoreRequested.current = null;
      };
    }
  }, [data, maLength, data.length, onLoadMore, loadingMore, hasMoreOlder]);

  useEffect(() => {
    if (data.length) loadMoreRequested.current = null;
  }, [data.length]);

  useEffect(() => {
    return () => {
      initialFitDone.current = false;
      if (chartInstance.current && chartRef.current) {
        chartInstance.current.remove();
        chartInstance.current = null;
        candleSeries.current = null;
        maSeries.current = null;
        volSeries.current = null;
      }
    };
  }, []);

  const scrollToLatest = () => {
    if (!chartInstance.current || !data.length) return;
    const n = data.length;
    const visibleBars = 80;
    chartInstance.current.timeScale().setVisibleLogicalRange({
      from: Math.max(0, n - visibleBars),
      to: n - 1,
    });
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={chartRef} style={{ width: '100%', height: '100%' }} />
      <button
        type="button"
        onClick={scrollToLatest}
        className="chart-scroll-latest"
        title="Scroll to latest"
      >
        Latest
      </button>
    </div>
  );
}
