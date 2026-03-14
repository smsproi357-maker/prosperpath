/**
 * PortfolioHubAIOverview.js
 *
 * Hub-level AI overview card — driven by PortfolioAggregator output.
 * This is a shorter, higher-level analysis than the per-portfolio AI report.
 *
 * Exposed as: window.PortfolioHubAIOverview
 */
'use strict';

(function () {
    const LOG = '[PortfolioHubAIOverview]';
    let _pending = false;
    let _lastHashKey = null;

    function buildPrompt(ag) {
        const topAlloc = Object.entries(ag.combinedAllocation || {})
            .sort((a, b) => b[1] - a[1]).slice(0, 5)
            .map(([s, v]) => `${s}: $${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}`).join(', ');
        const sources = Object.entries(ag.combinedSourceExposure || {})
            .map(([s, v]) => `${s}: $${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}`).join(', ');
        const largest = ag.largestPortfolio;
        const largestHolding = ag.largestHoldingOverall;

        return `You are a professional wealth advisor reviewing a user's combined investment portfolio across multiple connected accounts.

Portfolio Aggregate Summary:
- Total Value: $${(ag.totalPortfolioValueUsd || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}
- Connected Portfolios: ${ag.connectedPortfoliosCount}
- Total Assets: ${ag.totalAssetsCount} (${ag.pricedAssetsCount} priced, ${ag.unpricedAssetsCount} unpriced)
- Pricing Coverage: ${ag.pricingCoveragePercent}%
- Total Chains: ${ag.totalChainsCount}
${largest ? `- Largest Portfolio: ${largest.displayName || largest.providerName} ($${(largest.totalValueUsd || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })})` : ''}
${largestHolding ? `- Largest Single Holding: ${largestHolding.symbol || 'Unknown'} ($${(largestHolding.valueUsd || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })})` : ''}
${topAlloc ? `- Top Holdings: ${topAlloc}` : ''}
${sources ? `- Source Distribution: ${sources}` : ''}

Provide a concise portfolio intelligence overview structured exactly with these 4 sections:
Summary
Concentration
Pricing Quality
Data Gaps

For each section, output the header exactly as written above on its own line, followed by ONE concise sentence on the next line.
Example:
Summary
Your portfolio spans 1 connected source with a total value of $10.
Concentration
Largest position is SLVon at 35%.

Do not use markdown formatting like bolding or bullet points.`;
    }

    function textToHtml(text) {
        let html = '';
        const lines = text.split('\n').filter(l => l.trim());
        const headers = ['Summary', 'Concentration', 'Pricing Quality', 'Data Gaps'];
        
        for (let l of lines) {
            let clean = l.replace(/[\*#-]/g, '').trim();
            let isHeader = headers.some(h => clean.toLowerCase().includes(h.toLowerCase()) && clean.length < h.length + 5);
            
            if (isHeader) {
                let headerText = clean.endsWith(':') ? clean.slice(0, -1) : clean;
                html += `<div style="margin-top:12px;margin-bottom:2px;font-size:0.75rem;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;font-weight:700;">${headerText}</div>`;
            } else {
                html += `<div style="margin:0 0 12px;font-size:0.92rem;line-height:1.5;color:#f1f5f9;">${l}</div>`;
            }
        }
        return html;
    }

    function fallbackContent(ag) {
        const topEntry = Object.entries(ag.combinedAllocation || {}).sort((a, b) => b[1] - a[1])[0];
        const topName = topEntry ? topEntry[0] : 'None';
        const topPct = topEntry && ag.totalPortfolioValueUsd > 0 ? ((topEntry[1] / ag.totalPortfolioValueUsd) * 100).toFixed(0) : 0;
        
        const lines = [
            'Summary',
            `Your portfolio spans ${ag.connectedPortfoliosCount} connected source${ag.connectedPortfoliosCount !== 1 ? 's' : ''} with a total value of $${(ag.totalPortfolioValueUsd || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}.`,
            'Concentration',
            topEntry ? `Largest position is ${topName} at ${topPct}%.` : 'No significant concentrations detected.',
            'Pricing Quality',
            `${ag.pricingCoveragePercent}% of assets have reliable pricing.`,
            'Data Gaps',
            ag.unpricedAssetsCount > 0 ? `${ag.unpricedAssetsCount} asset${ag.unpricedAssetsCount === 1 ? ' is' : 's are'} missing pricing data.` : 'No pricing data gaps detected.'
        ];
        return textToHtml(lines.join('\n'));
    }

    async function render(containerId, aggregate) {
        const container = document.getElementById(containerId);
        if (!container) return;
        if ((aggregate.connectedPortfoliosCount || 0) === 0) { container.innerHTML = ''; return; }

        const hashKey = `${ag => ag.totalPortfolioValueUsd | 0}:${aggregate.connectedPortfoliosCount}:${aggregate.pricedAssetsCount}`.replace(/ag =>.+:/, `${aggregate.totalPortfolioValueUsd | 0}:`);
        const hashKeyFinal = `${aggregate.totalPortfolioValueUsd | 0}:${aggregate.connectedPortfoliosCount}:${aggregate.pricedAssetsCount}`;
        if (_pending || hashKeyFinal === _lastHashKey) return;
        _pending = true;
        _lastHashKey = hashKeyFinal;

        container.innerHTML = `
            <div class="ph-ai-overview-card">
                <div class="ph-ai-header">
                    <span class="ph-ai-icon">🤖</span>
                    <span class="ph-ai-title">Portfolio Intelligence Overview</span>
                    <span class="ph-ai-badge">AI</span>
                </div>
                <div id="ph-ai-body" class="ph-ai-body">
                    <div class="ph-ai-loading">
                        <div class="ph-ai-spinner"></div>
                        <span style="font-size:0.83rem;color:#64748b;">Analyzing your combined portfolio…</span>
                    </div>
                </div>
            </div>`;

        const bodyEl = container.querySelector('#ph-ai-body');

        // Try server-side AI endpoint
        // Use absolute Worker URL — relative /api/* paths don't work on
        // prosperpath.pages.dev (Cloudflare Pages CDN, not the Worker).
        const _workerApi = window.WORKER_API_URL ||
            'https://neurowealth-worker.smsproi357.workers.dev/api';
        try {
            const payload = { prompt: buildPrompt(aggregate), type: 'hub_overview', context: aggregate };
            let resp = await fetch(`${_workerApi}/ai-overview`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (!resp.ok && resp.status === 404) {
                resp = await fetch(`${_workerApi}/analyze`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
            }
            if (!resp.ok) throw new Error(`API ${resp.status}`);
            const data = await resp.json();
            const text = data.analysis || data.text || data.content || data.message || '';
            if (!text) throw new Error('empty response');
            if (bodyEl) bodyEl.innerHTML = `<div class="ph-ai-content">${textToHtml(text)}</div>`;
        } catch (err) {
            console.info(LOG, 'AI endpoint unavailable — using rule-based fallback.', err.message);
            if (bodyEl) bodyEl.innerHTML = `<div class="ph-ai-content">${fallbackContent(aggregate)}</div>`;
        } finally {
            _pending = false;
        }
    }

    window.PortfolioHubAIOverview = { render };
    console.info(LOG, 'Loaded.');
})();
