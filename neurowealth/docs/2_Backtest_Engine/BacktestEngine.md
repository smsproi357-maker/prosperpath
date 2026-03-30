# Feature: Backtest Engine

## 1. Purpose
A professional-grade, pure JavaScript backtest engine designed for quantitative strategy research. It allows users to test trading strategies against historical data, generating institutional metrics, equity curves, and performance analytics without relying on external dashboarding tools.

## 2. Core Functionality
- Evaluates trading strategies (presets like `VOL_BREAKOUT` or custom user rules) over historical OHLCV data.
- Handles full position sizing, slippage, tiered trading fees, and stop-loss execution logic.
- Calculates comprehensive risk-adjusted performance metrics (Sharpe, Sortino, Calmar, Max Drawdown).
- Renders custom, high-performance HTML5 Canvas charts (Candlesticks, Volume, Equity, Drawdown, Distribution) independent of heavy third-party charting libraries.

## 3. Detailed Logic
- **Data Ingestion (`fetchOHLCV`):** First attempts to fetch live data from the Binance public API. If it fails (due to CORS or network errors), it safely unrolls to a local, statically hosted golden JSON dataset (`/exports/btc_4h_2019_2024.json`) mapped dynamically to the requested range.
- **Engine Execution (`backtest-engine.js`):** A direct 1:1 port of a C++ engine providing sub-millisecond calculation speeds. Loops through candles computing SMAs, ATRs, and RSIs. Simulates trade execution synchronously, applying slippage and fees to both entry and exit. Tracks Mark-to-Market equity on every bar.
- **Rules Processing:** Parses dynamic UI rules (e.g., `RSI < 30`). 
- **Analytics Engine:** Iterates over the resulting equity curve and trade log to build histograms, monthly heatmaps, and aggregate statistics dynamically.

## 4. User Flow
1. User configures strategy in the Left Panel (Asset, Timeframe, Dates, Capital, Fees, Rules).
2. Clicks "Run Backtest".
3. Overlays a loading spinner while `backtest.js` pulls OHLCV data.
4. Engine processes the data and resolves the trades locally in the browser (no backend dependency for execution).
5. UI removes the loader and paints the Center Panel (Candle/Equity charts) and Right Panel (Risk/Return metrics).
6. User can save the run snapshot to a "Journal" or Trace specific trades visually on the chart.

## 5. Inputs / Outputs
- **Inputs:** `asset` (e.g. BTC-USDT), `timeframe` (1m to 1w), `startDate`, `endDate`, Capital, Stop Loss %, Position Sizing %, Slippage, trading logic / conditions.
- **Outputs:** An object containing arrays of `trades`, `equityCurve`, `finalCapital`, and aggregated statistical metrics.

## 6. Edge Cases
- **No Trades Found:** If a custom user rule-set generates no trades (a common occurrence with contradictory rules), the system logs a warning and forcefully falls back to evaluating the `VOL_BREAKOUT` baseline to avoid rendering a broken, zeroed-out UI.
- **Binance Outage:** Network fetches catch failures and fallback to the provided JSON without breaking the engine flow—logging a gracefully handled warning.
- **Negative Capital:** Input validators throw descriptive errors to the UI before passing mathematically impossible states (e.g. `trading-fees < 0`) into the engine.

## 7. Dependencies
- **Engine Logic:** `backtest-engine.js` (Standalone, pure JS math/logic).
- **UI & Bindings:** `backtest.html`, `backtest.css`, `backtest.js`.
- **Helpers:** `RunConfigShared` (for hashing configs to enforce cache busting or uniqueness rules).
- **External Data:** Binance v3 API or flat JSON extracts.

## 8. UI / UX Behavior
- **Terminal Layout:** 3-column, viewport-bounded layout (no vertical page scrolling).
- **Fast Feedback:** Uses lightweight HTML5 Canvas rendering for sub-millisecond paint times avoiding DOM freezing during heavy calculations.
- **Interactivity:** Modals for AI Strategy generation, collapsible left/right control panels to maximize chart focus.

## 9. Future Improvements
- Multi-asset portfolio backtesting natively within the engine.
- Activate the UI's "Auto-Discovery AI (Mini Sweep)" to systematically test permutations of indicators for performance maxing.
- Expand local JSON fallback data to include equities (e.g., SPY, AAPL).

## 10. System Role
The analytical and research backbone of ProsperPath. Used entirely to validate ideas locally before exporting approved configurations to the "Deployment Watchlist" / Paper Trading logic.

## Confidence Level
- High (explicitly observed).
