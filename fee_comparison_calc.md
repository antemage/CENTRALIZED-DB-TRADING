# Fee Comparison: Per-Lot vs Portfolio-Level (20% Performance Fee)

**Client A:** $20,000 total → $10,000 USD strategy + $10,000 BTC strategy

---

## 1. Share assignment (Shares = Investment ÷ NAV at entry)

### USD strategy (Final NAV = 1.4)

| Lot | Investment | NAV at entry | Shares        | Value at final NAV (1.4) | Profit   |
|-----|------------|--------------|---------------|---------------------------|----------|
| 1   | 2,500      | 1.0          | 2,500/1.0 = **2,500.00**   | 2,500 × 1.4 = 3,500.00   | 1,000.00 |
| 2   | 2,500      | 1.1          | 2,500/1.1 = **2,272.73**   | 2,272.73 × 1.4 = 3,181.82 | 681.82  |
| 3   | 2,500      | 1.2          | 2,500/1.2 = **2,083.33**   | 2,083.33 × 1.4 = 2,916.67 | 416.67  |
| 4   | 2,500      | 1.3          | 2,500/1.3 = **1,923.08**   | 1,923.08 × 1.4 = 2,692.31 | 192.31  |
| **Total** | **10,000** | —            | **8,779.14**  | **12,290.80**             | **2,290.80** |

### BTC strategy (Final NAV = 1.4)  
*(Assuming "00.5" = 0.5 and "NV" = NAV)*

| Lot | Investment | NAV at entry | Shares        | Value at final NAV (1.4) | Profit   |
|-----|------------|--------------|---------------|---------------------------|----------|
| 1   | 2,500      | 1.0          | 2,500/1.0 = **2,500.00**   | 3,500.00   | 1,000.00 |
| 2   | 2,500      | 0.7          | 2,500/0.7 = **3,571.43**   | 5,000.00   | 2,500.00 |
| 3   | 2,500      | 0.5          | 2,500/0.5 = **5,000.00**   | 7,000.00   | 4,500.00 |
| 4   | 2,500      | 1.2          | 2,500/1.2 = **2,083.33**   | 2,916.67   | 416.67  |
| **Total** | **10,000** | —            | **13,154.76**  | **18,416.67**             | **8,416.67** |

---

## 2. Portfolio totals (before fees)

| Strategy | Total invested | Total value at final NAV | Total profit |
|----------|----------------|---------------------------|--------------|
| USD      | 10,000         | 12,290.80                 | 2,290.80     |
| BTC      | 10,000         | 18,416.67                 | 8,416.67     |
| **Whole portfolio** | **20,000** | **30,707.47**        | **10,707.47** |

---

## 3. Option A: 20% performance fee on EACH LOT

Performance fee = 20% × profit (per lot). Only charged on **positive** profit.

### USD strategy – per-lot fees

| Lot | Profit   | Fee (20%) |
|-----|----------|-----------|
| 1   | 1,000.00 | 200.00    |
| 2   | 681.82   | 136.36    |
| 3   | 416.67   | 83.33     |
| 4   | 192.31   | 38.46     |
| **USD total fee** | — | **458.16** |

### BTC strategy – per-lot fees

| Lot | Profit   | Fee (20%) |
|-----|----------|-----------|
| 1   | 1,000.00 | 200.00    |
| 2   | 2,500.00 | 500.00    |
| 3   | 4,500.00 | 900.00    |
| 4   | 416.67   | 83.33     |
| **BTC total fee** | — | **1,683.33** |

### Option A totals

| Item                    | Amount     |
|-------------------------|------------|
| Total fee (all lots)    | **2,141.49** |
| Client keeps (value − fee) | 30,707.47 − 2,141.49 = **28,565.98** |
| Client net profit       | 28,565.98 − 20,000 = **8,565.98** |

---

## 4. Option B: 20% performance fee on ENTIRE PORTFOLIO

One fee on total profit across all lots (USD + BTC).

| Item              | Amount       |
|-------------------|--------------|
| Total portfolio profit | 10,707.47 |
| Fee (20%)         | **2,141.49** |
| Client keeps      | 30,707.47 − 2,141.49 = **28,565.98** |
| Client net profit | **8,565.98** |

---

## 5. Comparison

| Metric              | Per-lot (Option A) | Portfolio (Option B) |
|---------------------|--------------------|-----------------------|
| Total fee charged   | 2,141.49           | 2,141.49              |
| Client net profit   | 8,565.98           | 8,565.98              |

**Conclusion:** For this client and these numbers, **there is no difference** between:
- 20% performance fee on each lot, and  
- 20% performance fee on the entire portfolio.

Reason: the performance fee is **linear** in profit (20% of profit). So:
- Per-lot: sum of (0.20 × profit_lot) = 0.20 × sum(profit_lot) = 0.20 × total profit  
- Portfolio: 0.20 × total profit  

So the total fee is the same whenever you charge 20% on every dollar of profit, whether you slice by lot or by portfolio.

They would only differ if:
- Some lots had **negative** profit (loss): per-lot would charge 0 on those; portfolio would still be 20% of total profit, so total fee could differ.
- The **fee rate** differed by lot or by strategy (e.g. 20% on USD, 25% on BTC).
- There was a **high-water mark** or **hurdle** applied per lot vs at portfolio level.

---

## 6. Summary table (client view)

|                        | Amount      |
|------------------------|-------------|
| Total invested         | 20,000.00   |
| Total value (final NAV)| 30,707.47   |
| Gross profit           | 10,707.47   |
| Performance fee (20%)  | 2,141.49    |
| **Net to client**      | **28,565.98** |
| **Net profit**         | **8,565.98** |

---

# Same strategy with Final NAV = 1

Same client, same lots and shares; only **Final NAV = 1** (instead of 1.4).  
Profit per lot = (Shares × 1) − Investment. Fee only on **positive** profit per lot.

---

## 1. Values and profit per lot at Final NAV = 1

### USD strategy (Final NAV = 1)

| Lot | Investment | NAV at entry | Shares   | Value @ 1 | Profit    |
|-----|------------|--------------|----------|-----------|-----------|
| 1   | 2,500      | 1.0          | 2,500.00 | 2,500.00  | 0.00      |
| 2   | 2,500      | 1.1          | 2,272.73 | 2,272.73  | **−227.27** |
| 3   | 2,500      | 1.2          | 2,083.33 | 2,083.33  | **−416.67** |
| 4   | 2,500      | 1.3          | 1,923.08 | 1,923.08  | **−576.92** |
| **Total** | **10,000** | —         | **8,779.14** | **8,779.14** | **−2,220.86** |

### BTC strategy (Final NAV = 1)

| Lot | Investment | NAV at entry | Shares   | Value @ 1 | Profit    |
|-----|------------|--------------|----------|-----------|-----------|
| 1   | 2,500      | 1.0          | 2,500.00 | 2,500.00  | 0.00      |
| 2   | 2,500      | 0.7          | 3,571.43 | 3,571.43  | 1,071.43  |
| 3   | 2,500      | 0.5          | 5,000.00 | 5,000.00  | 2,500.00  |
| 4   | 2,500      | 1.2          | 2,083.33 | 2,083.33  | **−416.67** |
| **Total** | **10,000** | —         | **13,154.76** | **13,154.76** | **3,154.76** |

### Portfolio totals (before fees)

| Strategy | Total invested | Total value @ NAV 1 | Total profit  |
|----------|----------------|----------------------|---------------|
| USD      | 10,000         | 8,779.14             | −2,220.86     |
| BTC      | 10,000         | 13,154.76            | 3,154.76      |
| **Portfolio** | **20,000**  | **21,933.90**        | **1,933.90**  |

---

## 2. Option A: 20% performance fee on EACH LOT

Only **positive** profit per lot is feeable (no fee on loss).

### USD – per-lot fees

| Lot | Profit    | Fee (20%) |
|-----|-----------|-----------|
| 1   | 0.00      | 0.00      |
| 2   | −227.27   | 0.00      |
| 3   | −416.67   | 0.00      |
| 4   | −576.92   | 0.00      |
| **USD total fee** | — | **0.00** |

### BTC – per-lot fees

| Lot | Profit    | Fee (20%) |
|-----|-----------|-----------|
| 1   | 0.00      | 0.00      |
| 2   | 1,071.43  | 214.29    |
| 3   | 2,500.00  | 500.00    |
| 4   | −416.67   | 0.00      |
| **BTC total fee** | — | **714.29** |

### Option A totals (Final NAV = 1)

| Item                 | Amount      |
|----------------------|-------------|
| **Total fee (per-lot)** | **714.29** |
| Client keeps         | 21,933.90 − 714.29 = **21,219.61** |
| Client net profit    | 21,219.61 − 20,000 = **1,219.61** |

---

## 3. Option B: 20% performance fee on ENTIRE PORTFOLIO

One fee on **total** portfolio profit.

| Item                      | Amount      |
|---------------------------|-------------|
| Total portfolio profit    | 1,933.90    |
| Fee (20%)                 | **386.78**  |
| Client keeps              | 21,933.90 − 386.78 = **21,547.12** |
| Client net profit         | **1,547.12** |

---

## 4. Comparison at Final NAV = 1

| Metric              | Per-lot (Option A) | Portfolio (Option B) |
|---------------------|--------------------|------------------------|
| Total fee charged   | **714.29**         | **386.78**             |
| Client keeps       | 21,219.61          | 21,547.12              |
| Client net profit  | **1,219.61**       | **1,547.12**           |

**Conclusion at Final NAV = 1:** The two methods **do differ**.

- **Per-lot:** You take 20% of each **winning** lot only; losing lots pay no fee. So you charge 20% on 1,071.43 + 2,500 = 3,571.43 → **714.29**.
- **Portfolio:** You take 20% of **net** profit (wins minus losses): 20% × 1,933.90 = **386.78**.

So with Final NAV = 1, **per-lot fees are higher** (714.29 vs 386.78), and the client keeps **less** under per-lot (1,219.61 vs 1,547.12).  
In general: when some lots are in loss, **per-lot** charges more than **portfolio** (assuming fee only on positive profit per lot).
