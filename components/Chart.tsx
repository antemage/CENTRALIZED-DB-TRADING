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
  const loadNewerRequested = useRef<string | null>(null);
  const initialFitDone = useRef(false);

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

    if (preserveRange) chart.timeScale().setVisibleLogicalRange(preserveRange);

    if (!initialFitDone.current) {
      chartInstance.current!.timeScale().fitContent();
      initialFitDone.current = true;
    }

    if ((onLoadMore || onLoadNewer) && data.length > 0) {
      const oldestTs = data[0].ts;
      const latestTs = data[data.length - 1].ts;
      const chart = chartInstance.current!;
      const handler = (range: { from: number; to: number } | null) => {
        if (!range || loadingMore) return;
        if (onLoadMore && hasMoreOlder && loadMoreRequested.current !== oldestTs && range.from < 30) {
          loadMoreRequested.current = oldestTs;
          onLoadMore(oldestTs);
        }
        if (onLoadNewer && loadNewerRequested.current !== latestTs && range.to > data.length - 30) {
          loadNewerRequested.current = latestTs;
          onLoadNewer(latestTs);
        }
      };
      let subscribed = false;
      const timer = setTimeout(() => {
        chart.timeScale().subscribeVisibleLogicalRangeChange(handler);
        subscribed = true;
      }, 500);
      return () => {
        clearTimeout(timer);
        if (subscribed) {
          try { chart.timeScale().unsubscribeVisibleLogicalRangeChange(handler); } catch (_) {}
        }
        loadMoreRequested.current = null;
        loadNewerRequested.current = null;
      };
    }
  }, [data, maLength, data.length, onLoadMore, onLoadNewer, loadingMore, hasMoreOlder]);

  useEffect(() => {
    if (data.length) {
      loadMoreRequested.current = null;
      loadNewerRequested.current = null;
    }
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

  return <div ref={chartRef} style={{ width: '100%', height: '100%' }} />;
}
