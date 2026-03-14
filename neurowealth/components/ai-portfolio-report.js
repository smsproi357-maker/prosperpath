/**
 * ai-portfolio-report.js
 *
 * Portfolio AI report generator.
 *
 * ARCHITECTURE:
 * - Reuses the EXISTING Worker AI endpoint: POST ${workerUrl}/ai/chat
 * - This is the exact same endpoint used by the AI Chat widget (ai-widget.js).
 * - No new server endpoints, no new AI providers, no duplicate infrastructure.
 * - Sends messages[] in the Sarvam-compatible format (system prompt merged into first user turn).
 *
 * FLOW:
 *   1. Normalize window.portfolioData
 *   2. PortfolioAnalysis.compute() → deterministic metrics
 *   3. PortfolioScenarios.compute() → scenario stress test
 *   4. Build structured AI messages payload
 *   5. Check localStorage cache (key = portfolioHash)
 *   6. If cache miss → POST ${workerUrl}/ai/chat → save to cache
 *   7. Return report text string
 *
 * Exposed as: window.AIPortfolioReport = { generate, clearCache }
 */

'use strict';

(function () {

    const CACHE_KEY_PREFIX = 'pp_portfolio_report_';
    const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

    /**
     * Compute a lightweight hash of the portfolio state.
     * Changes when holdings, prices, or chains change materially.
     */
    function computePortfolioHash(metrics) {
        const sig = [
            metrics.portfolioSource,
            metrics.totalPortfolioValueUsd.toFixed(0),
            metrics.totalAssets,
            metrics.totalChains,
            metrics.pricedAssetsCount,
            (metrics.largestHolding?.symbol || ''),
            (metrics.largestHolding?.percent || 0).toFixed(1),
            metrics.dominantChain,
        ].join('|');

        // Simple hash — good enough for a soft cache key
        let hash = 0;
        for (let i = 0; i < sig.length; i++) {
            hash = (Math.imul(31, hash) + sig.charCodeAt(i)) | 0;
        }
        return (hash >>> 0).toString(16);
    }

    function getCacheKey(hash) {
        return CACHE_KEY_PREFIX + hash;
    }

    function loadFromCache(hash) {
        try {
            const raw = localStorage.getItem(getCacheKey(hash));
            if (!raw) return null;
            const entry = JSON.parse(raw);
            if (Date.now() - entry.savedAt > CACHE_TTL_MS) {
                localStorage.removeItem(getCacheKey(hash));
                return null;
            }
            return entry;
        } catch {
            return null;
        }
    }

    function saveToCache(hash, report, metrics) {
        try {
            const entry = {
                report,
                savedAt: Date.now(),
                totalPortfolioValueUsd: metrics.totalPortfolioValueUsd,
                portfolioSource: metrics.portfolioSource,
            };
            localStorage.setItem(getCacheKey(hash), JSON.stringify(entry));
        } catch (e) {
            console.warn('[AIPortfolioReport] Cache save failed:', e.message);
        }
    }

    /**
     * Build the structured system prompt (injected as Sarvam-compatible user prefix).
     */
    function buildSystemPrompt() {
        return `You are a professional portfolio analyst specializing in crypto and digital asset portfolios.
Generate a structured institutional-grade portfolio intelligence report.
Follow these strict rules:
- Output EXACTLY 9 sections in this exact order, using these exact section headers:
  ## 1. Portfolio Overview
  ## 2. Allocation Analysis
  ## 3. Risk Analysis
  ## 4. Liquidity Assessment
  ## 5. Market Exposure
  ## 6. Scenario Stress Testing
  ## 7. Portfolio Strengths
  ## 8. Portfolio Risks
  ## 9. Suggested Improvements
- Every insight must reference numeric evidence from the provided dataset.
- Do NOT make price predictions.
- Do NOT use vague motivational language or generic financial advice.
- Frame scenario analysis as sensitivity analysis, not forecasts.
- Be concise, analytical, and precise. Institutional tone throughout.
- Each section: 3-6 sentences minimum, evidence-backed.
- Scenario section must list specific numeric impacts from the scenario data.`;
    }

    /**
     * Build the user prompt with all deterministic metrics embedded.
     */
    function buildUserPrompt(metrics, scenarios) {
        const m = metrics;
        const sc = scenarios;

        const formatUsd = v => '$' + parseFloat(v || 0).toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 });
        const formatPct = v => parseFloat(v || 0).toFixed(2) + '%';

        const chainLines = Object.entries(m.chainExposure || {})
            .map(([c, d]) => `  - ${c}: ${formatUsd(d.valueUsd)} (${formatPct(d.percent)})`)
            .join('\n');

        const topHoldingLines = (m.topHoldings || []).slice(0, 8)
            .map((h, i) => `  ${i + 1}. ${h.symbol} — ${formatUsd(h.valueUsd)} (${formatPct(h.percent)}) [${h.chain || 'unknown chain'}] [${h.pricingSource || 'unknown pricing'}]`)
            .join('\n');

        const scenarioLines = (sc.scenarios || [])
            .map(s => `  - ${s.label}: exposure=${formatPct(s.exposurePercent)}, portfolio impact=${formatPct(s.portfolioImpactPercent)} (${formatUsd(s.portfolioImpactUsd)})`)
            .join('\n');

        return `[System Instructions: ${buildSystemPrompt()}]

Generate a portfolio intelligence report for the following portfolio.

=== PORTFOLIO DATASET ===

SOURCE: ${m.portfolioSource === 'wallet' ? 'On-chain crypto wallet' : 'Brokerage / Plaid account'}${m.isMultichain ? ' (multichain)' : ''}
GENERATED AT: ${m.generatedAt}
${m.walletAddress ? `WALLET: ${m.walletAddress.slice(0, 8)}...${m.walletAddress.slice(-6)}` : ''}

--- CORE METRICS ---
Total Portfolio Value: ${formatUsd(m.totalPortfolioValueUsd)}
Total Assets: ${m.totalAssets}
Total Chains: ${m.totalChains}
Priced Assets: ${m.pricedAssetsCount} / ${m.totalAssets} (${formatPct(m.pricingCoveragePercent)} pricing coverage)
Unpriced Assets: ${m.unpricedAssetsCount}${m.unpricedHoldingSymbols ? ` (${m.unpricedHoldingSymbols})` : ''}
Fallback-Priced Assets: ${m.fallbackPricedCount} (via DexScreener — lower reliability)

--- CONCENTRATION ---
Largest Holding: ${m.largestHolding ? `${m.largestHolding.symbol} — ${formatUsd(m.largestHolding.valueUsd)} (${formatPct(m.largestHolding.percent)} of portfolio)` : 'N/A'}
Top 3 Concentration: ${formatPct(m.top3ConcentrationPercent)}
Top 5 Concentration: ${formatPct(m.top5ConcentrationPercent)}

--- CHAIN EXPOSURE ---
Dominant Chain: ${m.dominantChain || 'N/A'} (${formatPct(m.dominantChainPercent)})
${chainLines || '  None detected'}

--- MARKET EXPOSURE (% of priced portfolio value) ---
BTC Exposure: ${formatPct(m.marketExposure?.btcExposurePercent)} (${formatUsd(m.marketExposure?.btcExposureUsd)})
ETH Exposure: ${formatPct(m.marketExposure?.ethExposurePercent)} (${formatUsd(m.marketExposure?.ethExposureUsd)})
Stablecoin Exposure: ${formatPct(m.marketExposure?.stablecoinExposurePercent)} (${formatUsd(m.marketExposure?.stablecoinExposureUsd)})
Tokenized Assets (RWA): ${formatPct(m.marketExposure?.rwaExposurePercent)} (${formatUsd(m.marketExposure?.rwaExposureUsd)})
Layer-1 Alts Exposure: ${formatPct(m.marketExposure?.layer1AltExposurePercent)} (${formatUsd(m.marketExposure?.layer1AltExposureUsd)})
Other: ${formatPct(m.marketExposure?.otherExposurePercent)} (${formatUsd(m.marketExposure?.otherExposureUsd)})

--- LIQUIDITY QUALITY ---
High Liquidity: ${m.liquiditySummary?.highLiquidityAssetsCount} assets (primary exchange pricing)
Medium Liquidity: ${m.liquiditySummary?.mediumLiquidityAssetsCount} assets
Low Liquidity: ${m.liquiditySummary?.lowLiquidityAssetsCount} assets (thin on-chain markets)
Unknown Liquidity: ${m.liquiditySummary?.unknownLiquidityAssetsCount} assets (unpriced)

--- TOP HOLDINGS ---
${topHoldingLines || '  No priced holdings'}

--- SCENARIO STRESS TESTING (sensitivity analysis, not forecast) ---
${scenarioLines || '  No volatile exposure detected — scenarios not applicable'}
Best case scenario: ${sc.bestCaseScenario ? `${sc.bestCaseScenario.label} → portfolio ${sc.bestCaseScenario.portfolioImpactPercent > 0 ? '+' : ''}${formatPct(sc.bestCaseScenario.portfolioImpactPercent)} (${formatUsd(sc.bestCaseScenario.portfolioImpactUsd)})` : 'N/A'}
Worst case scenario: ${sc.worstCaseScenario ? `${sc.worstCaseScenario.label} → portfolio ${formatPct(sc.worstCaseScenario.portfolioImpactPercent)} (${formatUsd(sc.worstCaseScenario.portfolioImpactUsd)})` : 'N/A'}

=== END DATASET ===

Generate the 9-section institutional portfolio report now. Start directly with ## 1. Portfolio Overview.`;
    }

    /**
     * Call the existing Worker AI endpoint.
     * Uses the same fetch pattern as ai-widget.js sendMessage().
     */
    async function callWorkerAI(messages) {
        const workerUrl = window.WORKER_API_URL || 'https://neurowealth-worker.smsproi357.workers.dev/api';

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 60000); // 60s timeout for long report

        try {
            const response = await fetch(`${workerUrl}/ai/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages,
                    model: 'google/gemma-3-27b-it:free', // preferred model; Worker may override
                    webMode: false, // no web search needed — all data is in the payload
                }),
                signal: controller.signal,
            });

            clearTimeout(timeout);

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.error || `AI worker HTTP ${response.status}`);
            }

            const data = await response.json();
            if (!data.choices?.length) throw new Error('Invalid AI response structure');

            return data.choices[0].message.content || '';
        } catch (err) {
            clearTimeout(timeout);
            throw err;
        }
    }

    /**
     * Main generate function.
     *
     * @param {object} opts
     * @param {boolean} opts.forceRegenerate — bypass cache
     * @param {function} opts.onStatus — callback(statusText) for loading state updates
     * @returns {Promise<{ report: string, metrics: object, fromCache: boolean, hash: string }>}
     */
    async function generate({ forceRegenerate = false, onStatus = null } = {}) {

        const statusUpdate = (msg) => {
            if (typeof onStatus === 'function') onStatus(msg);
            console.info('[AIPortfolioReport]', msg);
        };

        // ── 1. Validate portfolio data ─────────────────────────────────────────
        if (!window.portfolioData) {
            throw new Error('No portfolio data available. Please connect a wallet or brokerage account first.');
        }

        // ── 2. Compute deterministic metrics ──────────────────────────────────
        statusUpdate('Preparing portfolio metrics...');

        if (!window.PortfolioAnalysis) throw new Error('PortfolioAnalysis module not loaded');
        if (!window.PortfolioScenarios) throw new Error('PortfolioScenarios module not loaded');

        const metrics = window.PortfolioAnalysis.compute(window.portfolioData);

        if (metrics.totalAssets === 0) {
            throw new Error('Portfolio is empty — no holdings found to analyze.');
        }

        const scenarios = window.PortfolioScenarios.compute(metrics);

        // ── 3. Check cache (unless forced regeneration) ────────────────────────
        const hash = computePortfolioHash(metrics);

        if (!forceRegenerate) {
            const cached = loadFromCache(hash);
            if (cached) {
                statusUpdate('Loaded from cache.');
                return {
                    report: cached.report,
                    metrics,
                    scenarios,
                    fromCache: true,
                    hash,
                    cachedAt: new Date(cached.savedAt).toISOString(),
                };
            }
        }

        // ── 4. Build AI messages ───────────────────────────────────────────────
        statusUpdate('Generating AI report...');

        const userPrompt = buildUserPrompt(metrics, scenarios);
        const messages = [{ role: 'user', content: userPrompt }];

        // ── 5. Call AI ─────────────────────────────────────────────────────────
        const reportText = await callWorkerAI(messages);

        if (!reportText || reportText.trim().length < 100) {
            throw new Error('AI returned an empty or too-short report. Please try regenerating.');
        }

        // ── 6. Cache result ────────────────────────────────────────────────────
        saveToCache(hash, reportText, metrics);

        return {
            report: reportText,
            metrics,
            scenarios,
            fromCache: false,
            hash,
        };
    }

    /**
     * Clear all cached portfolio reports.
     */
    function clearCache() {
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith(CACHE_KEY_PREFIX)) keys.push(k);
        }
        keys.forEach(k => localStorage.removeItem(k));
        console.info('[AIPortfolioReport] Cache cleared.');
    }

    window.AIPortfolioReport = { generate, clearCache };

    console.info('[AIPortfolioReport] AI report generator loaded. Uses existing Worker AI endpoint.');

})();
