# Performance Audit Report

## 1. Executive summary
This repository has several high-impact performance bottlenecks concentrated in frontend payload/runtime behavior and server caching/auth flow. The biggest issues are: very large synchronous JS payloads (`script.js` + many page-specific scripts), cache disabling in `simple-server.js`, expensive per-request auth validation in the Worker, and repeated heavy computations/DOM writes in hot paths.

The backtest route is especially heavy: it loads many scripts individually (about 1.39 MB raw JS before CDN libraries) and includes at least one missing script reference that forces an extra failed request.

## 2. Highest-impact bottlenecks first

### Issue A
- What the issue is: Large monolithic frontend script loaded synchronously on many pages.
- Where it is: `neurowealth/script.js` (8,888 lines / 499,545 bytes), included in pages like `index.html:571`, `portfolio.html:218`, `market-detail.html:260`, `crypto-detail.html:284`, `backtest.html:2023`.
- Why it hurts performance: Blocks parse/execute on first load and executes many feature initializers even when page-specific elements are absent.
- Expected impact level: critical
- Recommended improvement: Split by route/feature and lazy-load; use `defer`/module boundaries; avoid loading full app logic on every page.
- Confidence level: high

### Issue B
- What the issue is: Backtest page JS payload is very large and fragmented across many script tags.
- Where it is: `neurowealth/backtest.html:2023-2041` loading many files; measured raw JS payload is ~1,386,124 bytes from first-party files alone.
- Why it hurts performance: Large download+parse+compile cost, long main-thread startup, many global initializers, poor cache locality.
- Expected impact level: critical
- Recommended improvement: Build a bundled, route-specific backtest chunk set with code splitting and long-term hashing.
- Confidence level: high

### Issue C
- What the issue is: Cache disabled for all static responses in `simple-server.js`.
- Where it is: `neurowealth/simple-server.js:102,110,119,122` sets `Cache-Control: no-store, no-cache...` globally.
- Why it hurts performance: Forces full re-download on repeat navigations; eliminates browser/CDN caching benefits.
- Expected impact level: critical
- Recommended improvement: Use immutable caching for versioned assets, shorter cache for HTML, and ETag/Last-Modified strategy.
- Confidence level: high

### Issue D
- What the issue is: Worker validates Google token via remote `tokeninfo` fetch on each authenticated request.
- Where it is: `neurowealth/worker/src/index.js:66`, called by many routes via `getAuthenticatedUser`.
- Why it hurts performance: Adds extra network RTT and external dependency to every API hit (`/api/status`, `/api/holdings`, `/api/transactions`, `/api/user/*`).
- Expected impact level: high
- Recommended improvement: Verify JWT locally (JWKS caching) or cache validation result for token lifetime.
- Confidence level: high

### Issue E
- What the issue is: Dev static server proxy buffers full upstream response in memory.
- Where it is: `neurowealth/simple-server.js:63-73` (`data += chunk`, return only after `end`).
- Why it hurts performance: Increases memory pressure and response latency for larger proxied pages/articles.
- Expected impact level: high
- Recommended improvement: Stream proxy responses (pipe/stream forwarding) instead of full buffering.
- Confidence level: high

## 3. Frontend performance findings

### Issue F
- What the issue is: Multiple global initialization entrypoints in one file.
- Where it is: `neurowealth/script.js:3000`, `3944`, `8644`, `9801` (`DOMContentLoaded` handlers).
- Why it hurts performance: Repeated DOM scans and setup phases increase startup work and make duplicate listeners more likely.
- Expected impact level: high
- Recommended improvement: Consolidate into one boot orchestrator with route capability map.
- Confidence level: high

### Issue G
- What the issue is: Frequent intervals/timeouts for UI updates and simulated ticks.
- Where it is: `neurowealth/script.js:4914` (100ms timer), `5295` (60s), `5296` (3s), `6211` (1s loop).
- Why it hurts performance: Keeps main thread active continuously, increases battery/CPU usage.
- Expected impact level: high
- Recommended improvement: Pause timers when tab hidden or component offscreen; centralize scheduler.
- Confidence level: high

### Issue H
- What the issue is: Scroll handlers without effective throttling safeguards.
- Where it is: `neurowealth/index.html:807-808` and `neurowealth/script.js:5173-5177`.
- Why it hurts performance: High-frequency scroll events can trigger frequent layout/style updates.
- Expected impact level: medium
- Recommended improvement: Use passive listeners + requestAnimationFrame with a `ticking` guard.
- Confidence level: high

### Issue I
- What the issue is: Repeated `innerHTML +=` inside loops.
- Where it is: `neurowealth/backtest.js:3747,3761`, `neurowealth/portfolio-manager.js:757,765,775,941`, `neurowealth/script.js:4208`.
- Why it hurts performance: Repeated DOM reparsing/reflow; scales poorly with larger lists.
- Expected impact level: medium
- Recommended improvement: Build once (string array join / DocumentFragment) then single assignment.
- Confidence level: high

### Issue J
- What the issue is: Heavy third-party scripts loaded eagerly on detail routes.
- Where it is: `portfolio.html:24,27` (Plaid + Chart.js), `market-detail.html:272` (lightweight-charts), `crypto-detail.html:296` (TradingView `tv.js`).
- Why it hurts performance: Adds network and parse costs even before user interaction.
- Expected impact level: medium
- Recommended improvement: Load on-demand when chart/feature container is visible or requested.
- Confidence level: high

### Issue K
- What the issue is: High volume console logging in runtime paths.
- Where it is: `script.js`, `plaid-client.js`, `data-feed.js`, `paper-trading.js`, `live-execution-adapter.js`, `backtest.js` (numerous `console.log`).
- Why it hurts performance: Logging in frequent loops/ticks adds CPU overhead and can slow low-end devices.
- Expected impact level: medium
- Recommended improvement: Gate logs behind environment/debug flags and strip in production builds.
- Confidence level: high

### Issue L
- What the issue is: Missing script file reference creates extra failed network request.
- Where it is: `neurowealth/backtest.html:2035` references `paper-execution-engine-instance.js` (file does not exist).
- Why it hurts performance: Adds avoidable 404 request and error handling overhead on page load.
- Expected impact level: low
- Recommended improvement: Remove or restore the file reference.
- Confidence level: high

## 4. Backend/server performance findings

### Issue M
- What the issue is: No compression middleware on Express server.
- Where it is: `neurowealth/server.js` middleware stack (`cors`, `body-parser`, `express.static`) without compression.
- Why it hurts performance: Larger payload transfer for JS/CSS/HTML on slower networks.
- Expected impact level: high
- Recommended improvement: Enable Brotli/gzip compression for text assets.
- Confidence level: high

### Issue N
- What the issue is: Worker re-creates Plaid client/configuration every request.
- Where it is: `neurowealth/worker/src/index.js:92-104` in `fetch` handler.
- Why it hurts performance: Repeated setup object allocation and initialization overhead per request.
- Expected impact level: medium
- Recommended improvement: Reuse lazily initialized client per isolate/environment.
- Confidence level: high

### Issue O
- What the issue is: API fetches that could run in parallel are sequential.
- Where it is: `neurowealth/plaid-client.js:182-197` (`holdings` then `transactions`); `worker/src/index.js:147-148` (`watchlist` then `chat_sessions`).
- Why it hurts performance: Increases end-to-end latency by summing request times.
- Expected impact level: medium
- Recommended improvement: Use `Promise.all` where data dependencies do not require serial order.
- Confidence level: high

### Issue P (hypothesis)
- What the issue is: `simple-server.js` may be used beyond local dev while enforcing no-cache and full-buffer proxy behavior.
- Where it is: `neurowealth/simple-server.js`.
- Why it hurts performance: If deployed or shared in staging/prod, it materially reduces cache efficiency and increases memory use.
- Expected impact level: high (if used in production), low (if dev-only)
- Recommended improvement: Confirm runtime role; apply production-grade static/proxy behavior or isolate to local tooling.
- Confidence level: medium (deployment role unclear)

## 5. Database/query performance findings
No relational database queries are present in the inspected codebase. Data access paths are Worker KV and browser storage.

### Issue Q
- What the issue is: Worker KV reads are per-request and sometimes sequential.
- Where it is: `worker/src/index.js` user-data route (`watchlist`, `chat_sessions`), Plaid session lookups per route.
- Why it hurts performance: Additional round-trips within request lifecycle increase p95 latency.
- Expected impact level: medium
- Recommended improvement: Parallelize independent KV gets; cache hot profile/session metadata for request scope.
- Confidence level: high

### Issue R
- What the issue is: Large objects repeatedly serialized to localStorage on main thread.
- Where it is: `backtest.js` run/version storage (`pp_backtest_runs_v1`, `pp_backtest_versions_v1`), `ai-widget.js` session persistence, `paper-execution.js` state/event writes.
- Why it hurts performance: `JSON.stringify` + localStorage I/O is synchronous and blocks UI thread.
- Expected impact level: medium
- Recommended improvement: Batch/debounce writes, store compact snapshots, move larger history to IndexedDB.
- Confidence level: high

## 6. Build/bundle/runtime performance findings

### Issue S
- What the issue is: Large runtime dependencies included in production dependencies.
- Where it is: `neurowealth/package.json` includes `playwright` and `@playwright/test` under `dependencies`.
- Why it hurts performance: Slower install/build/deploy footprint and larger runtime environment.
- Expected impact level: medium
- Recommended improvement: Move test tooling to `devDependencies`.
- Confidence level: high

### Issue T
- What the issue is: Repository includes heavy generated/vendor artifacts not ignored.
- Where it is: `.gitignore` only ignores 3 files; committed dirs include `neurowealth/node_modules` (~30.3 MB), `neurowealth/worker/node_modules` (~143.1 MB), `neurowealth/worker/.wrangler` (~29.3 MB), screenshots (~25.3 MB).
- Why it hurts performance: Slower CI checkout, larger Docker/build context, slower tooling scans.
- Expected impact level: high
- Recommended improvement: Ignore generated/vendor assets and keep install/build artifacts out of VCS.
- Confidence level: high

### Issue U
- What the issue is: Backtest engine does expensive nested indicator calculations in JS loops.
- Where it is: `backtest-engine.js` in `generateSignalVolBreakout` (`computeATR` called in nested loops around lines 129-134, 152+); additional repeated ATR loops in diagnostics.
- Why it hurts performance: Increased CPU cost for large candle arrays and sweep/discovery runs.
- Expected impact level: high
- Recommended improvement: Precompute rolling indicators once per series and reuse.
- Confidence level: high

### Issue V
- What the issue is: Fallback OHLC dataset parse/filter appears uncached per fetch path.
- Where it is: `backtest-engine.js:589-629` loads/parses `/exports/btc_4h_2019_2024.json` (~1.44 MB) then maps+filters.
- Why it hurts performance: Repeated large JSON parse and object allocation.
- Expected impact level: medium
- Recommended improvement: Cache parsed dataset in-memory and reuse filtered views.
- Confidence level: high

### Issue W
- What the issue is: Data feed polling uses `setInterval` with async fetch and no in-flight guard.
- Where it is: `data-feed.js:185` async `poll`, scheduled by `setInterval` at `221`.
- Why it hurts performance: Can overlap requests if network lag exceeds cadence, causing redundant work.
- Expected impact level: medium
- Recommended improvement: Use self-scheduling `setTimeout` after poll completion or in-flight lock.
- Confidence level: medium (cadence currently 45s in adapter defaults)

## 7. Quick wins vs deep improvements

### Quick wins
1. Remove missing script include (`backtest.html:2035`).
2. Add response caching policy for static assets in `simple-server.js`.
3. Move Playwright packages to `devDependencies`.
4. Wrap logging in debug gates and disable in production.
5. Replace `innerHTML +=` loops with single-pass render assignments.
6. Parallelize independent API/KV requests.

### Deep improvements
1. Route-based code splitting to replace global monolith loading.
2. Consolidate frontend boot into capability-driven startup map.
3. Redesign auth validation path to avoid remote token check per call.
4. Precompute/memoize indicator series in backtest engine.
5. Replace heavy localStorage history writes with IndexedDB + background batching.

## 8. Ranked action plan from biggest speed gain to smallest
1. Split `script.js` and backtest stack into route-specific bundles with deferred loading.
2. Fix caching strategy (remove global `no-store` for static assets; add immutable cache for hashed assets).
3. Eliminate per-request Google tokeninfo network validation in Worker.
4. Reduce backtest CPU by precomputing ATR/SMA/RSI series and reusing in signal generation.
5. Add compression (Brotli/gzip) on static and API responses.
6. Remove large generated/vendor artifacts from VCS and CI contexts.
7. Cache parsed fallback OHLC dataset in memory.
8. Replace repeated `innerHTML +=` patterns with batched DOM updates.
9. Gate or strip production logging in hot paths.
10. Parallelize holdings/transactions and KV retrieval calls.
11. Add in-flight guard to async polling loops.
12. Migrate large synchronous localStorage writes to batched/async storage strategy.

## 9. Issue catalog with required fields
All issues above include:
- what the issue is
- where it is
- why it hurts performance
- expected impact level
- recommended improvement
- confidence level

## Top 10 Performance Improvements To Implement First
1. Route-level bundling and lazy loading for `script.js`/backtest stack.
2. Re-enable proper static asset caching (`Cache-Control` strategy).
3. Remove remote token validation on every Worker request.
4. Precompute indicators in backtest engine to cut CPU loops.
5. Enable compression on Express/static responses.
6. Remove committed `node_modules`/`.wrangler`/heavy generated artifacts from repo.
7. Cache parsed fallback candle dataset in memory.
8. Replace `innerHTML +=` render loops with batched rendering.
9. Remove/guard hot-path `console.log` calls.
10. Parallelize independent network/KV fetches.
