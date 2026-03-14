/**
 * PortfolioReportPanel.js
 *
 * Premium dark glassmorphism UI panel for displaying the AI Portfolio Intelligence Report.
 *
 * Features:
 * - Full-screen overlay with glassmorphism card
 * - Loading states (metrics → AI generation)
 * - 9-section structured rendering with markdown support
 * - Close, Regenerate, and Download (clipboard copy) buttons
 * - Graceful error states
 * - Keyboard accessible (Escape closes)
 *
 * Exposed as: window.PortfolioReportPanel = { open, close }
 */

'use strict';

(function () {

    const PANEL_ID = 'pp-report-overlay';

    // ─────────────────────────────────────────────────────────────────────────
    // Inject panel styles (self-contained so no styles.css dependency for core layout)
    // ─────────────────────────────────────────────────────────────────────────

    function injectStyles() {
        if (document.getElementById('pp-report-styles')) return;
        const style = document.createElement('style');
        style.id = 'pp-report-styles';
        style.textContent = `
            #pp-report-overlay {
                position: fixed;
                inset: 0;
                z-index: 9000;
                background: rgba(0, 0, 0, 0.82);
                backdrop-filter: blur(6px);
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 20px;
                animation: ppFadeIn 0.25s ease;
                overflow-y: auto;
            }
            #pp-report-overlay.hidden { display: none; }

            @keyframes ppFadeIn {
                from { opacity: 0; }
                to   { opacity: 1; }
            }
            @keyframes ppSlideUp {
                from { opacity: 0; transform: translateY(30px); }
                to   { opacity: 1; transform: translateY(0); }
            }

            .pp-report-card {
                background: linear-gradient(180deg, rgba(20,20,28,0.98) 0%, rgba(15,15,22,0.99) 100%);
                border: 1px solid rgba(212,175,55,0.25);
                border-radius: 18px;
                width: 100%;
                max-width: 900px;
                max-height: 90vh;
                overflow-y: auto;
                padding: 40px 44px 36px;
                position: relative;
                animation: ppSlideUp 0.3s ease;
                box-shadow: 0 24px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(212,175,55,0.08);
                scrollbar-width: thin;
                scrollbar-color: rgba(212,175,55,0.2) transparent;
            }
            .pp-report-card::-webkit-scrollbar { width: 5px; }
            .pp-report-card::-webkit-scrollbar-track { background: transparent; }
            .pp-report-card::-webkit-scrollbar-thumb { background: rgba(212,175,55,0.2); border-radius: 10px; }

            .pp-report-header {
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
                margin-bottom: 28px;
                padding-bottom: 20px;
                border-bottom: 1px solid rgba(212,175,55,0.15);
            }
            .pp-report-title {
                font-size: 1.5rem;
                font-weight: 700;
                color: #fff;
                letter-spacing: -0.02em;
                line-height: 1.2;
            }
            .pp-report-subtitle {
                font-size: 0.78rem;
                color: #64748b;
                margin-top: 5px;
                font-weight: 400;
            }
            .pp-report-subtitle strong { color: #94a3b8; }

            .pp-report-close {
                background: none;
                border: 1px solid rgba(255,255,255,0.12);
                color: #94a3b8;
                width: 34px;
                height: 34px;
                border-radius: 8px;
                cursor: pointer;
                font-size: 1.2rem;
                display: flex;
                align-items: center;
                justify-content: center;
                flex-shrink: 0;
                transition: border-color 0.2s, color 0.2s;
                margin-top: 2px;
            }
            .pp-report-close:hover { border-color: rgba(239,68,68,0.4); color: #f87171; }

            /* Loading state */
            .pp-report-loading {
                text-align: center;
                padding: 60px 20px;
            }
            .pp-report-spinner {
                width: 44px;
                height: 44px;
                border: 3px solid rgba(212,175,55,0.1);
                border-top-color: #D4AF37;
                border-radius: 50%;
                animation: ppSpin 0.8s linear infinite;
                margin: 0 auto 20px;
            }
            @keyframes ppSpin { to { transform: rotate(360deg); } }
            .pp-report-loading-text {
                color: #94a3b8;
                font-size: 0.95rem;
            }
            .pp-report-loading-sub {
                color: #475569;
                font-size: 0.8rem;
                margin-top: 6px;
            }

            /* Error state */
            .pp-report-error {
                background: rgba(239,68,68,0.06);
                border: 1px solid rgba(239,68,68,0.2);
                border-radius: 10px;
                padding: 20px 22px;
                color: #fca5a5;
                font-size: 0.9rem;
                line-height: 1.5;
            }
            .pp-report-error strong { color: #f87171; }

            /* Body (rendered report) */
            .pp-report-body {
                color: #e2e8f0;
                line-height: 1.7;
                font-size: 0.925rem;
            }

            /* Section headers */
            .pp-report-body h2,
            .pp-report-body h3 {
                color: #fff;
                font-size: 1.05rem;
                font-weight: 700;
                margin: 28px 0 10px;
                padding-bottom: 8px;
                border-bottom: 1px solid rgba(212,175,55,0.12);
                letter-spacing: -0.01em;
            }
            .pp-report-body h2:first-child,
            .pp-report-body h3:first-child { margin-top: 0; }

            /* Section number accent */
            .pp-report-section-num {
                display: inline-block;
                font-size: 0.7rem;
                font-weight: 700;
                color: #D4AF37;
                background: rgba(212,175,55,0.08);
                border: 1px solid rgba(212,175,55,0.2);
                border-radius: 6px;
                padding: 1px 7px;
                margin-right: 8px;
                vertical-align: middle;
            }

            .pp-report-body p { margin: 0 0 12px; }
            .pp-report-body ul, .pp-report-body ol {
                padding-left: 20px;
                margin: 0 0 12px;
            }
            .pp-report-body li { margin-bottom: 5px; }
            .pp-report-body strong { color: #f1f5f9; }

            /* Metric highlight */
            .pp-report-body code {
                background: rgba(212,175,55,0.08);
                border: 1px solid rgba(212,175,55,0.15);
                border-radius: 4px;
                padding: 0 5px;
                font-size: 0.85em;
                color: #D4AF37;
                font-family: monospace;
            }

            /* Actions footer */
            .pp-report-actions {
                display: flex;
                gap: 10px;
                margin-top: 30px;
                padding-top: 20px;
                border-top: 1px solid rgba(255,255,255,0.06);
                flex-wrap: wrap;
            }
            .pp-report-btn {
                padding: 8px 18px;
                border-radius: 8px;
                font-size: 0.85rem;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s;
                border: none;
            }
            .pp-report-btn-primary {
                background: rgba(212,175,55,0.12);
                border: 1px solid rgba(212,175,55,0.3);
                color: #D4AF37;
            }
            .pp-report-btn-primary:hover { background: rgba(212,175,55,0.2); }
            .pp-report-btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }
            .pp-report-btn-secondary {
                background: rgba(255,255,255,0.04);
                border: 1px solid rgba(255,255,255,0.1);
                color: #94a3b8;
            }
            .pp-report-btn-secondary:hover { background: rgba(255,255,255,0.08); color: #e2e8f0; }

            .pp-report-cache-badge {
                display: inline-flex;
                align-items: center;
                gap: 5px;
                font-size: 0.72rem;
                font-weight: 600;
                padding: 2px 9px;
                border-radius: 20px;
                background: rgba(99,102,241,0.08);
                border: 1px solid rgba(99,102,241,0.2);
                color: #a5b4fc;
                margin-left: auto;
                align-self: center;
            }
            .pp-report-copy-success {
                color: #4ade80 !important;
                border-color: rgba(74,222,128,0.3) !important;
                background: rgba(74,222,128,0.06) !important;
            }

            @media (max-width: 640px) {
                .pp-report-card { padding: 24px 18px 20px; max-height: 95vh; }
                .pp-report-title { font-size: 1.2rem; }
            }
        `;
        document.head.appendChild(style);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Markdown-like renderer (no external dependencies)
    // Handles: ## headings, **bold**, `code`, bullet lists, paragraphs
    // ─────────────────────────────────────────────────────────────────────────

    function renderMarkdown(text) {
        if (!text) return '';

        const sectionLabels = [
            '', 'Portfolio Overview', 'Allocation Analysis', 'Risk Analysis',
            'Liquidity Assessment', 'Market Exposure', 'Scenario Stress Testing',
            'Portfolio Strengths', 'Portfolio Risks', 'Suggested Improvements'
        ];

        const lines = text.split('\n');
        let html = '';
        let inList = false;

        for (let line of lines) {
            // Check for section headings (## N. or ## 1. etc.)
            const h2Match = line.match(/^#{1,3}\s+(\d+)\.\s+(.+)/);
            if (h2Match) {
                if (inList) { html += '</ul>'; inList = false; }
                const num = parseInt(h2Match[1]);
                const label = h2Match[2].trim();
                html += `<h2><span class="pp-report-section-num">${num}</span>${escapeHtml(label)}</h2>`;
                continue;
            }

            const hMatch = line.match(/^#{1,3}\s+(.+)/);
            if (hMatch) {
                if (inList) { html += '</ul>'; inList = false; }
                html += `<h3>${escapeHtml(hMatch[1].trim())}</h3>`;
                continue;
            }

            // Bullet list
            const listMatch = line.match(/^[-*•]\s+(.+)/);
            if (listMatch) {
                if (!inList) { html += '<ul>'; inList = true; }
                html += `<li>${inlineFormat(listMatch[1])}</li>`;
                continue;
            }

            // Ordered list
            const olMatch = line.match(/^\d+\.\s+(.+)/);
            if (olMatch) {
                if (!inList) { html += '<ul>'; inList = true; }
                html += `<li>${inlineFormat(olMatch[1])}</li>`;
                continue;
            }

            if (inList) { html += '</ul>'; inList = false; }

            const trimmed = line.trim();
            if (trimmed === '') {
                html += '';
            } else {
                html += `<p>${inlineFormat(trimmed)}</p>`;
            }
        }
        if (inList) html += '</ul>';

        return html;
    }

    function inlineFormat(text) {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            .replace(/\*([^*]+)\*/g, '<em>$1</em>');
    }

    function escapeHtml(s) {
        return String(s || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Panel DOM management
    // ─────────────────────────────────────────────────────────────────────────

    function getOrCreateOverlay() {
        let el = document.getElementById(PANEL_ID);
        if (!el) {
            el = document.createElement('div');
            el.id = PANEL_ID;
            el.className = 'hidden';
            document.body.appendChild(el);
        }
        return el;
    }

    function showOverlay() {
        const el = getOrCreateOverlay();
        el.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    }

    function hideOverlay() {
        const el = document.getElementById(PANEL_ID);
        if (el) el.classList.add('hidden');
        document.body.style.overflow = '';
    }

    function renderCard(content) {
        const overlay = getOrCreateOverlay();
        overlay.innerHTML = content;
        showOverlay();

        // Close on overlay background click
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) close();
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Public: open
    // ─────────────────────────────────────────────────────────────────────────

    async function open({ forceRegenerate = false } = {}) {
        injectStyles();
        showLoadingState('Preparing portfolio metrics...');

        // Keyboard close
        const escHandler = (e) => {
            if (e.key === 'Escape') { close(); document.removeEventListener('keydown', escHandler); }
        };
        document.addEventListener('keydown', escHandler);

        try {
            const result = await window.AIPortfolioReport.generate({
                forceRegenerate,
                onStatus: (msg) => updateLoadingText(msg),
            });

            renderReport(result);
        } catch (err) {
            renderError(err.message);
        }
    }

    function close() {
        hideOverlay();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Loading state
    // ─────────────────────────────────────────────────────────────────────────

    function showLoadingState(msg) {
        renderCard(`
            <div class="pp-report-card">
                <div class="pp-report-header">
                    <div>
                        <div class="pp-report-title">⚡ AI Portfolio Intelligence Report</div>
                        <div class="pp-report-subtitle">Analyzing your portfolio data...</div>
                    </div>
                    <button class="pp-report-close" id="pp-close-btn" onclick="window.PortfolioReportPanel.close()">✕</button>
                </div>
                <div class="pp-report-loading" id="pp-loading-state">
                    <div class="pp-report-spinner"></div>
                    <div class="pp-report-loading-text" id="pp-loading-text">${escapeHtml(msg)}</div>
                    <div class="pp-report-loading-sub">This may take 15–30 seconds. The AI is reading your portfolio data and generating a structured report.</div>
                </div>
            </div>
        `);
    }

    function updateLoadingText(msg) {
        const el = document.getElementById('pp-loading-text');
        if (el) el.textContent = msg;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Error state
    // ─────────────────────────────────────────────────────────────────────────

    function renderError(msg) {
        renderCard(`
            <div class="pp-report-card">
                <div class="pp-report-header">
                    <div>
                        <div class="pp-report-title">⚡ AI Portfolio Intelligence Report</div>
                        <div class="pp-report-subtitle">Report generation failed</div>
                    </div>
                    <button class="pp-report-close" onclick="window.PortfolioReportPanel.close()">✕</button>
                </div>
                <div class="pp-report-error">
                    <strong>⚠ Error:</strong> ${escapeHtml(msg)}
                </div>
                <div class="pp-report-actions">
                    <button class="pp-report-btn pp-report-btn-primary" onclick="window.PortfolioReportPanel.open({ forceRegenerate: true })">🔄 Retry</button>
                    <button class="pp-report-btn pp-report-btn-secondary" onclick="window.PortfolioReportPanel.close()">Close</button>
                </div>
            </div>
        `);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Report render
    // ─────────────────────────────────────────────────────────────────────────

    function renderReport(result) {
        const { report, metrics, fromCache, cachedAt } = result;

        const generatedAt = new Date().toLocaleString();
        const sourceLabel = metrics.portfolioSource === 'wallet'
            ? `On-chain wallet${metrics.isMultichain ? ' (multichain)' : ''}`
            : 'Brokerage / Plaid';

        const cacheHtml = fromCache && cachedAt
            ? `<span class="pp-report-cache-badge">📋 Cached · ${new Date(cachedAt).toLocaleTimeString()}</span>`
            : '';

        const totalValue = '$' + (metrics.totalPortfolioValueUsd || 0).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });

        renderCard(`
            <div class="pp-report-card" id="pp-report-card-inner">
                <div class="pp-report-header">
                    <div>
                        <div class="pp-report-title">⚡ AI Portfolio Intelligence Report</div>
                        <div class="pp-report-subtitle">
                            <strong>${sourceLabel}</strong> · 
                            ${metrics.totalAssets} assets · 
                            ${totalValue} total value · 
                            Generated ${generatedAt}
                        </div>
                    </div>
                    <button class="pp-report-close" onclick="window.PortfolioReportPanel.close()">✕</button>
                </div>

                <div class="pp-report-body" id="pp-report-body">
                    ${renderMarkdown(report)}
                </div>

                <div class="pp-report-actions">
                    <button class="pp-report-btn pp-report-btn-primary" id="pp-regenerate-btn"
                        onclick="window.PortfolioReportPanel._onRegenerate(this)">
                        🔄 Regenerate
                    </button>
                    <button class="pp-report-btn pp-report-btn-secondary" id="pp-copy-btn"
                        onclick="window.PortfolioReportPanel._onCopy(this)">
                        📋 Copy Report
                    </button>
                    <button class="pp-report-btn pp-report-btn-secondary"
                        onclick="window.PortfolioReportPanel.close()">
                        Close
                    </button>
                    ${cacheHtml}
                </div>
            </div>
        `);

        // Scroll to top of card
        setTimeout(() => {
            const card = document.getElementById('pp-report-card-inner');
            if (card) card.scrollTop = 0;
        }, 50);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Button handlers
    // ─────────────────────────────────────────────────────────────────────────

    function _onRegenerate(btn) {
        if (!btn) return;
        btn.disabled = true;
        btn.textContent = '⏳ Regenerating...';
        open({ forceRegenerate: true });
    }

    function _onCopy(btn) {
        // Extract plain text from the report body
        const body = document.getElementById('pp-report-body');
        if (!body) return;

        const text = body.innerText || body.textContent || '';
        navigator.clipboard.writeText(text).then(() => {
            if (btn) {
                btn.textContent = '✅ Copied!';
                btn.classList.add('pp-report-copy-success');
                setTimeout(() => {
                    if (btn) {
                        btn.textContent = '📋 Copy Report';
                        btn.classList.remove('pp-report-copy-success');
                    }
                }, 2500);
            }
        }).catch(() => {
            // Fallback for browsers without clipboard API
            try {
                const ta = document.createElement('textarea');
                ta.value = text;
                ta.style.position = 'fixed';
                ta.style.opacity = '0';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
                if (btn) {
                    btn.textContent = '✅ Copied!';
                    setTimeout(() => { if (btn) btn.textContent = '📋 Copy Report'; }, 2500);
                }
            } catch {
                alert('Could not copy to clipboard. Please select the text manually.');
            }
        });
    }

    window.PortfolioReportPanel = { open, close, _onRegenerate, _onCopy };

    console.info('[PortfolioReportPanel] Report UI panel loaded.');

})();
