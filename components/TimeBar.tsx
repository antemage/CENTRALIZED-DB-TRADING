'use client';

import { useState, useEffect } from 'react';

/** Bar start ts (string) → display as close time (bar end) in given TZ. E.g. 18:45 bar → 19:00 */
function formatCloseTime(barStartTs: string, interval: string, tz: 'UTC' | 'IST') {
  const d = new Date(barStartTs);
  const addMs = interval === '15m' ? 15 * 60 * 1000 : 60 * 60 * 1000;
  const closeDate = new Date(d.getTime() + addMs);
  if (tz === 'IST') {
    return closeDate.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  }
  return closeDate.toLocaleString('en-GB', { timeZone: 'UTC', hour12: false, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function nextCloseMs(interval: string): number | null {
  const now = Date.now();
  const ms = interval === '15m' ? 15 * 60 * 1000 : 60 * 60 * 1000;
  const next = Math.ceil(now / ms) * ms;
  return next - now;
}

export default function TimeBar({
  lastCandleTs,
  interval,
  tz,
  onTzChange,
}: {
  lastCandleTs: string | null;
  interval: string;
  tz: 'UTC' | 'IST';
  onTzChange: (tz: 'UTC' | 'IST') => void;
}) {
  const [countdown, setCountdown] = useState<string>('--');
  const [now, setNow] = useState<string>('');

  useEffect(() => {
    const tick = () => {
      const ms = nextCloseMs(interval);
      if (ms == null) { setCountdown('--'); return; }
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
    <div className="time-bar">
      <span className="time-bar-item">Last candle: {lastCandleTs ? formatCloseTime(lastCandleTs, interval, tz) : '--'}</span>
      <span className="time-bar-item">Next close: {countdown}</span>
      <span className="time-bar-item">Current: {now}</span>
      <div className="time-bar-tz">
        <button type="button" className={tz === 'UTC' ? 'active' : ''} onClick={() => onTzChange('UTC')}>UTC</button>
        <button type="button" className={tz === 'IST' ? 'active' : ''} onClick={() => onTzChange('IST')}>IST</button>
      </div>
    </div>
  );
}
