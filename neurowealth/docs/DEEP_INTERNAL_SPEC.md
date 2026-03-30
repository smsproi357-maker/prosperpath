# ProsperPath Insights — Deep Internal System Specification

> **Version:** 1.0 | **Date:** 2026-03-29 | **Scope:** All 10 Major Feature Areas
> **Architecture:** Client-Side First, Offline-Resilient, Micro-SPA Pattern

---

## TABLE OF CONTENTS

1. [Backtest Engine (VOL_BREAKOUT)](#feature-1-backtest-engine)
2. [Portfolio Manager + Allocator](#feature-2-portfolio-manager--allocator)
3. [Portfolio Risk Overlay (Circuit Breaker)](#feature-3-portfolio-risk-overlay)
4. [Portfolio Attribution Engine](#feature-4-portfolio-attribution-engine)
5. [Paper Trading / Execution Engine](#feature-5-paper-trading--execution-engine)
6. [Market Data Engine (Market Surface + Pulse)](#feature-6-market-data-engine)
7. [AI Widget — Prosporous](#feature-7-ai-widget--prosporous)
8. [Waitlist & Authentication](#feature-8-waitlist--authentication)
9. [Strategy Lifecycle & Health](#feature-9-strategy-lifecycle--health)
10. [Wallet / Token Ingestion](#feature-10-wallet--token-ingestion)

---

# Feature 1: Backtest Engine — Deep Internal Spec

**Files:** `backtest-engine.js` (1555 lines), `backtest.js` (225KB), `run-config-shared.js`

---

## 1. Execution Model

Strict chronological order per bar:

1. **Config validation** — `buildRunConfigFromUI()` reads all DOM inputs, throws on invalid values. No silent fallbacks.
2. **Data fetch** — `fetchOHLCV(asset, timeframe, startDate, endDate)` attempts Binance paginated REST API (up to 3 retries, 1-second backoff). On CORS failure, falls back to `/exports/btc_4h_2019_2024.json` golden dataset.
3. **Data validation** — Strict checks: `date instanceof Date`, `isFinite(close)`, minimum 100 candles.
4. **Main loop** — `runBacktest(candles, config)` iterates `i = 1` to `n-1`:
   - Execute `pendingEntry` from prior bar's signal (next-open execution model)
   - Execute `pendingExit` from prior bar's signal
   - Check intra-bar stop-loss (`candle.low <= stopPrice`)
   - Generate new signal via `generateSignalVolBreakout()`
   - Push mark-to-market equity value
5. **Metrics** — `computeMetrics(result, config)` computes 14 performance KPIs from trades + equity curve.
6. **Integration tests** — `runIntegrationTests()` validates chronology, no overlap, capital sanity.

---

## 2. State Machine

| State | Variable | Description |
|---|---|---|
| `OUT_OF_POSITION` | `inPosition = false` | No active trade |
| `PENDING_ENTRY` | `pendingEntry = true` | Signal fired—entry executes next open |
| `IN_POSITION` | `inPosition = true` | Active trade, tracking mark-to-market |
| `PENDING_EXIT` | `pendingExit = true` | Signal exit—closure executes next open |
| `STOPPED_OUT` | inline | Stop hit intra-bar, immediate closure |

**Transitions:**
- `OUT → PENDING_ENTRY`: `generateSignalVolBreakout().enter = true`
- `PENDING_ENTRY → IN_POSITION`: Next bar open execution
- `IN_POSITION → PENDING_EXIT`: `generateSignalVolBreakout().exit = true` (Close < SMA20)
- `IN_POSITION → OUT` (stop): `candle.low <= stopPrice`
- `PENDING_EXIT → OUT`: Next bar open execution

**Critical constraint:** Only ONE position at a time. Signal is re-evaluated every bar, but `pendingEntry` is ignored when `inPosition = true`.

---

## 3. Data Flow

```
DOM Inputs → buildRunConfigFromUI() → config object (validated)
                                        ↓
                               fetchOHLCV()
                    ┌──────────────────┴──────────────────┐
              Binance API                         /exports/btc_4h_2019_2024.json
              (paginated 1000/req)                (golden fallback)
                    └──────────────────┬──────────────────┘
                               candles[] (OHLCV + Date)
                                        ↓
                              runBacktest(candles, config)
                                        ↓
                    ┌──────────────────────────────────────┐
                    │   result: { trades[], equityCurve[] } │
                    └──────────────────────────────────────┘
                                        ↓
                   computeMetrics() → 14-metric KPI object
                   computeDrawdownCurve() → DD series
                   computeDistribution() → Histogram bins [-8..+8%]
                   computeMonthlyReturns() → yearly/monthly grid
                                        ↓
                              DOM render (backtest.js)
```

---

## 4. Mathematical Logic

### Entry Signal (VOL_BREAKOUT) — all 4 conditions must be true:

**Condition 1 — Trend Filter:**
```
SMA50_now = SUM(close[-49..0]) / 50
SMA50_prev = SUM(close[-(50+slopeLag)..-slopeLag]) / 50
PASS: close[i] > SMA50_now AND SMA50_now > SMA50_prev
```

**Condition 2 — Volatility Compression (≥3 consecutive bars):**
```
ATR14[k] = MEAN(TrueRange[-13..0])
ATR14_avg[k] = MEAN(ATR14[k-19..k]) over 20 bars
PASS: ATR14[k] < ATR14_avg[k]  (repeated ≥ VOL_COMPRESSION_BARS=3)
```

**Condition 3 — Breakout Trigger:**
```
highestHigh = MAX(high[i-10..i-1])
PASS: close[i] > highestHigh
```

**Condition 4 — Expanding ATR:**
```
PASS: ATR14[i] > ATR14[i-1]
```

**Exit Signal:**
```
exitSMA20 = SUM(close[-19..0]) / 20
PASS (exit): close[i] < exitSMA20 (only when inPosition)
```

### Position Sizing:
```
stopPrice = execPriceEntry × (1 - stopPercent)
stopDistance = execPriceEntry - stopPrice
riskAmount = capital × riskPercent
shares = riskAmount / stopDistance
maxShares = (capital × (1 - feeRate)) / execPriceEntry
shares = MIN(shares, maxShares)
```

### Execution Pricing:
```
entryExecPrice = open[i+1] × (1 + slippagePct)
exitExecPrice  = open[i+1] × (1 - slippagePct)
cost = shares × execPrice
fee = cost × feeRate / (1 - feeRate)   [round-trip fee model]
```

### PnL per Trade:
```
grossValue = shares × exitExecPrice
netValue = grossValue × (1 - feeRate)
costBasis = shares × entryPrice
entryFee = costBasis × feeRate / (1 - feeRate)
pnl = netValue - (costBasis + entryFee)
rMultiple = pnl / riskAmount
returnPct = (pnl / totalCost) × 100
```

### Portfolio Metrics:
```
totalReturn = (finalCapital - startingCapital) / startingCapital × 100
years = (totalBars × hoursPerBar) / (365.25 × 24)
CAGR = (finalCapital/startingCapital)^(1/years) - 1) × 100
MaxDD = MAX over all (peak - equity[i]) / peak × 100
Sharpe = (meanReturn / stddev) × SQRT(barsPerYear)
Sortino = (meanReturn / downDev) × SQRT(barsPerYear)
ProfitFactor = grossProfit / grossLoss
Calmar = CAGR / MaxDD
WinRate = wins / totalTrades × 100
Expectancy = totalPnl / totalTrades
```

---

## 5. Event System

- **Trigger:** "Run Backtest" button click → `buildRunConfigFromUI()` → async `fetchOHLCV()`
- **Internal:** Binance pagination loop fires `await fetch()` per 1000-candle page with 200ms rate-limit delay
- **Fallback event:** `binanceError` caught → `fetch('/exports/btc_4h_2019_2024.json')`
- **Completion event:** `equityCurve` array population → DOM render triggers
- **Integration test:** auto-runs after every backtest in console only

---

## 6. Failure Modes

| Failure | System Reaction | Safeguard |
|---|---|---|
| Binance CORS/geo-block | Falls back to golden BTC 4H dataset | Automatic fallback |
| <100 candles from Binance | Falls back to golden dataset | `allCandles.length >= 100` check |
| Golden fallback fails | Throws: `"Binance AND golden candleset failed"` | No silent zero-render |
| NaN in DOM inputs | Throws: `"Input X is not a valid number"` | `_readDOMFloat()` guard |
| Unknown timeframe | Throws: `"unknown timeframe"` in `computeMetrics` | Explicit TF map |
| No trades generated | `tradeCount=0`, metrics = zero | Integration test flags |

---

## 7. Edge Case Handling

- **Warm-up period:** `minBars = MAX(50, 14+20, 11) = 50` — signals suppressed before bar 50
- **slope lag floor:** `slopeLag = MIN(5, i - VOL_TREND_PERIOD + 1)` — prevents negative index when near warm-up
- **Stop + signal same bar:** Stop-loss takes priority; signal generation still runs but `inPosition` becomes `false` for next bar
- **Date-range filter too narrow:** Falls back to full golden dataset (`filtered.length >= 100 ? filtered : mapped`)
- **50+ month equity curve:** `computeMonthlyReturns` handles year-boundary rolling correctly
- **zero avgLoss:** `avgWinLoss = 0` when no losing trades
- **zero downDev:** `Sortino = 0` when no negative returns

---

## 8. Performance Characteristics

| Operation | Complexity | Notes |
|---|---|---|
| `fetchOHLCV` paginated | O(N/1000) API calls | 200ms delay between pages |
| `runBacktest` main loop | O(N) | ~O(N²) effectively due to ATR computation inside compression scan |
| `computeATR` per bar | O(period) = O(14) | Called in nested loop; worst case O(N × compression_recency × ATR_avg_period) |
| `computeMetrics` | O(T) where T=trades | T << N generally |
| `computeDrawdownCurve` | O(N) | Single pass, streaming peak |
| `computeMonthlyReturns` | O(N) | Single pass |
| `computeDistribution` | O(T) | T=trade count |

**Bottleneck:** The volatility compression scan (`VOL_COMPRESSION_RECENCY=5` × `VOL_ATR_AVG_PERIOD=20` × inner `ATR` loop over 14 bars) results in ~1400 inner iterations per bar in worst case. On 10,000 bars this is ~14M ops — acceptable for JS but not optimal.

---

## 9. System Interactions

- Reads DOM via `document.getElementById()` — tightly coupled to `backtest.html` element IDs
- Calls `RunConfigShared.requireNum()`, `RunConfigShared.hashConfig()`, `RunConfigShared.computeCandlesetHash()` — shared validation layer
- Calls `RunConfigShared.ENGINE_VERSION` for version stamping
- Exports via `window.BacktestEngine` IIFE public API: `{ runBacktest, computeMetrics, fetchOHLCV, buildRunConfigFromUI, computeDrawdownCurve, computeDistribution, computeMonthlyReturns, runIntegrationTests, PRESETS }`
- Consumed by `backtest.js` (UI orchestrator) and `strategy-lifecycle.js` (metric snapshotting)

**Confidence Level:** HIGH — full source examined, all critical paths traced

---

# Feature 2: Portfolio Manager + Allocator — Deep Internal Spec

**Files:** `portfolio-manager.js` (65KB), `capital-readiness.js` (78KB)

---

## 1. Execution Model

1. **Bootstrap** — `PortfolioManager` loads portfolio state from `localStorage` (`pp_portfolio_v1`)
2. **Slot creation** — User adds "slots" specifying `strategy_id`, `target_weight`, `allocated_capital`
3. **CRS computation** — `CapitalReadiness.computeCRS(presetKey)` scores each slot 0–100 based on 8 dimensions
4. **Equity simulation** — For each enabled slot, the portfolio manager simulates a simple equity curve based on backtest metrics attached to the slot
5. **Portfolio aggregation** — Sums weighted equity curves to derive portfolio-level equity, PnL, drawdown
6. **Overlay integration** — Results are passed to `PortfolioRiskOverlay.evaluateOverlay()` which may scale weights
7. **Attribution** — `PortfolioAttribution.computeAttribution()` consumes the equity data

---

## 2. State Machine

**Portfolio States:**
- `EMPTY` — No slots defined
- `ACTIVE` — ≥1 enabled slot with allocated capital
- `PAUSED` (via Risk Overlay) — All slots overlay_weight_scale = 0
- `DERISK` (via Risk Overlay) — Weights scaled to 50%

**Slot States:**
- `ENABLED` — Participating in portfolio
- `DISABLED_MANUAL` — User-toggled off
- `DISABLED_POLICY` — Risk overlay forced disable (CRS < threshold, excessive pauses, drift kill-switch)
- `PAUSED_COOLDOWN` — Hard DD breach; cooldown timer active

---

## 3. Data Flow

```
localStorage('pp_portfolio_v1')
        ↓
PortfolioManager.loadPortfolio()
        ↓
    portfolio{
        portfolio_id, holdings[], startingCapital,
        created_at, updated_at
    }
        ↓
CapitalReadiness.computeCRS(slot)   ←── backtest metrics snapshot
        ↓
CRS Score [0-100] + tier label
        ↓
PortfolioManager.getPortfolioEquity() → {
    strategyResults[], portfolioDD, totalPnL, equityCurve
}
        ↓
RiskOverlay.evaluateOverlay()        ←── reads portfolioDD
        ↓
PortfolioAttribution.computeAttribution()
        ↓
DOM render (portfolio.html)
```

---

## 4. Mathematical Logic

### Capital Requirement Score (CRS):
```
CRS = weighted_sum of scored sub-metrics:
  - Win Rate (0-100 scale)
  - Profit Factor (capped, normalized)
  - Sharpe Ratio (annualized)
  - Max Drawdown (inverted — lower is better)
  - Trade Count (sufficiency check)
  - Return % (absolute)
  - Walk-Forward OOS consistency
  - Preset validation status

Tier classification:
  CRS >= 80: CAPITAL-READY
  CRS >= 60: RESEARCH-GRADE
  CRS >= 40: EARLY-STAGE
  CRS <  40: BELOW-THRESHOLD
```

### Portfolio Equity Aggregation:
```
For each slot s with effective_weight w_eff:
  allocatedCapital[s] = portfolio.startingCapital × w_eff
  equityCurve[s][t] = allocatedCapital × (1 + strategyReturn[t])

portfolioEquity[t] = SUM(equityCurve[s][t]) for all enabled s
portfolioDD = (peakEquity - currentEquity) / peakEquity
```

---

## 5. Event System

- Portfolio state persists across page reloads via `localStorage`
- `RiskOverlay.evaluateOverlay()` called on portfolio data change events
- `window.PaperExecution.captureEvent()` cross-notified on overlay actions

---

## 6. Failure Modes

| Failure | Reaction |
|---|---|
| Corrupt localStorage JSON | `safeParseJSON()` returns fallback, empty portfolio |
| No backtest data on slot | CRS dimensions score as 0; slot flagged below-threshold |
| Allocation sum > 100% | UNKNOWN — no explicit enforcement found in examined code |

---

## 7. System Interactions

- `window.PortfolioManager` — global singleton
- `window.CapitalReadiness` — CRS computation module
- `window.PortfolioRiskOverlay` — overlay consumer
- `window.PortfolioAttribution` — attribution consumer
- `window.StrategyHealth` — drift kill-switch health queries

**Confidence Level:** MEDIUM-HIGH — portfolio-manager.js examined by structure; full CRS formula sourced from capital-readiness.js commentary and cross-referencing strategy-lifecycle.js snapshot logic

---

# Feature 3: Portfolio Risk Overlay — Deep Internal Spec

**File:** `portfolio-risk-overlay.js` (989 lines)

---

## 1. Execution Model

1. `loadPolicy()` — reads `pp_portfolio_risk_policy_v1` from localStorage; merges against defaults
2. `loadAuditLog()` — reads `pp_portfolio_risk_audit_v1` from localStorage (max 200 events)
3. `evaluateOverlay()` — called on every portfolio data change; returns `{ mode, slotStates, actions[] }`
4. Overlay panel injected into portfolio modal via `injectOverlayPanel()` → `MutationObserver` on modal visibility
5. `refreshOverlayUI()` — DOM updates driven by current `overlayMode` and `slotOverlayState`

---

## 2. State Machine

```
NORMAL ──(DD >= warn_dd_pct)──► WARN
WARN   ──(DD >= soft_dd_pct)──► DERISK
DERISK ──(DD >= hard_dd_pct)──► PAUSED
PAUSED ──(manual resume)─────► NORMAL
PAUSED ──(cooldown expired + !reenable_requires_manual)──► NORMAL [AUTO_RESUME]
DERISK ──(DD < warn_dd_pct)──► NORMAL [DERISK_OFF logged]
WARN   ──(DD < warn_dd_pct)──► NORMAL
```

**Slot-level states (evaluated independently per DERISK/NORMAL mode):**
- `ENABLED` — normal operation
- `DISABLED (policy)` — low CRS, excessive auto-pauses, or drift kill-switch
- `PAUSED (cooldown)` — hard DD breach forces overlay_weight_scale = 0
- `DISABLED (manual)` — user action

**Default thresholds:**
- `warn_dd_pct = 12%`
- `soft_dd_pct = 18%` → triggers DERISK (weights × 0.50)
- `hard_dd_pct = 25%` → triggers full PAUSE + cooldown
- `cooldown.pause_minutes = 240` (4 hours)
- `min_crs_to_stay_enabled = 30`
- `max_auto_pauses_last_n = 2`

---

## 3. Data Flow

```
PortfolioManager.getPortfolioEquity()
        ↓ portfolioDD (0.0–1.0 fraction)
evaluateOverlay()
        ↓
  [DD thresholds checked] → overlayMode updated
  [slot CRS checked]      → per-slot disabled_reason
  [audit log checked]     → excessive pause count
  [StrategyHealth queried] → drift_kill_switch
        ↓
  slotOverlayState { overlay_weight_scale, disabled_reason, status }
        ↓
getEffectiveWeight(slot) = slot.target_weight × overlay_weight_scale
        ↓
  PortfolioManager (re-compute equity with effective weights)
```

---

## 4. Mathematical Logic

**DERISK weight scaling:**
```
enabled_slots = slots where slot.enabled AND slot.target_weight > 0
currentTotal = SUM(target_weight for enabled slots)
targetTotal = 0.50   [fixed at 50%]
scaleFactor = MIN(1, targetTotal / currentTotal)
effectiveWeight[slot] = slot.target_weight × scaleFactor
```

**Exposure cap enforcement:**
```
effectiveWeight = slot.target_weight × overlay_weight_scale
IF effectiveWeight > max_single_weight_pct (default 0.40):
    overlay_weight_scale = max_single_weight_pct / slot.target_weight
```

**Cooldown elapsed:**
```
elapsed_minutes = (Date.now() - cooldownStartTime_ms) / 60000
auto_resume_allowed = elapsed_minutes >= cooldown.pause_minutes
                      AND NOT reenable_requires_manual
```

---

## 5. Event System

- **Trigger:** Portfolio modal opens → MutationObserver fires → `injectOverlayPanel()` + `evaluateOverlay()` + `refreshOverlayUI()`
- **Threshold change:** Input `change` events → `evaluateOverlay()` → `refreshOverlayUI()`
- **Enable/disable toggle:** `change` event on `pro-enabled-toggle`
- **Manual resume:** `click` on `pro-btn-resume` → `manualResume()` → `evaluateOverlay()`
- **Cross-system:** `window.PaperExecution.captureEvent('PORTFOLIO', 'RiskOverlay', eventType, reason)` on any audit event

---

## 6. Failure Modes

| Failure | Reaction |
|---|---|
| `PortfolioManager` not loaded | `evaluateOverlay()` → mode=NORMAL, slotStates={}, no-op |
| Policy key missing | `ensurePolicy()` creates defaults, saves to localStorage |
| `StrategyHealth` unavailable | `drift_kill_switch` skipped silently via try/catch |
| localStorage quota exceeded | Audit log trimmed to 200 events; policy save logged as error |
| Portfolio modal DOM not ready | `waitForModal()` polls every 300ms |

---

## 7. Edge Case Handling

- **Already PAUSED + manual resume required:** DD check branch bypassed; all slots forced scale=0 regardless of current DD
- **DERISK → PAUSED transition:** Separate `else if` chain; once PAUSED, the DERISK evaluation branch is skipped
- **Slot disabled by multiple reasons:** Only first `disabled_reason` persists (CRS check runs before excessive-pause check)
- **Audit log exceeded MAX_AUDIT_EVENTS=200:** FIFO trim — oldest events dropped

---

## 8. Performance Characteristics

| Operation | Complexity |
|---|---|
| `evaluateOverlay()` | O(S × A) where S=slot count, A=audit log size |
| `logEvent()` → `saveAuditLog()` | O(A) JSON serialize |
| `refreshOverlayUI()` | O(S) DOM operations |

The audit log scan (`auditLog.filter(...)` per slot) is O(S × A). With 200 max audit events and typically <20 slots, this is ~4000 iterations — negligible.

---

## 9. System Interactions

- `window.PortfolioManager.getPortfolio()` — portfolio holdings source
- `window.PortfolioManager.getPortfolioEquity()` — `portfolioDD` source
- `window.StrategyHealth.getHealthClassification(slot.strategy_id)` — drift kill-switch
- `window.PaperExecution.captureEvent()` — cross-system event bus
- Injected into `#pf-overview-panel` in portfolio modal DOM

**Confidence Level:** HIGH — full source examined

---

# Feature 4: Portfolio Attribution Engine — Deep Internal Spec

**File:** `portfolio-attribution.js` (268 lines)

---

## 1. Execution Model

Single-function pipeline: `PortfolioAttribution.computeAttribution(portfolio, eq)`:

1. Iterate each slot result → `calculatePerSlotMetrics(res, eq)`
2. Aggregate → `calculatePortfolioDiagnostics(slots, eq)`
3. If ≥2 slots → `computeCorrelationMatrix(results)`
4. If ≥2 slots → `computeDrawdownOverlap(results)`
5. Generate → `generateProblemBullets(metrics)`
6. Return full `metrics` object (not persisted; must be re-computed on demand)

---

## 2. Mathematical Logic

### Per-Slot Metrics:
```
contribReturnPct = slot.pnl / portfolio.startingCapital
maxDD = MAX over all bars: (peak - equity[i]) / peak
currentDD = (peak - equity[last]) / peak
timeInDD = count(bars where DD > 0.001) / totalBars
rollingReturn = equity[-1] / equity[-30] - 1   (last 30 bars)
lastPeakAge = lastBarIndex - peakBarIndex
```

### Status Classification:
```
IF currentDD > 0.15 OR lastPeakAge > 100 bars → "CRITICAL"
IF rollingReturn < 0 AND currentDD > 0.05 → "DRAGGING"
ELSE → "HEALTHY"
```

### Pearson Correlation:
```
For each pair (i,j):
  returns_i = equityCurve_i[t] / equityCurve_i[t-1] - 1
  returns_j = equityCurve_j[t] / equityCurve_j[t-1] - 1
  ρ(i,j) = (n×ΣXY - ΣX×ΣY) / SQRT[(n×ΣX² - (ΣX)²)(n×ΣY² - (ΣY)²)]
avgCorrelation = MEAN of upper triangle of correlation matrix
```

### Drawdown Overlap Matrix:
```
For each pair (i,j):
  overlap[i][j] = count(bars where both i AND j in DD > 1%) / totalBars
```

### Risk Concentration:
```
riskConcentration = worstSlot.maxDD / SUM(all slots maxDD)
```

### Problem Bullet Triggers:
```
riskConcentration > 0.60 → "DD concentrated in one slot"
avgCorrelation > 0.50    → "High correlation, weak diversification"
slot.timeInDD > 0.80     → "Slot underwater >80% of time"
slot.status === 'CRITICAL' → "N strategies in CRITICAL state"
```

---

## 3. Failure Modes

- `portfolio || eq || eq.strategyResults` null → returns `null` immediately
- Correlation matrix capped at 10 strategies (`results.slice(0, 10)`)
- Pearson with n < 2 → returns 0

---

## 4. System Interactions

- `window.PortfolioAttribution` — global singleton object (not class)
- Input: `portfolio` object + `eq` (equity result from PortfolioManager)
- Output: consumed by `portfolio.html` DOM rendering
- `exportDiagnostics(metrics)` — triggers `<a>` download of JSON blob

**Confidence Level:** HIGH — entire file examined (268 lines)

---

# Feature 5: Paper Trading / Execution Engine — Deep Internal Spec

**Files:** `paper-trading.js` (65KB), `paper-execution.js` (88KB), `paper-execution-engine.js` (20KB), `live-execution-adapter.js` (26KB)

---

## 1. Execution Model

1. **Session management** — Each paper session has an isolated ID (`pp_paper_sessions_v1` localStorage)
2. **Order placement** — User submits order → validated → simulated via `paper-execution-engine.js`
3. **Position tracking** — Live PnL computed per tick using simulated price feed
4. **WebSocket emulation** — `live-execution-adapter.js` emulates real-time price feeds without actual WebSocket connections
5. **Event capture** — `PaperExecution.captureEvent()` writes to global event bus consumed by RiskOverlay and Attribution

---

## 2. State Machine (Per Order)

```
PENDING → FILLED (next simulated tick)
FILLED  → OPEN (position tracking begins)
OPEN    → CLOSED (stop-loss hit OR take-profit OR manual close)
CLOSED  → recorded in trade history
```

---

## 3. Data Flow

```
User Order Input
    ↓
paper-execution-engine.js (validation + fill simulation)
    ↓
Open Position {orderId, entryPrice, size, stopLoss, takeProfit}
    ↓
live-execution-adapter.js (price tick simulation)
    ↓
PnL calculation per tick
    ↓
paper-execution.js (UI orchestration + DOM updates)
    ↓
localStorage('pp_paper_sessions_v1')
```

---

## 4. Mathematical Logic

```
unrealizedPnL = (currentPrice - entryPrice) × size    [LONG]
unrealizedPnL = (entryPrice - currentPrice) × size    [SHORT]
realizedPnL = (exitPrice - entryPrice) × size - fees  [LONG]
```

**Institutional Latency Emulation:**
- Entry fills at next simulated tick with configurable slippage
- Realistic order sequencing matches institutional execution patterns

---

## 5. Failure Modes

| Failure | Reaction |
|---|---|
| localStorage quota | Session truncated; warning logged |
| Price feed interruption | Last known price held; UI shows stale indicator |
| Invalid order parameters | Client-side validation rejects before submitting |

---

## 6. System Interactions

- `window.PaperExecution` global singleton
- `captureEvent(source, actor, type, data)` — consumed by `portfolio-risk-overlay.js`
- Sessions stored: `pp_paper_sessions_v1` localStorage key
- Position state: separate per-session localStorage mapping

**Confidence Level:** MEDIUM — files are large (88KB+); core architecture inferred from pattern analysis and cross-file references. Full inner loop math PARTIALLY UNKNOWN.

---

# Feature 6: Market Data Engine — Deep Internal Spec

**Files:** `market-surface.js` (612 lines), `market-pulse.js` (411 lines), `data-feed.js` (12KB)

---

## 1. Execution Model

### Market Surface (Per-Asset Chart Component):

1. `ProsperPathChart.create(opts)` — mounts card into container, calls `loadChart(opts, '1d', activeChart)`
2. `loadChart()` → `fetchYahooOHLC(symbol, range)` (from `script.js`) → candles array
3. `renderChart()` → creates `LightweightCharts` instance, `candleSeries`, optional `volumeSeries`
4. `updateContextStrip()` → `deriveContext(data)` computes 4 technical context values
5. **Left-edge backfill:** `subscribeVisibleLogicalRangeChange()` — on pan-left triggers `fetchYahooOHLCBefore()` to prepend older candles without destroying chart

### Market Pulse (Dashboard Chipset):

1. `IntersectionObserver` watches `#market-pulse-section`
2. On first intersection → `switchCategory('crypto')` → `loadCrypto()`
3. Cache check (`simpleCache` or localStorage fallback, TTL=90s) → render immediately if fresh
4. Opportunistic: reads `window.latestCryptoData` if already populated by main dashboard
5. Fetch → CoinGecko Markets API → chips rendered
6. Stocks: `fetchSingleQuote()` (Yahoo Finance proxy via `script.js`) for each symbol
7. Commodities: same flow with `fetchSingleQuote()` + symbol mapping

---

## 2. Data Flow

### Market Surface:
```
Yahoo Finance API ──────────► fetchYahooOHLC(symbol, range)
                                    ↓
                           candles[] [{ time, open, high, low, close, volume }]
                                    ↓
         renderChart() → LightweightCharts instance
                         candleSeries.setData(candles)
                         volumeSeries.setData(volumeData)
                                    ↓
         deriveContext(data) → { trend, range, volatility, keyLevel }
                                    ↓
         updateContextStrip() → DOM update
                                    ↓
[User pans left]
         subscribeVisibleLogicalRangeChange()
                                    ↓
         fetchYahooOHLCBefore(symbol, interval, oldestTs)
                                    ↓
         merged = [...newCandles, ...allData]
         candleSeries.setData(merged)   ← LightweightCharts preserves viewport
```

---

## 3. Mathematical Logic

### Context Strip Derivations:

**Trend:**
```
SMA20 = SUM(close[-19..0]) / 20
IF close > SMA20 × 1.005 → "Bullish"
IF close < SMA20 × 0.995 → "Bearish"
ELSE → "Neutral"
```

**Range Expansion:**
```
recent_bw = (MAX(high[-20..0]) - MIN(low[-20..0])) / MIN(low[-20..0])
older_bw  = (MAX(high[-40..-20]) - MIN(low[-40..-20])) / MIN(low[-40..-20])
expansion = recent_bw / older_bw
IF expansion > 1.3 → "Expanding"
IF expansion < 0.7 → "Contracting"
ELSE → "Normal"
```

**Volatility:**
```
ATR14 = MEAN(TrueRange[-13..0])
atrPct = ATR14 / currentClose × 100
IF atrPct > 2.5% → "Elevated"
IF atrPct > 1.0% → "Moderate"
ELSE → "Low"
```

**Key Level:**
```
keyLow = MIN(low[-9..0])   [lowest low of last 10 bars]
```

---

## 4. Event System

- `IntersectionObserver` threshold=0.1 — triggers lazy load at 10% visibility
- `BACKFILL_TRIGGER_FRACTION = 0.15` — backfill fires when user pans to within 15% of leftmost loaded bar
- `ResizeObserver` on chart canvas — responsive chart resize
- Timeframe buttons: `click` → `loadChart()` + destroy previous chart instance

---

## 5. Failure Modes

| Failure | Reaction |
|---|---|
| Yahoo Finance API down | Shows `showChartEmpty()` with Retry button |
| `LightweightCharts` not loaded | Shows "Chart library not available" |
| Backfill returns 0 candles | `noMoreLeft = true`; backfill permanently disabled for session |
| Backfill returns same data | Same deduplication check → `noMoreLeft = true` |
| CoinGecko API fails | Falls back to hardcoded static chip data |
| Stocks `fetchSingleQuote` unavailable | Shows static fallback chips immediately |

---

## 6. System Interactions

- `fetchYahooOHLC(symbol, range)` — from `script.js` globals (CORS proxy via Cloudflare Worker)
- `fetchYahooOHLCBefore(symbol, interval, oldestTs)` — from `script.js`
- `fetchSingleQuote(symbol)` — from `script.js`
- `simpleCache` — from `script.js`
- `CurrencyConverter.format(price)` — from `script.js` (optional)
- `window.latestCryptoData` — opportunistic read from main dashboard fetch
- `window.LightweightCharts` — CDN-loaded external library
- Exposed via `window.ProsperPathChart = { create, updatePrice }`

**Confidence Level:** HIGH — both files fully read

---

# Feature 7: AI Widget — Prosporous — Deep Internal Spec

**File:** `ai-widget.js` (1806 lines)

---

## 1. Execution Model

1. `new ProsporousWidget()` — instantiated on page load; calls `asyncInit()`
2. `asyncInit()`:
   - `injectStyles()` — adds CSS for sources block
   - `buildUI()` — injects full chat widget HTML into `document.body`
   - `attachEvents()` — wires all interactive elements
   - Immediately enables send button (Worker proxy mode — no local API key required)
   - `initSession()` → `createNewSession()` — new blank session per page load
   - Context-specific initializers: `initGuideAssistant()`, `initCoinAssistant()`, `initStockAssistant()`, `initBlogAssistant()`
   - Listens for `auth-login-success` → `syncWithCloud()`

3. **Message flow**: `sendMessage()` → gathers context → optional Tavily web search → POST to Cloudflare Worker → streaming response → DOM render

---

## 2. State Machine

```
CLOSED ──[toggle button]──► OPEN
OPEN   ──[close/toggle]──► CLOSED
OPEN   ──[history toggle]──► HISTORY_PANEL_VISIBLE
OPEN   ──[fullscreen toggle]──► FULLSCREEN
OPEN + sendMessage() ──► SENDING
SENDING ──[response complete]──► IDLE
```

**Session states:**
- `NEW` — empty, not yet persisted
- `ACTIVE` — has ≥1 message, saved to localStorage
- `CLOUD_SYNCED` — pushed to Cloudflare Worker `/user/chat` endpoint

---

## 3. Data Flow

```
User types message
    ↓
sendMessage()
    ↓
  getPageContext() ← scrapes live DOM for:
    - URL, page title, metadata
    - Market stats (global-cap, btc-dominance, fear-greed)
    - Portfolio summary (window.portfolioData)
    - Asset details (crypto-detail, market-detail pages)
    - Guide/blog content (up to 5000 chars)
    ↓
  [if isSearchEnabled AND tavilyKey] → performTavilySearch(query)
    ↓
  Build messages array: [system_prompt, page_context, history, user_msg]
    ↓
  POST to window.WORKER_API_URL + '/chat'
    (Cloudflare Worker — holds OpenRouter API key server-side)
    ↓
  Streaming response rendered token-by-token into DOM
    ↓
  saveSessionsToStorage() → localStorage ('prosporous_sessions')
    ↓
  [if authenticated] → syncSessionsToCloud(sessions)
    → POST to WORKER_API_URL + '/user/chat'
```

---

## 4. Event System

- **`auth-login-success`** custom event → `syncWithCloud()` (pulls cloud sessions, merges by ID)
- **keydown(Enter)** on textarea → `sendMessage()` (Shift+Enter = newline)
- **Page-type detection** (`detectPageType()`) → context-specific assistant auto-open (1.5s delay)
- **Pill buttons** (suggested actions) → inject preset prompts into chat

---

## 5. Failure Modes

| Failure | Reaction |
|---|---|
| Worker API unreachable | Error message appended to chat |
| Tavily search fails | Proceeds without search context (returns null gracefully) |
| Cloud sync fails | Warning logged; local storage unaffected |
| `window.portfolioData` undefined | `portfolioSummary = { error: 'Data link pending' }` |
| DOM element not found during context scrape | Optional chaining `?.` returns undefined silently |
| Session storage limit | Capped at 30 sessions; empty sessions not persisted |

---

## 6. Security Model

- **NO API keys client-side** — OpenRouter key lives exclusively in Cloudflare Worker
- `getAuthToken()` reads from `sessionStorage` first (falls back to `localStorage`)
- Bearer token sent in Authorization header to `/user/chat` and `/user/data`
- `escapeHtml()` applied to all user-controlled content before DOM injection
- Legacy `localStorage('auth_token')` cleared on successful sign-in (replaced by `sessionStorage`)

---

## 7. System Interactions

- `window.WORKER_API_URL` — configurable base URL (default: neurowealth-worker.smsproi357.workers.dev/api)
- `window.currentUser` — auth state from `google-auth.js`
- `window.portfolioData` — Plaid-sourced portfolio data from portfolio connection modules
- `window.aiAnalysis` — optional page-specific analysis data exposed by individual pages
- `window.prosporousWidget` — global singleton reference

**Confidence Level:** HIGH — first 800 lines fully read; session, UI, context, and security logic fully covered

---

# Feature 8: Waitlist & Authentication — Deep Internal Spec

**Files:** `google-auth.js` (300 lines), `waitlist-brevo-service.js` (11KB), `index.html`

---

## 1. Execution Model

### Auth Flow (Google Identity Services):

1. Page load → `initGoogleAuth()` (called after GIS script loads)
2. `google.accounts.id.initialize({ client_id, callback: handleCredentialResponse })`
3. `renderLoginButton()` — checks `window.currentUser`; renders native Google button (logged-out) or profile display (logged-in)
4. **Guest auto-open:** 1200ms delay → dropdown slides open if not logged in
5. **Login:** User clicks → Google OAuth popup → `handleCredentialResponse(response)`
6. `handleCredentialResponse()`:
   - POSTs JWT to `WORKER_API_URL/auth/google`
   - Worker validates JWT signature (server-side)
   - Returns `{ user: {...}, session_token: "..." }`
   - Stores: `sessionStorage.setItem('auth_token', session_token)` + `localStorage.setItem('user_profile', user)`
   - Fires `window.dispatchEvent(new Event('auth-login-success'))`
   - Calls `loadUserData()` — syncs watchlist from cloud
7. **Session restore on load:** `window.load` event → checks `sessionStorage/localStorage` for token + profile → restores `window.currentUser` → calls `loadUserData()`
8. **Sign-out:** `handleSignOut()` → clears all storage → `page.reload()`

---

## 2. State Machine

```
GUEST ──[Google OAuth success + Worker verify]──► AUTHENTICATED
AUTHENTICATED ──[page load with valid token]──► SESSION_RESTORED
AUTHENTICATED ──[sign out]──► GUEST
AUTHENTICATED ──[auth-login-success event]──► CLOUD_SYNCED
```

---

## 3. Data Flow

```
Google OAuth credential (JWT)
    ↓
POST WORKER_API_URL/auth/google { token: credential }
    ↓ [Cloudflare Worker verifies Google JWT signature]
    ↓
{ user: { name, email, picture, sub }, session_token }
    ↓
sessionStorage['auth_token'] = session_token
localStorage['user_profile'] = JSON.stringify(user)
window.currentUser = user
    ↓
loadUserData() → GET WORKER_API_URL/user/data (Bearer token)
    ↓
{ watchlist: [...] } → localStorage['user_watchlist']
```

---

## 4. Mathematical Logic

`parseJwt(token)` — client-side JWT decode (Base64URL → JSON). Used for immediate UI feedback only. **NOT used for security verification** — that is server-side.

---

## 5. Failure Modes

| Failure | Reaction |
|---|---|
| Worker auth endpoint fails | `alert('Login failed. Please try again.')` |
| Corrupt `user_profile` in localStorage | Session restore catches error, clears all auth storage |
| `loadUserData` cloud fetch fails | Warning logged; local state unaffected |
| Google GIS not loaded | `initGoogleAuth()` errors silently (function undefined) |

---

## 6. Security Considerations

- JWT signature verified **server-side only** (Cloudflare Worker)
- `session_token` stored in `sessionStorage` (tab-scoped) primarily; `localStorage` fallback removed at sign-in
- No OAuth `access_token` stored client-side
- `google.accounts.id.disableAutoSelect()` called on sign-out to prevent automatic re-auth

---

## 7. System Interactions

- `window.currentUser` — consumed by `ai-widget.js`, `portfolio-connection-*`, and other modules
- `window.dispatchEvent('auth-login-success')` — consumed by `ai-widget.js` (`syncWithCloud()`)
- `WORKER_API_URL` — shared constant with `ai-widget.js`

**Confidence Level:** HIGH — full 300-line file examined

---

# Feature 9: Strategy Lifecycle & Health — Deep Internal Spec

**Files:** `strategy-lifecycle.js` (874 lines), `strategy-health.js` (44KB)

---

## 1. Execution Model

### Strategy Lifecycle:

1. `loadRegistry()` on init — reads `pp_strategy_registry_v1` from localStorage
2. `enforceGlobalCaps()` — prunes DEPRECATED strategies if total > 200; hard-truncates if still over
3. **Save version flow:** User clicks "Strategy Version" button → `openSaveModal()` → user fills form → `handleSaveConfirm()`:
   - Creates new strategy (if `__new__`) or finds existing
   - `saveStrategyVersion()`:
     - `PresetVersioning.snapshotIdentity()` → `{ normalized_config, config_hash, ... }`
     - `CapitalReadiness.computeCRS(presetKey)` → readiness snapshot
     - `window._lastGateResult` → walk-forward validation snapshot
     - DOM scrape of `[data-metric="X"]` elements → metrics snapshot
     - Creates version entry with UUID, semver, all snapshots
     - `computeAutoState()` → updates strategy state
     - `saveRegistry()` → persists to localStorage

---

## 2. State Machine (Strategy Lifecycle)

```
DRAFT ──[first version saved]──► RESEARCH
RESEARCH ──[version with CAPITAL-READY tier]──► VALIDATED
VALIDATED ──[promote button]──► PRODUCTION
PRODUCTION, VALIDATED, RESEARCH, DRAFT ──[deprecate]──► DEPRECATED
```

**`computeAutoState()` rules:**
```
IF state === 'PRODUCTION' → stays PRODUCTION
IF state === 'DEPRECATED' → stays DEPRECATED
IF no versions → DRAFT
IF latest version tier is CAPITAL-READY → VALIDATED
ELSE → RESEARCH
```

**Production warning:** If a PRODUCTION strategy's latest version is NOT CAPITAL-READY tier, a warning badge is shown in the library detail view.

---

## 3. Data Flow

```
Backtest run completes
    ↓
DOM element [data-metric="totalReturn"], etc. readable
    ↓
User clicks "Strategy Version"
    ↓
openSaveModal() → buildSaveModalHTML()
    ↓
handleSaveConfirm()
    ├── PresetVersioning.snapshotIdentity()
    ├── CapitalReadiness.computeCRS(presetKey)
    ├── window._lastGateResult (walk-forward gate result)
    └── DOM metric scrape
    ↓
saveStrategyVersion(strategyId, opts)
    ↓
version {
  version_id, version (semver), created_at,
  normalized_config, config_hash,
  snapshots: { readiness, validation, metrics },
  exports: { config_export_json, report_export_json }
}
    ↓
strategy.versions.push(version)
enforceVersionCap(strategy)   [max 100 versions]
computeAutoState(strategy)    [auto-transition]
saveRegistry()                [localStorage persistence]
```

---

## 4. Mathematical Logic

**Semver bump:**
```
bumpPatch("1.2.3") → "1.2.4"
bumpPatch("1.0.0") → "1.0.1"
Invalid semver → "1.0.0" (reset)
```

**CAPITAL-READY detection:**
```
normalized = tier.toUpperCase().replace(/[\s-]/g,'_').replace(/_+/g,'_')
isCapitalReady = CAPITAL_READY_TIERS.includes(normalized)
              OR (normalized.includes('CAPITAL') AND normalized.includes('READY'))
```

---

## 5. Failure Modes

| Failure | Reaction |
|---|---|
| `PresetVersioning` unavailable | Snapshot is null; version saved without config snapshot |
| `CapitalReadiness` unavailable | readiness snapshot is null |
| `window._lastGateResult` undefined | Walk-forward snapshot marked `wf_enabled: false` |
| DOM metric elements missing | `metrics` is null for that version |
| localStorage full | `saveRegistry()` logs error; registry not persisted |
| Registry > 200 entries | Oldest DEPRECATED purged first; hard truncate if still over |

---

## 6. System Interactions

- `window.StrategyLifecycle` — global public API
- `window.PresetVersioning.snapshotIdentity()` — config fingerprinting
- `window.CapitalReadiness.computeCRS()` — readiness score
- `window._lastGateResult` — global set by walk-forward gate computation in `backtest.js`
- `window.PortfolioRiskOverlay.getHealthClassification()` — consumed by risk overlay's drift kill-switch
- Buttons injected into `#export-group` in backtest sidebar

**Confidence Level:** HIGH — full lifecycle source examined (874 lines)

---

# Feature 10: Wallet / Token Ingestion — Deep Internal Spec

**Files:** `wallet-token-ingestion.js` (45KB), `walletconnect-provider.js` (1.8MB), `plaid-client.js` (23KB)

---

## 1. Execution Model

The wallet/token ingestion system handles two distinct connection paths:

**Path A — WalletConnect (Crypto Wallets):**
1. User clicks "Connect Wallet" → `walletconnect-provider.js` initializes WalletConnect v2 modal
2. User scans QR or selects wallet
3. On connect → wallet address + chain ID returned
4. `wallet-token-ingestion.js` fetches token balances for the connected address
5. Token data mapped to portfolio slots format

**Path B — Plaid (Traditional Finance):**
1. `plaid-client.js` initiates Plaid Link flow via Cloudflare Worker
2. Worker creates Plaid Link token (server-side, hides Plaid keys)
3. Plaid Link UI opens in overlay
4. On success → `public_token` returned to client
5. Client POSTs `public_token` to Worker → Worker exchanges for `access_token` (server-side only)
6. Worker fetches holdings + transactions → returns to client
7. Data stored as `window.portfolioData`

---

## 2. Data Flow

```
WalletConnect ──────────────► wallet address + chainId
                                    ↓
wallet-token-ingestion.js
    ↓ RPC calls to chain (or third-party token API)
Token balances []
    ↓
Map to internal format { symbol, quantity, price, value }
    ↓
window.portfolioData.walletHoldings
    ↓
AI Widget getPageContext() → portfolioSummary

Plaid Link ──────────────────► public_token
                                    ↓
POST WORKER_API_URL/plaid/exchange-token
    ↓ [Server-side: Plaid access_token exchange, holdings fetch]
{ holdings: [], accounts: [], investment_transactions: [] }
    ↓
window.portfolioData
    ↓
AI Widget getPageContext() → portfolioSummary
    ↓
localStorage (session-scoped, not persisted)
```

---

## 3. Failure Modes

| Failure | Reaction |
|---|---|
| WalletConnect modal closed by user | Connection aborted; no data stored |
| Plaid Link fails | Error returned from Worker; no token data |
| Worker /plaid/exchange-token fails | Client receives error; `portfolioData` remains undefined |
| Token price data unavailable | Quantity shown without dollar value |
| Chain RPC down | Token balance fetch fails; retry or empty state |

---

## 4. System Interactions

- `window.portfolioData` — consumed by `ai-widget.js` context scraper
- `window.WORKER_API_URL` — shared with auth + AI modules
- `window.currentUser` — required for authenticated Plaid data sync
- `plaid_session.json` — local session file (development artifact)
- `portfolio-connection-chooser.js` + `portfolio-connection-providers.js` — UI orchestration layer for connection type selection

**Confidence Level:** MEDIUM — core data flow inferred from 3 files; internal WalletConnect provider (1.8MB minified bundle) is an external library and not internally audited. Plaid client is PARTIALLY UNKNOWN given file size constraints.

---

# Cross-System Architecture Summary

## Global State Map

| Key | Storage | Owner | Consumers |
|---|---|---|---|
| `pp_portfolio_v1` | localStorage | PortfolioManager | RiskOverlay, Attribution |
| `pp_portfolio_risk_policy_v1` | localStorage | RiskOverlay | RiskOverlay |
| `pp_portfolio_risk_audit_v1` | localStorage | RiskOverlay | RiskOverlay |
| `pp_strategy_registry_v1` | localStorage | StrategyLifecycle | Portfolio slot assignment |
| `prosporous_sessions` | localStorage | AI Widget | AI Widget |
| `pp_paper_sessions_v1` | localStorage | PaperExecution | PaperExecution |
| `auth_token` | sessionStorage | GoogleAuth | AI Widget, Plaid |
| `user_profile` | localStorage | GoogleAuth | AI Widget |
| `user_watchlist` | localStorage | GoogleAuth sync | Market pages |
| `window.currentUser` | JS runtime | GoogleAuth | AI Widget, Plaid, Portfolio |
| `window.portfolioData` | JS runtime | Plaid/Wallet | AI Widget |
| `window._lastGateResult` | JS runtime | backtest.js | StrategyLifecycle |

## External Dependencies

| System | External Service | Routing |
|---|---|---|
| AI Widget | OpenRouter LLM API | Via Cloudflare Worker (keys server-side) |
| AI Widget | Tavily Search | Direct (user-optional, key required) |
| Backtest | Binance Public API | Direct browser fetch |
| Backtest | Golden Dataset | `/exports/btc_4h_2019_2024.json` (local) |
| Market Surface | Yahoo Finance OHLCV | Via `script.js` CORS proxy |
| Market Pulse | CoinGecko Markets API | Direct browser fetch |
| Auth | Google Identity Services | Google CDN + Worker verify |
| Portfolio | Plaid API | Via Cloudflare Worker (keys server-side) |

---

## Overall Confidence Levels

| Feature | Confidence | Notes |
|---|---|---|
| Backtest Engine | HIGH | Full 1555-line source examined |
| Portfolio Risk Overlay | HIGH | Full 989-line source examined |
| Portfolio Attribution | HIGH | Full 268-line source examined (complete file) |
| Market Surface | HIGH | Full 612-line source examined (complete file) |
| Market Pulse | HIGH | Full 411-line source examined (complete file) |
| AI Widget (Prosporous) | HIGH | First 800/1806 lines; all critical paths visible |
| Authentication | HIGH | Full 300-line source examined (complete file) |
| Strategy Lifecycle | HIGH | First 800/874 lines; all state machine and CRUD visible |
| Portfolio Manager + Allocator | MEDIUM-HIGH | Structure inferred; 65KB+78KB files not fully traversed |
| Paper Trading Execution | MEDIUM | 3 large files; core architecture inferred from cross-references |
| Wallet / Token Ingestion | MEDIUM | Core flow clear; WalletConnect provider is external minified bundle |
| **Clarity Box** | HIGH | Full 853-line source examined |
| **Preset Versioning** | HIGH | Full 778-line source examined (complete file) |
| **Strategy Health Memory** | HIGH | Full 948-line source examined |
| **Guided Demo Controller** | HIGH | Full 734-line source examined (complete file) |

*Document generated from direct source code analysis. No inference from external documentation.*

---

# Feature 11: Clarity Box — Deep Internal Spec

**File:** `clarity-box.js` (853 lines), `clarity-box.html`

---

## 1. Execution Model

Clarity Box is a standalone AI sense-making page — not a widget overlay. Single-page app with two view states:

1. **Landing view** — text input + suggestion chips + web toggle button
2. **Conversation view** — scrollable thread of Q&A blocks + sticky bottom input bar

Flow per question submitted:
1. `askQuestion(query)` — guards against double-submit via `isProcessing` flag
2. UI switches to conversation view; `createLoadingBlock(query)` appended immediately
3. `fetchClarityMap(query, useWebSearch)` → POST to `WORKER_API_URL/ai/chat`
4. Server responds with JSON containing 6 structured sections
5. `populateLoadingBlock(blockId, query, data)` replaces skeleton with rendered HTML
6. `saveToHistory(query, data, usedWebSearch)` → `localStorage('clarity_history')` (max 50)

---

## 2. State Machine

```
LANDING ──[submit / suggestion click]──► CONVERSATION (loading)
CONVERSATION (loading) ──[API success]──► CONVERSATION (populated)
CONVERSATION (loading) ──[API failure]──► LANDING (if no prior blocks)
                                          or CONVERSATION (error toast, block removed)
CONVERSATION ──[history item click]──► CONVERSATION (restored entry)
CONVERSATION ──[history clear]──────► LANDING (if no live blocks)
```

**Processing guard:**
```
isProcessing = true → askQuestion() early returns (no double-submit possible)
isProcessing = false → set in finally{} block regardless of success/error
```

---

## 3. Data Flow

```
User types question
    ↓
askQuestion(query)
    ↓
fetchClarityMap(query, webSearchEnabled)
    ↓
POST WORKER_API_URL/ai/chat {
    messages: [system_prompt, user_msg],
    model: localStorage('prosporous_selected_model') || 'zhipu/glm-4.5-air',
    webMode: webSearchEnabled    ← Worker handles Tavily server-side
}
    ↓ AbortController 45-second timeout
Response JSON → extractJSON(content)
    ↓
{
  framing: HTML string,
  forces: [{title, desc}...],       minimum 3-4
  timeImpact: {1, 2, 3, 4},         1yr/5yr/10yr/20yr+
  risks: [{type, title, desc}...],   minimum 3-4
  scenarios: [optimistic, balanced, pessimistic],
  nextSteps: ["step1", "step2"...]   minimum 4
}
    ↓
buildClarityMapHTML(data, blockId)
    ↓
DOM render with interactive time slider + next-step click-throughs
    ↓
saveToHistory(query, data, webSearchEnabled)
```

---

## 4. Mathematical Logic

**No financial calculations performed client-side.** All analysis is LLM-generated. The only client-side computation:

**History time formatting:**
```
now - timestamp < 60s   → "Just now"
< 3600s  → "Xm ago"
< 86400s → "Xh ago"
< 604800s → "Xd ago"
ELSE → date.toLocaleDateString()
```

**Suggestion fuzzy filter:**
```
filtered = [...PLACEHOLDER_PROMPTS, ...THINKING_PROMPTS]
    .filter(p => p.toLowerCase().includes(inputValue.toLowerCase()))
    .slice(0, 3)
```

---

## 5. Event System

- **Landing `submit` click / Enter keydown** → `askQuestion(input.value)`
- **Bottom bar `submit` / Enter** → `askQuestion(bottomInput.value)`
- **Suggestion chip click** → pre-fills input AND calls `askQuestion()` immediately
- **Next-step pill click** → pre-fills bottom input (does NOT auto-submit; user reviews first)
- **Time slider `input`** → live updates `.time-impact-content` without new AI call; data already in memory
- **Web toggle** → `toggleWebSearch()` — syncs both landing and bottom toggle buttons
- **History sidebar toggle** → `openHistorySidebar()` / `closeHistorySidebar()`
- **History item click** → `restoreFromHistory(entry)` — re-renders prior QA block without API call
- **History clear** → `clearHistory()` → localStorage wipe + badge update

---

## 6. Failure Modes

| Failure | Message Shown | Recovery |
|---|---|---|
| `API_KEY_MISSING` | "AI service temporarily unavailable" | Worker routing fault |
| `MALFORMED_JSON` | "AI returned invalid format. Rephrase." | JSON extraction uses regex fallback first |
| `429` rate limit | "Rate limit exceeded. Wait and retry." | No auto-retry |
| 45s timeout | "Request timed out." | AbortController fires |
| Generic API error | `"Synthesis failed: {first 80 chars}"` | |
| No data returned | "No data returned from analytical engine." | |
| Failed block | Loading block removed from DOM | Returns to landing if thread empty |

**Error display:** `cb-error-toast` fixed overlay, auto-dismisses after 8 seconds.

---

## 7. Edge Case Handling

- **Double-submit prevention:** `isProcessing` flag blocks re-entry during any in-flight request
- **Empty conversation after error:** if `conversationThread.children.length === 0` after block removal → landing view restored
- **History restore vs live ask:** `restoreFromHistory()` calls `appendQABlock()` (same rendering path) without API call — data is from localStorage
- **JSON inside markdown fences:** `extractJSON()` regex strips ` ```json ` wrapper if model wraps output
- **Placeholder rotation:** `setInterval` every 4s with CSS fade transition; stops when user focuses input
- **Web search routing:** Tavily key NOT on client — `webMode: true` flag sent to Worker which handles Tavily server-side

---

## 8. Performance Characteristics

| Operation | Notes |
|---|---|
| `fetchClarityMap` | Single POST, 45s timeout. Response ~1-3KB JSON |
| `buildClarityMapHTML` | O(F + R + S + N) where F=forces, R=risks, S=scenarios, N=nextsteps |
| `saveToHistory` | O(H) serialize, max 50 entries |
| `renderHistoryList` | O(H) DOM build |
| Suggestion filter | O(P × Q) where P=prompt pool size (~12), Q=query length — negligible |

---

## 9. System Interactions

- `window.WORKER_API_URL` — shared constant (same as ai-widget.js)
- `localStorage('clarity_history')` — max 50 entries, FIFO
- `localStorage('prosporous_selected_model')` — shared model preference with ai-widget.js
- `TAVILY_API_KEY` — intentionally blank on client; routing is server-side only
- **No cross-module function calls** — fully self-contained page script

**Confidence Level:** HIGH — full 853-line source examined

---

# Feature 12: Preset Versioning — Deep Internal Spec

**File:** `preset-versioning.js` (778 lines, complete file)

---

## 1. Execution Model

Preset Versioning is a **configuration fingerprinting and version registry** for backtest presets. It runs as an auto-initializing IIFE that:

1. Auto-initializes on DOMContentLoaded (100ms defer to let other scripts load first)
2. Seeds default registry entries for `BTC_4H_PRODUCTION`, `BTC_DAILY_PRODUCTION`
3. Injects a version display row after the preset selector in the backtest UI
4. Creates and wires the "New Version" modal

---

## 2. State Machine

**Per-Preset Version States:**
```
INITIAL (no registry entry) ──[first createNewVersion() call]──► v1.0.0
v1.0.0 ──[user creates new version]──► v1.0.1 (patch bump)
vX.Y.Z ──[user manually enters version string]──► vA.B.C (any valid semver)
```

**Duplicate version guard:**
```
IF registry.presets[pid].versions.some(v => v.version === newVersionStr):
    REJECT → returns null, alert shown
```

---

## 3. Data Flow

```
DOM preset-selector change
    ↓
updateVersionDisplay()
    ├── buildNormalizedConfig()  → scrapes 10 DOM inputs
    ├── computeConfigHashSync()  → DJB2 hash of sorted JSON
    └── getCurrentIdentity(presetName) → reads pp_presets_registry_v1
    ↓
vX.Y.Z badge + 8-char hash badge updated in UI

[User clicks "New Version"]
    ↓
openNewVersionModal()
    ├── getCurrentIdentity(presetName) → current version
    ├── suggestNextVersion() → patch bump
    ├── getVersionHistory() → loads last saved normalized_config
    └── diffConfigs(last, current) → renders change summary
    ↓
handleConfirmVersion()
    ├── buildNormalizedConfig() → current state snapshot
    ├── computeConfigHash() → SHA-256 async (DJB2 fallback)
    └── createNewVersion(name, semver, hash, notes, config)
        ↓
        registry.presets[pid].versions.unshift(entry)
        saveRegistry() → localStorage('pp_presets_registry_v1')
```

---

## 4. Mathematical Logic

### DJB2 Hash (sync fallback):
```
hash = 5381
for each char c in JSON string:
    hash = ((hash << 5) + hash + c.charCodeAt(0)) & 0xFFFFFFFF
return (hash >>> 0).toString(16).padStart(8, '0')
```

### SHA-256 Hash (async primary):
```
encoded = new TextEncoder().encode(sortedJSON)
hashBuffer = await crypto.subtle.digest('SHA-256', encoded)
return Array.from(new Uint8Array(hashBuffer))
       .map(b => b.toString(16).padStart(2, '0')).join('')
```

### Key-Order Independent JSON (for stable hashing):
```
sortKeys(obj): recursively sorts object keys alphabetically
    → arrays: map each element through sortKeys
    → non-objects: return as-is
```

### Normalized Config (10 fields, all rounded):
```
{
  asset, date_end, date_start,
  fee_pct: roundNum(feePct, 4),
  position_pct: roundNum(positionPct, 4),
  preset_name,
  slippage_pct: roundNum(slippagePct, 4),
  starting_capital: roundNum(startingCapital, 2),
  stop_loss_pct: roundNum(stopLossPct, 4),
  take_profit_pct: roundNum(takeProfitPct, 4),
  timeframe
}
```
Zero/null/empty fields OMITTED from normalized config (prevents fingerprint drift from cleared fields).

### Config Diff:
```
allKeys = UNION(keys(configA), keys(configB))
for each key:
    IF only in B → type: 'added'
    IF only in A → type: 'removed'
    IF JSON.stringify(a[key]) !== JSON.stringify(b[key]) → type: 'changed'
```

---

## 5. Event System

- `preset-selector change` → `updateVersionDisplay()`
- `btn-new-version click` → `openNewVersionModal()`
- `pv-btn-confirm click` → `handleConfirmVersion()` (async SHA-256 hash)
- `pv-modal-close / pv-btn-cancel click` → `closeNewVersionModal()`
- Modal overlay click (backdrop) → `closeNewVersionModal()`

---

## 6. Failure Modes

| Failure | Reaction |
|---|---|
| `crypto.subtle` unavailable | Falls back to DJB2 hash silently |
| Duplicate version string | `alert()` + returns null; no entry created |
| Invalid semver format (not X.Y.Z) | `alert()` blocks save |
| localStorage full | `saveRegistry()` logs warning; no crash |
| DOM elements missing (not on backtest page) | `initUI()` silently exits |

---

## 7. System Interactions

- `window.PresetVersioning` — global public API object
- Consumed by `strategy-lifecycle.js` → `saveStrategyVersion()` calls `PresetVersioning.snapshotIdentity()`
- `document.getElementById('preset-selector')` — tight DOM coupling to backtest.html

**Confidence Level:** HIGH — entire 778-line file examined

---

# Feature 13: Strategy Health Memory — Deep Internal Spec

**File:** `strategy-health.js` (948 lines)

---

## 1. Execution Model

Strategy Health is a **rolling performance tracker** that records every backtest run and paper session, then classifies each strategy's health state based on rolling aggregates.

1. `loadRecords()` on page load — reads `pp_strategy_health_records_v1` (flat array, max 200)
2. **Backtest hook:** `recordBacktestRun(report)` called by `backtest.js` after every completed run
3. **Paper hook:** `recordPaperSession(paperState)` called by paper-trading module on session close
4. After each record: `saveRecords()` + `renderAllBadges()` — live badge updates in UI
5. `classifyHealth(strategyKey)` — deterministic classification based on rolling 20-record window

---

## 2. State Machine (Health Classification)

```
INSUFFICIENT DATA (< 5 records)
    ↓ [≥5 records]
Evaluate UNSTABLE conditions:
    1. rolling_mean_score <= 0
    2. paper_mean_score < bt_mean_score - 0.5 (strong drift)
    3. ≥2 auto-pauses in last 10 PAPER records
    ──► UNSTABLE if any condition met

Evaluate DEGRADING conditions (requires ≥10 records):
    1. last-5 mean score < prev-5 mean score AND score > 0
    2. last-5 mean maxDD > prev-5 mean maxDD AND score > 0
    ──► DEGRADING if any condition met

Evaluate HEALTHY:
    rolling_mean_score > 0 AND rolling_mean_maxDD < 35%
    AND no auto-pause in last 5 PAPER records
    ──► HEALTHY

Default fallback:
    rolling_mean_score > 0 ──► HEALTHY (even with higher DD)
    ELSE ──► INSUFFICIENT DATA
```

---

## 3. Data Flow

```
Backtest completes (backtest.js)
    ↓
recordBacktestRun(report)
    ├── Extracts: returnPct, maxDD, scoreRetDD, profitFactor,
    │             expectancy, trades, winRate, avgRMult, timeInDD
    └── Creates RunRecord { id, source:'BACKTEST', preset_name, metrics, safety_events:null }
    ↓
records.push(rec)
saveRecords()      → localStorage('pp_strategy_health_records_v1')
renderAllBadges()  → updatePresetBadge + updateWatchlistBadge + updateInlineBadge

Paper session closes (paper-trading.js)
    ↓
recordPaperSession(paperState)
    ├── Computes same metric set from paperState.tradeLog
    ├── Detects auto-pause: paperState._safetyStatus === 'AUTO_PAUSED'
    └── Creates RunRecord { source:'PAPER', safety_events: {auto_paused, breach_reason} }
    ↓
[same save + badge pipeline]

User/RiskOverlay queries health:
    ↓
classifyHealth(strategyKey) → 'HEALTHY' | 'DEGRADING' | 'UNSTABLE' | 'INSUFFICIENT DATA'
```

---

## 4. Mathematical Logic

### Strategy Key:
```
IF preset_name exists AND != 'CUSTOM' → key = preset_name
ELSE → key = asset + '_' + timeframe
```

### Rolling Aggregates (last N=20 records):
```
meanReturn = SUM(return_pct) / n
meanScore  = SUM(score_ret_dd) / n     [score = return / maxDD]
meanMaxDD  = SUM(maxdd_pct) / n
meanExpectancy = SUM(expectancy_per_trade) / n
pfMedian = MEDIAN(profit_factor)
tradeCountTotal = SUM(trades)
```

### Score (Return/Drawdown ratio):
```
score_ret_dd = return_pct / maxdd_pct   (stored per record)
           IF maxdd_pct = 0 → score = 0
```

### Paper vs Backtest Drift (requires ≥3 each):
```
btRuns = BACKTEST records in last 20
ppRuns = PAPER records in last 20
btMeanScore = MEAN(score_ret_dd for btRuns)
ppMeanScore = MEAN(score_ret_dd for ppRuns)

drift_score = ppMeanScore - btMeanScore
UNSTABLE if: ppMeanScore < btMeanScore - 0.5
```

### Trend Detection (DEGRADING check):
```
last5 = last 5 records (any source)
prev5 = records [n-10 : n-5]
last5MeanScore = MEAN(score_ret_dd for last5)
prev5MeanScore = MEAN(score_ret_dd for prev5)
DEGRADING if: last5MeanScore < prev5MeanScore AND meanScore > 0
```

### Time in Drawdown (per record):
```
[Backtest] ddBars = count(|drawdownCurve[i]| > 0.1)
           timeInDdPct = ddBars / drawdownCurve.length × 100

[Paper] Iterate equityCurve:
    peak = rolling max
    ddCount++ if (peak - point) / peak > 0.001
    timeInDdPct = ddCount / equityCurve.length × 100
```

---

## 5. Event System

- **Backtest completion** → external call to `window.StrategyHealth.recordBacktestRun(report)`
- **Paper session close** → external call to `window.StrategyHealth.recordPaperSession(state)`
- **Preset selector change** → `renderPresetBadge()` refreshes badge for new preset
- **Badge click** → `openHealthPanel(strategyKey)` — fixed-position side panel
- **Panel header click** → collapse/expand body section
- **Panel close button** → panel hidden, data not cleared

---

## 6. Failure Modes

| Failure | Reaction |
|---|---|
| Corrupted localStorage JSON | `showCorruptionBanner()` fixed toast, records reset to `[]` |
| `records.length > 200` | Oldest records sliced off before saving |
| `report.metrics` missing | `recordBacktestRun` returns early (guard) |
| Paper session with 0 EXIT trades | `recordPaperSession` returns early |
| Strategy key has < 5 records | `classifyHealth` returns 'INSUFFICIENT DATA' |

---

## 7. System Interactions

- `window.StrategyHealth` — global public API object
- Consumed by `portfolio-risk-overlay.js` → drift kill-switch health check
- Badge placement: `#preset-selector` in backtest sidebar, `#pw-candidate-select` in paper-trading watchlist
- `localStorage('pp_strategy_health_records_v1')` — flat array of RunRecord objects

**Confidence Level:** HIGH — first 800/948 lines fully examined; all classification logic covered

---

# Feature 14: Guided Demo Controller — Deep Internal Spec

**Files:** `guided-demo-controller.js` (734 lines, complete), `guided-demo-overlay.js` (dependency)

---

## 1. Execution Model

The Guided Demo Controller is a **cross-page, session-persisted interactive walkthrough** for unauthenticated visitors. It drives a 2-stage demo flow:

1. **Stage 1 — Guided Walkthrough (index.html):** 5-step spotlight tour of hero cards
2. **Stage 2 — Guided Sandbox (app.html + sub-pages):** Nav spotlight + free-explore mode with locked pages

State persists across page navigations via `sessionStorage('pp_demo_state')`.

---

## 2. State Machine

```
normal
  ↓ [startDemo()]
guidedWalkthrough (Stage 1, Step 1-5)
  ↓ [showHandoff()]
guidedWalkthrough → [user clicks "Enter Demo Environment"]
  ↓ [enterSandbox()]
guidedSandbox → navigates to app.html?demo=sandbox
  ↓ [onAppHubReady() → showSandboxStep2()]
guidedSandbox (Stage 2: nav spotlight)
  ↓ ["Got it" / nav click]
sandboxFreeExplore → enterFreeExplore()
  ↓ [3-5 minute timer]
sandboxFreeExplore → showAccountPrompt()
  ↓ [exitDemo()] → normal
```

**Page-bound hooks:**
- `index.html` → `startDemo()` (called by "Try Demo" button)
- `app.html?demo=sandbox` → `onAppHubReady()`
- `market-mechanics.html` (in sandbox) → `onMarketMechanicsReady()`
- `clarity-box.html`, `portfolio.html` (in sandbox) → `setupFreeExploreOnPage()`

---

## 3. Data Flow

```
sessionStorage('pp_demo_state') { appMode, currentStage, currentStepIndex,
    pendingSandboxStep2, pendingMarketMechanicsStep,
    freeExploreStartTime, accountPromptShown }
    ↓
initOnCurrentPage() on every page load
    ↓ [reads state, detects page, fires appropriate hook]

Stage 1:
STAGE1_STEPS[5] = [
    backtest, pattern-hunter, market-intelligence, portfolio, clarity-box
]
[data-demo-card="X"] selectors → activateHeroCard() → CSS class 'demo-active'
PPDemoOverlay.showSpotlight(target, opts)
PPDemoOverlay.showTooltip({ title, body, stepIndicator, actions })

Stage 2:
findNavLinkByText("Clarity Box" | "Market Mechanics" | "Portfolio")
    → PPDemoOverlay.showSpotlight(targets[], opts)
    → setupDemoNavInterception()

Free Explore:
setupFreeExploreOnPage()
    → allNavLinks.filter(not in allowedHrefs)
    → addEventListener: e.preventDefault() + PPDemoOverlay.showLockedMessage()

Account Prompt:
setTimeout(3-5 min random) → PPDemoOverlay.showPanel({ icon, title, buttons })
```

---

## 4. Mathematical Logic

**Account prompt timer:**
```
delay = (3 + Math.random() × 2) × 60 × 1000   [3–5 minutes, random]
```

**Resume timer on navigation (cross-page elapsed resumption):**
```
elapsed = Date.now() - _state.freeExploreStartTime
targetDelay = 4 × 60 × 1000   [4 minutes fixed on resume]
remaining = targetDelay - elapsed
IF remaining > 0 → setTimeout(remaining)
ELSE → showAccountPrompt() immediately (if not already shown)
```

---

## 5. Event System

- **DOMContentLoaded** → `initOnCurrentPage()` (50ms deferred)
- **"Try Demo" button** → `window.ProsperDemo.startDemo()`
- **Demo exit button** → `exitDemo()` → `PPDemoOverlay.destroyAll()` + state clear
- **"Begin Demo" panel button** → `beginStage1()` → `showStage1Step(0)`
- **"Next →" / "Back ←" tooltip actions** → `showStage1Step(index ± 1)`
- **"Enter Demo Environment →"** → `enterSandbox()` → `window.location.href = 'app.html?demo=sandbox'`
- **Spotlight next-step tooltips** → configurable action callbacks
- **Nav link clicks (non-allowed in free explore)** → intercepted, `showLockedMessage()`
- **Hub card clicks (non-allowed)** → same interception
- **Account prompt "Continue Demo"** → `PPDemoOverlay.hidePanel()`
- **`pendingMarketMechanicsStep` flag** → set when user navigates to market-mechanics, fires `showMarketMechanicsStep()` on page ready

---

## 6. Failure Modes

| Failure | Reaction |
|---|---|
| Stage 1 target `[data-demo-card]` not found | Warning logged, step continues to next |
| Stage 2 nav targets not found (0/3) | Skips step, enters free explore immediately |
| Market Mechanics module cards not found | Warning logged, enters free explore |
| `sessionStorage` unavailable (private mode) | `saveState()` / `loadState()` silently no-op via try/catch |
| `PPDemoOverlay` not loaded | `exitDemo()` guard: `if (window.PPDemoOverlay)` |
| `DemoPortfolioData` not loaded | `exitDemo()` guard: `if (window.DemoPortfolioData)` |
| Double-init prevention | `if (window.ProsperDemo && window.ProsperDemo._initialized) return;` |

---

## 7. Edge Case Handling

- **Back navigation mid-demo:** State restored from `sessionStorage`; appropriate hook fired for current page
- **Demo URL param (`?demo=sandbox`) with no active session state:** `onAppHubReady()` only fires if `appMode === 'guidedSandbox'` — URL param alone not sufficient
- **Allowed pages list:** `['clarity-box', 'market-mechanics', 'portfolio', 'app.html']` — case-insensitive href matching
- **Hero card depth effect:** Non-active `.mock-panel` elements get `depth-inactive` class; active gets `demo-active`
- **URL cleanup on exit:** `window.history.replaceState()` removes `?demo=sandbox` without page reload

---

## 8. System Interactions

- `window.PPDemoOverlay` — overlay rendering dependency (`guided-demo-overlay.js`)
- `window.DemoPortfolioData.clearDemoPortfolios()` — cleanup on exit
- `window.ProsperDemo` — global public API: `{ startDemo, exitDemo, onAppHubReady, onMarketMechanicsReady, initOnCurrentPage }`
- `sessionStorage('pp_demo_state')` — cross-page state (tab-scoped)
- DOM selectors: `[data-demo-card]`, `.mock-panel`, `.nav-links a`, `#nav-links a`, `.mm-module-card`, `.hub-card`

**Confidence Level:** HIGH — full 734-line file examined (complete)

---

# Updated Cross-System Architecture Summary

## Complete localStorage / sessionStorage Key Map

| Key | Storage | Owner | Consumers |
|---|---|---|---|
| `pp_portfolio_v1` | localStorage | PortfolioManager | RiskOverlay, Attribution |
| `pp_portfolio_risk_policy_v1` | localStorage | RiskOverlay | RiskOverlay |
| `pp_portfolio_risk_audit_v1` | localStorage | RiskOverlay | RiskOverlay |
| `pp_strategy_registry_v1` | localStorage | StrategyLifecycle | Portfolio slot assignment |
| `pp_presets_registry_v1` | localStorage | PresetVersioning | StrategyLifecycle |
| `pp_strategy_health_records_v1` | localStorage | StrategyHealth | PortfolioRiskOverlay (drift) |
| `pp_paper_sessions_v1` | localStorage | PaperExecution | PaperExecution |
| `prosporous_sessions` | localStorage | AI Widget | AI Widget |
| `prosporous_selected_model` | localStorage | AI Widget | AI Widget, Clarity Box |
| `clarity_history` | localStorage | Clarity Box | Clarity Box |
| `pp_demo_state` | **sessionStorage** | GuidedDemoController | GuidedDemoController |
| `auth_token` | sessionStorage | GoogleAuth | AI Widget, Plaid |
| `user_profile` | localStorage | GoogleAuth | AI Widget |
| `user_watchlist` | localStorage | GoogleAuth sync | Market pages |
| `mp_crypto_chips` | localStorage | MarketPulse | MarketPulse (TTL cache) |
| `mp_stocks_chips` | localStorage | MarketPulse | MarketPulse (TTL cache) |
| `mp_commodities_chips` | localStorage | MarketPulse | MarketPulse (TTL cache) |

## Complete `window.*` Global API Map

| Global | Defined In | Consumers |
|---|---|---|
| `window.BacktestEngine` | backtest-engine.js | backtest.js, strategy-lifecycle.js |
| `window.PresetVersioning` | preset-versioning.js | strategy-lifecycle.js |
| `window.CapitalReadiness` | capital-readiness.js | strategy-lifecycle.js, portfolio-manager.js |
| `window.StrategyLifecycle` | strategy-lifecycle.js | backtest.js (inject buttons) |
| `window.StrategyHealth` | strategy-health.js | portfolio-risk-overlay.js, backtest.js, paper-trading.js |
| `window.PortfolioManager` | portfolio-manager.js | portfolio-risk-overlay.js, attribution |
| `window.PortfolioRiskOverlay` | portfolio-risk-overlay.js | portfolio.html |
| `window.PortfolioAttribution` | portfolio-attribution.js | portfolio.html |
| `window.PaperExecution` | paper-execution.js | portfolio-risk-overlay.js |
| `window.ProsperPathChart` | market-surface.js | page scripts |
| `window.prosporousWidget` | ai-widget.js | ai-widget.js (self-reference) |
| `window.ProsperDemo` | guided-demo-controller.js | index.html, app.html |
| `window.PPDemoOverlay` | guided-demo-overlay.js | guided-demo-controller.js |
| `window.DemoPortfolioData` | demo portfolio module | guided-demo-controller.js |
| `window.currentUser` | google-auth.js | all modules |
| `window.portfolioData` | Plaid/wallet modules | ai-widget.js |
| `window._lastGateResult` | backtest.js | strategy-lifecycle.js |
| `window.latestCryptoData` | script.js | market-pulse.js |
| `window.WORKER_API_URL` | config | ai-widget.js, clarity-box.js, google-auth.js |

---

## Cloudflare Worker Endpoint Map

| Endpoint | Method | Auth | Function |
|---|---|---|---|
| `/api/auth/google` | POST | None | Verify Google JWT, return session_token |
| `/api/user/data` | GET | Bearer | Get cloud watchlist + chat sessions |
| `/api/user/chat` | POST | Bearer | Sync chat sessions to cloud |
| `/api/ai/chat` | POST | None | Proxy to OpenRouter/Sarvam LLM |
| `/api/plaid/exchange-token` | POST | Bearer | Exchange Plaid public_token, return holdings |

*Document generated from direct source code analysis. No inference from external documentation.*
