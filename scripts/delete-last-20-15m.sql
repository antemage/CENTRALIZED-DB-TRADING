-- Delete the last 20 fifteen-minute candles for every symbol.
-- Run in Supabase SQL Editor.

DELETE FROM candles
WHERE interval = '15m'
  AND (symbol, ts) IN (
    SELECT symbol, ts
    FROM (
      SELECT symbol, ts,
             ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY ts DESC) AS rn
      FROM candles
      WHERE interval = '15m'
    ) sub
    WHERE rn <= 20
  );
