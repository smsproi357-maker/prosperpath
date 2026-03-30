# ProsperPath Insights: System Overview

## 1. Executive Summary
ProsperPath Insights is a comprehensive, client-side heavy Wealth-Tech application designed to educate, simulate, and manage modern financial portfolios. It merges traditional institutional mechanics with modern crypto-native interfaces, unified under a singular, premium "Dark & Gold" aesthetic.

## 2. Core Architecture Philosophy
The system operates on an **Offline-Resilient, Client-Side First** architecture:
- **State Management**: Heavily utilizes structured `localStorage` mappings (e.g. `pp_portfolio_v1`, `pp_paper_sessions_v1`) to maintain complex state across distinct HTML page reloads without relying on a centralized SQL database.
- **Serverless Compute**: Employs external API Proxies via Cloudflare Workers (`neurowealth-worker.smsproi357.workers.dev`) to handle sensitive LLM keys (OpenRouter) and rate-limited integrations (Plaid/Tavily), while keeping the frontend entirely static and deployable anywhere.
- **Micro-SPA Pattern**: Instead of one massive React bundle, the app breaks domains into sovereign HTML files (`market-detail.html`, `trade.html`, `module-1-1.html`). Each file contains its own encapsulated JS execution logic while sharing a global `styles.css` and `script.js` utility layer.
- **Modular Math Services**: Complex logic (like the Portfolio Allocator and the Attribution Engine) is decoupled into strictly functional math pipelines. They ingest state arrays, calculate vectors (Equity curves, Drawdowns, Correlation Matrices), and push DOM updates, remaining isolated from UI visual logic.

---

## 3. Subsystem Manifest

### 1. Waitlist & Authentication
- **Path**: `index.html`
- **Role**: The landing layer. Features deterministic WebGL particle animations (via Three.js/Vanta) and handles initial user onboarding to the `waitlist` Supabase cluster.

### 2. Education & Market Mechanics
- **Path**: `market-mechanics.html`, `module-X-Y.html`
- **Role**: The conceptual foundation. Interactive, state-driven learning modules (SPA logic embedded in raw HTML) that mandate progressive completion to unlock advanced platform features. Features embedded Quiz Engines and centralized UI Progress Trackers.

### 3. Market Data Engine
- **Path**: `market-surface.js`, `market-pulse.js`
- **Role**: The sensory layer. Fetches live Yahoo Finance (OHLCV) and CoinGecko data. Renders infinite-scrolling Technical Charts via `LightweightCharts` and ambient market-pulse DOM chips globally.

### 4. Backtest Engine (Lab)
- **Path**: `trade.html`, `backtest-core.js`
- **Role**: The testing ground. A deterministic, tick-by-tick simulation environment allowing users to write logic rules (SMA Crossover, RSI bounds) and run them against historical data to generate verifiable win-rate metadata.

### 5. Execution & Paper Trading
- **Path**: `execution.html`
- **Role**: The live simulation. A robust terminal managing real-time websocket emulation for open positions. Tracks granular PnL execution via isolated Order IDs matching a realistic institutional latency structure.

### 6. Portfolio Management
- **Path**: `portfolio.html`, `4.X_*.md` documentation
- **Role**: The orchestration layer.
  - **Allocator**: Manages capital distribution across "slots" based on deterministic Capital Requirement Scores (CRS).
  - **Risk Overlay**: Acts as a Circuit Breaker monitoring Max Drawdown vectors to forcefully kill allocations gracefully.
  - **Attribution**: The diagnostic scanner identifying performance drag via Variance/Covariance matrices.

### 7. AI Widget & Global UI
- **Path**: `ai-widget.js`, `styles.css`
- **Role**: Unifies the experience. Provides the core design variables and deploys a stateless Prosporous LLM context-scraper that dynamically reads the active DOM to provide contextual financial advising via Cloudflare Workers.

---

## 4. Engineering Trade-Offs
1. **Redundancy vs. Velocity**: The Micro-SPA pattern (vanilla HTML files) increases boilerplate code duplication compared to a React/Next.js component tree, but allows for extremely fast, localized updates without concerning complex webpack compilation steps.
2. **Security vs. Convenience**: Persisting entire portfolio sets locally allows instantaneous offline loading, but requires explicit future migration to secure cloud tables (Supabase bindings) to support multi-device syncing natively.

## 5. Security Posture
- Total abstraction of LLM and Data API keys out of the client tree.
- Implementation of Google IAM validation layers over the `script.js` bootstrapping process.
- No direct user-provided JS `eval()` execution deployed inside the Backtest Engine logic trees.

*Documented completely via automated analysis protocol.*
