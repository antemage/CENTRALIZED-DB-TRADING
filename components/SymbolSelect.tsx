'use client';

import { useState, useRef, useEffect } from 'react';

const STARS_KEY = 'hl-chart-stars';

function getStars(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STARS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function setStars(symbols: string[]) {
  try { localStorage.setItem(STARS_KEY, JSON.stringify(symbols)); } catch (_) {}
}

const SORT_OPTIONS = ['24h', '1h', '15m', 'off'] as const;

export default function SymbolSelect({
  symbols,
  selected,
  onSelect,
  prices,
  returns,
  performance,
  disabled,
  sortBy = '24h',
  order = 'desc',
  benchmark = 'USDT',
  onSortByChange,
  onOrderChange,
  onBenchmarkChange,
}: {
  symbols: string[];
  selected: string;
  onSelect: (s: string) => void;
  prices?: Record<string, { close: number; change24h?: number }>;
  returns?: Record<string, number>;
  performance?: string | null;
  disabled?: boolean;
  sortBy?: '24h' | '1h' | '15m' | 'off';
  order?: 'desc' | 'asc';
  benchmark?: 'USDT' | 'BTC';
  onSortByChange?: (v: '24h' | '1h' | '15m' | 'off') => void;
  onOrderChange?: () => void;
  onBenchmarkChange?: (v: 'USDT' | 'BTC') => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [stars, setStarsState] = useState<string[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setStarsState(getStars());
  }, []);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      const el = containerRef.current;
      const toolbar = document.querySelector('.toolbar');
      if (el?.contains(e.target as Node) || toolbar?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [open]);

  const toggleStar = (sym: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = stars.includes(sym) ? stars.filter((s) => s !== sym) : [...stars, sym];
    setStarsState(next);
    setStars(next);
  };

  const filtered = symbols.filter((s) => s.toLowerCase().includes(search.toLowerCase().trim()));
  const hasReturnSort = performance && returns && Object.keys(returns).length > 0;
  const ordered = [...filtered].sort((a, b) => {
    const aStar = stars.includes(a) ? 1 : 0;
    const bStar = stars.includes(b) ? 1 : 0;
    if (aStar !== bStar) return bStar - aStar;
    if (hasReturnSort) return symbols.indexOf(a) - symbols.indexOf(b);
    return a.localeCompare(b);
  });

  const price = selected ? prices?.[selected] : undefined;
  const ret = selected ? returns?.[selected] : undefined;
  const displayPct = performance && ret != null ? ret : (price && typeof price === 'object' ? price.change24h : undefined);
  const pctNum = typeof displayPct === 'number' ? displayPct : Number(displayPct);

  return (
    <div className="symbol-select" ref={containerRef}>
      <button
        type="button"
        className="symbol-trigger"
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
      >
        {selected || 'Select symbol'}
        {displayPct != null && !Number.isNaN(pctNum) && (
          <span style={{ marginLeft: 6, color: pctNum >= 0 ? 'var(--green)' : 'var(--red)' }}>
            {pctNum >= 0 ? '+' : ''}{pctNum.toFixed(2)}%
          </span>
        )}
      </button>
      {open && (
        <div className="symbol-dropdown">
          <div className="symbol-dropdown-filters" onClick={(e) => e.stopPropagation()}>
            <div className="filter-period-row">
              <label>Sort</label>
              <select
                value={sortBy}
                onChange={(e) => onSortByChange?.(e.target.value as '24h' | '1h' | '15m' | 'off')}
              >
                {SORT_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s === 'off' ? 'Off' : s}</option>
                ))}
              </select>
              <button
                type="button"
                className="filter-caret"
                onClick={() => onOrderChange?.()}
                title={order === 'desc' ? 'Descending (click for ascending)' : 'Ascending (click for descending)'}
                aria-label="Toggle sort order"
              >
                {order === 'desc' ? '▾' : '▴'}
              </button>
            </div>
            {sortBy !== 'off' && (
              <>
                <label>Benchmark</label>
                <select
                  value={benchmark}
                  onChange={(e) => onBenchmarkChange?.(e.target.value as 'USDT' | 'BTC')}
                >
                  <option value="USDT">USDT</option>
                  <option value="BTC">BTC</option>
                </select>
              </>
            )}
          </div>
          <input
            type="text"
            className="symbol-search"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
          <ul className="symbol-list">
            {ordered.map((sym) => (
              <li
                key={sym}
                className={selected === sym ? 'selected' : ''}
                onClick={() => { onSelect(sym); setOpen(false); }}
              >
                <button
                  type="button"
                  className={`star-btn ${stars.includes(sym) ? 'starred' : ''}`}
                  onClick={(e) => toggleStar(sym, e)}
                  aria-label={stars.includes(sym) ? 'Unstar' : 'Star'}
                >
                  {stars.includes(sym) ? '★' : '☆'}
                </button>
                <span className="symbol-label">{sym}</span>
                <span className="symbol-meta">
                  {prices?.[sym] != null && (
                    <span style={{ color: 'var(--muted)', fontSize: '0.85em', marginRight: 8 }}>
                      {Number(prices[sym].close).toFixed(4)}
                    </span>
                  )}
                  {returns?.[sym] != null && (
                    <span style={{ color: Number(returns[sym]) >= 0 ? 'var(--green)' : 'var(--red)', fontSize: '0.85em' }}>
                      {Number(returns[sym]) >= 0 ? '+' : ''}{Number(returns[sym]).toFixed(2)}%
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
