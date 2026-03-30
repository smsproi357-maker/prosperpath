# Feature: Execution & Trading System

## 1. Purpose
The execution layer bridges the gap between theoretical research (Backtest Engine) and forward-testing (Paper Trading). It provides a robust, stateful environment where strategies exported from the backtester can run against live market data in real-time, simulating institutional execution environments with strict safety constraints.

## 2. Core Functionality
- **Live Candle Polling:** Fetches data from Binance API on a 45-second cadence and maintains a local 2000-candle buffer (`paper-trading.js`).
- **Incremental Execution:** Processes candles one-by-one synchronously, applying slippage, fees, and stop-losses precisely as defined in the configuration, maintaining behavioral parity with the Backtest Engine.
- **Runtime State Management:** Tracks Mark-to-Market equity, peak equity, and drawdown dynamically across active paper sessions (`paper-execution.js`).
- **Audit & Safety Protocols:** Records a forensic ring buffer of events (Entry, Exit, Error, Stop-Loss). Features a hard "Kill Switch" and hygiene monitors (`disconnectCount`, `staleTickCount`, `rollingDrawdown`).

## 3. Detailed Logic
- `paper-trading.js` orchestrates the interval loop (45s). Uses exponential backoff for network failures. Merges new candles into the buffer, discarding duplicates by openTime.
- Generates signals using the shared `BacktestEngine.generateSignalVolBreakout` method, validating against the latest fully-closed candle.
- Pends entries and exits to the *open* of the next bar, applying simulated slippage (`slippagePct`).
- Stop-loss checks occur using the active candle's `low`. If triggered, it exits with adverse slippage applied.
- `paper-execution-engine.js` operates as a strict state machine (`onCandle`) protecting against timestamp regressions and duplicates.
- All actions are logged to `pp_paper_runtime_v1` and `pp_paper_events_v1` in `localStorage` for UI hydration.

## 4. User Flow
1. User authors a quantitative strategy in the Backtester and saves it.
2. User navigates to Portfolio/Watchlist and "Deploys to Paper".
3. The engine initializes `paperState` and seeds an initial equity curve from the last 100 historical candles.
4. The system flips to `RUNNING` and polls Binance every 45s.
5. User monitors the live Execution Console, observing the queue, active positions, and forensic event timeline.
6. If things go wrong, the user can hit the "Emergency Stop / Kill Switch" or rely on Auto-Pause limits (e.g., DD limit).

## 5. Inputs / Outputs
- **Inputs:** A confirmed Backtest Strategy Configuration (capital, asset, timeframe, risk params) and Live OHLCV data from Binance API.
- **Outputs:** An array of `tradeLog` objects, a real-time `equityCurve`, and a highly detailed structured audit log (`captureEvent`).

## 6. Edge Cases
- **Stale Ticks / Disconnects:** If a poll fails, it backs off exponentially. If delayed > 5x interval, flags `DISCONNECTED` and alerts the Risk Manager hygiene monitor.
- **Engine Restart:** Designed to survive browser refreshes by heavily caching running state and event trails in `localStorage`.
- **Duplicate Ticks:** `paper-execution-engine.js` strict `_lastProcessedCandleTs` lock ensures candles with the same or older ISO string are silently dropped.

## 7. Dependencies
- **Signals:** relies on `window.BacktestEngine` for signal math to ensure zero drift between research and live.
- **Storage:** heavy use of `localStorage` (`pp_paper_sessions_v1`, `pp_paper_runtime_v1`, `pp_paper_events_v1`).
- **Data Source:** Binance Public API `/api/v3/klines`.
- **Components:** `paper-trading.js`, `paper-execution.js`, `paper-execution-engine.js`.

## 8. UI / UX Behavior
- Console displays an "ENGINE SYSTEM STATUS" grid with specific semantic states (`CONNECTED`, `DELAYED`, `DISCONNECTED`, `RUNNING`, `EMERGENCY_STOP`).
- High-priority buttons for "Pause", "Resume", and a destructive, red "KILL SWITCH" requiring confirmation.
- Animated heartbeat pulse indicators on active strategies.

## 9. Future Improvements
- Implement a true backend orchestrator (e.g., Node.js / Python worker) to run the `paper-execution-engine.js` continuously, allowing the user to close their browser.
- Adapt `paper-execution-engine.js` to `live-execution-adapter.js` by mapping the simulated `_enterPosition` logic to real exchange API keys via CCXT or similar.

## 10. System Role
The validation crucible. It ensures theories developed in the Backtest Engine actually survive live market conditions, network latency, and forward-moving time before ever risking real capital.

## Confidence Level
- High (explicitly observed across multiple engine files).
