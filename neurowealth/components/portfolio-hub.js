/**
 * portfolio-hub.js
 *
 * Portfolio Hub orchestrator — view-state routing, render dedup, debounced
 * store subscription, URL hash persistence, and detail view delegation.
 *
 * Views: 'hub' | 'detail'
 * Hash format:  #hub  |  #detail:wallet:0xabc  |  #detail:plaid:item_1
 *
 * Exposed as: window.PortfolioHub
 */
'use strict';

(function () {
    const LOG = '[PortfolioHub]';

    // =========================================================================
    // Shared Add Portfolio helper — ALL entry points must use this.
    // =========================================================================
    function openAddPortfolioChooser() {
        const chooser = window.portfolioConnectionChooser;
        if (chooser && typeof chooser.openChooser === 'function') {
            chooser.openChooser();
        } else {
            console.warn(LOG, 'portfolioConnectionChooser not available — cannot open add-portfolio modal.');
        }
    }

    // =========================================================================
    // Internal state
    // =========================================================================
    let _view = 'hub';
    let _selectedId = null;
    let _lastSnapshot = null;
    let _debounce = null;
    let _initialized = false;

    // =========================================================================
    // Utilities
    // =========================================================================
    function g(id) { return document.getElementById(id); }

    function show(id, visible) {
        const el = typeof id === 'string' ? g(id) : id;
        if (el) el.classList.toggle('hidden', !visible);
    }

    function fmtUsd(v) {
        if (!v && v !== 0) return '$0.00';
        return '$' + Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    // =========================================================================
    // Render-dedup snapshot
    // =========================================================================
    function storeChecksum(portfolios) {
        return portfolios.map(p => `${p.id}:${p.portfolioHash || ''}:${p.syncStatus || ''}`).join('|');
    }

    function snapshot() {
        const pfs = window.PortfolioStore ? window.PortfolioStore.getAllPortfolios() : [];
        return { view: _view, id: _selectedId, cs: storeChecksum(pfs) };
    }

    function changed(s) {
        return !_lastSnapshot
            || s.view !== _lastSnapshot.view
            || s.id   !== _lastSnapshot.id
            || s.cs   !== _lastSnapshot.cs;
    }

    // =========================================================================
    // URL hash
    // =========================================================================
    function setHash(view, portfolioId) {
        const hash = (view === 'detail' && portfolioId) ? `detail:${portfolioId}` : 'hub';
        if (window.location.hash.slice(1) !== hash) history.pushState(null, '', `#${hash}`);
    }

    function readHash() {
        const h = (window.location.hash || '').slice(1);
        if (h.startsWith('detail:')) return { view: 'detail', portfolioId: h.slice('detail:'.length) };
        return { view: 'hub', portfolioId: null };
    }

    // =========================================================================
    // Hub View
    // =========================================================================
    function showHub() {
        _view = 'hub';
        _selectedId = null;
        setHash('hub', null);

        const portfolios = window.PortfolioStore ? window.PortfolioStore.getAllPortfolios() : [];

        // Section visibility
        show('portfolio-hub-view', true);
        show('ph-back-nav', false);
        show('dashboard-section', false);
        show('holdings-section', false);
        show('transactions-section', false);
        show('portfolio-summary-bar-container', false);
        show('portfolio-performance-chart-container', false);
        show('marketing-features-section', portfolios.length === 0);
        show('connect-accounts-section', true);

        const heroSec = g('page-hero-section');
        if (heroSec) {
            if (portfolios.length > 0) {
                heroSec.classList.add('is-connected');
                show('hero-disconnected', false);
                show('hero-connected', true);
            } else {
                heroSec.classList.remove('is-connected');
                show('hero-disconnected', true);
                show('hero-connected', false);
            }
        }

        _lastSnapshot = snapshot();

        portfolios.length === 0 ? _renderHubEmpty() : _renderHubContent(portfolios);
    }

    function _renderHubEmpty() {
        const el = g('portfolio-hub-view');
        if (!el) return;
        el.innerHTML = `
            <div class="container" style="text-align:center;padding:var(--space-16) 0 var(--space-8);">
                <div style="font-size:3rem;margin-bottom:var(--space-4);opacity:0.4;">📊</div>
                <h2 style="font-size:1.5rem;color:#fff;margin-bottom:var(--space-3);font-weight:500;">Your Portfolio Hub</h2>
                <p style="color:#64748b;max-width:480px;margin:0 auto var(--space-6);line-height:1.6;">
                    Connect your first crypto wallet or brokerage account to see your combined portfolio overview here.
                </p>
                <button id="ph-empty-add-btn" class="ph-add-portfolio-btn" aria-label="Add your first portfolio">
                    + Add Portfolio
                </button>
            </div>`;
        // Bind after innerHTML set
        const btn = el.querySelector('#ph-empty-add-btn');
        if (btn) btn.addEventListener('click', openAddPortfolioChooser);
    }

    function _renderHubContent(portfolios) {
        const el = g('portfolio-hub-view');
        if (!el) return;

        el.innerHTML = `
            <div class="container">
                <!-- SECTION 1: Needs Attention -->
                <div id="ph-needs-attention" style="margin-bottom: var(--space-4); display: none;">
                    <h3 class="ph-section-title" style="margin-bottom: var(--space-3); color: #f87171;">Needs Attention</h3>
                    <div id="ph-needs-attention-cards" style="display: flex; flex-direction: column; gap: 8px;"></div>
                </div>

                <!-- SECTION 2: Intelligence Bar -->
                <div style="margin-bottom: var(--space-4);">
                    <h3 class="ph-section-title" style="margin-bottom: var(--space-3);">Portfolio Intelligence</h3>
                    <div id="ph-intelligence-bar" class="ph-intel-grid"></div>
                </div>

                <!-- SECTION 3: Summary Strip -->
                <div class="ph-summary-header" style="margin-top: var(--space-6);">
                    <span class="ph-section-title" style="margin-bottom:0;">Portfolio Summary</span>
                    <button id="ph-hub-add-btn" class="ph-add-portfolio-btn" aria-label="Connect another portfolio">
                        + Add Portfolio
                    </button>
                </div>
                <div id="ph-summary-row" class="ph-summary-row compact-strip"></div>
                
                <!-- Quick Actions Row -->
                <div id="ph-quick-actions" style="display:flex; gap:12px; margin-top:16px; flex-wrap:wrap;">
                    <button id="qa-ai-report" class="action-btn" style="padding:8px 16px; border-radius:6px; background:rgba(212,175,55,0.1); border:1px solid rgba(212,175,55,0.3); color:#D4AF37; cursor:pointer; font-weight:500; transition:all 0.2s;" onmouseover="this.style.background='rgba(212,175,55,0.2)'" onmouseout="this.style.background='rgba(212,175,55,0.1)'">Generate AI Report</button>
                    <button id="qa-refresh" class="action-btn" style="padding:8px 16px; border-radius:6px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); color:#e2e8f0; cursor:pointer; font-weight:500; transition:all 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.1)'" onmouseout="this.style.background='rgba(255,255,255,0.05)'">Refresh Data</button>
                    <button id="qa-add-portfolio" class="action-btn" style="padding:8px 16px; border-radius:6px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); color:#e2e8f0; cursor:pointer; font-weight:500; transition:all 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.1)'" onmouseout="this.style.background='rgba(255,255,255,0.05)'">Add Portfolio</button>
                    <button id="qa-detailed" class="action-btn" style="padding:8px 16px; border-radius:6px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); color:#e2e8f0; cursor:pointer; font-weight:500; transition:all 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.1)'" onmouseout="this.style.background='rgba(255,255,255,0.05)'">View Detailed Breakdown</button>
                </div>

                <div class="ph-chart-ai-row" style="margin-top: var(--space-6);">
                    <div class="ph-chart-panel">
                        <h3 class="ph-section-title">Combined Allocation</h3>
                        <div style="position:relative;width:100%;max-width:280px;margin:0 auto;aspect-ratio:1/1;">
                            <canvas id="ph-hub-donut"></canvas>
                        </div>
                    </div>
                    <div class="ph-ai-panel" id="ph-ai-overview-container"></div>
                </div>
                <div style="margin-top:var(--space-10);">
                    <h3 class="ph-section-title">Connected Portfolios</h3>
                    <div id="ph-cards-grid" class="ph-cards-grid"></div>
                </div>
            </div>`;

        // Bind hub-level add button
        const hubAddBtn = g('ph-hub-add-btn');
        if (hubAddBtn) hubAddBtn.addEventListener('click', openAddPortfolioChooser);

        const aggregate = window.PortfolioAggregator ? window.PortfolioAggregator.compute(portfolios) : null;

        if (aggregate) {
            _updateHeroConnected(aggregate);
            _renderNeedsAttention(aggregate);
            _renderIntelligenceBar(aggregate);
            _renderSummaryRow(aggregate);
            _renderHubDonut(aggregate);
            if (window.PortfolioHubAIOverview) {
                window.PortfolioHubAIOverview.render('ph-ai-overview-container', aggregate);
            }
        }
        _renderCards(portfolios);
        
        // Bind Quick Actions
        const btnAiReport = g('qa-ai-report');
        if (btnAiReport) {
            btnAiReport.addEventListener('click', () => {
                if (window.PortfolioReportPanel) {
                    // It requires portfolioData to be set for context. We use the largest portfolio.
                    if (aggregate && aggregate.largestPortfolio) {
                        window.portfolioData = aggregate.largestPortfolio.metadata || null;
                    }
                    window.PortfolioReportPanel.open();
                }
            });
        }
        
        const btnRefresh = g('qa-refresh');
        if (btnRefresh) {
            btnRefresh.addEventListener('click', () => {
                window.location.reload();
            });
        }
        
        const btnAddPortfolio = g('qa-add-portfolio');
        if (btnAddPortfolio) {
            btnAddPortfolio.addEventListener('click', openAddPortfolioChooser);
        }
        
        const btnDetailed = g('qa-detailed');
        if (btnDetailed) {
            btnDetailed.addEventListener('click', () => {
                if (aggregate && aggregate.largestPortfolio) {
                    openDetail(aggregate.largestPortfolio.id);
                } else if (portfolios.length > 0) {
                    openDetail(portfolios[0].id);
                }
            });
        }
    }

    function _renderNeedsAttention(ag) {
        const container = g('ph-needs-attention');
        const cardsContainer = g('ph-needs-attention-cards');
        if (!container || !cardsContainer) return;

        const alerts = [];
        
        if (ag.unpricedAssetsCount > 0) {
            alerts.push({
                type: 'warning',
                color: '#fbbf24',
                bg: 'rgba(251,191,36,0.1)',
                border: 'rgba(251,191,36,0.3)',
                text: `${ag.unpricedAssetsCount} asset${ag.unpricedAssetsCount > 1 ? 's lack' : ' lacks'} reliable pricing data`
            });
        }
        
        if (ag.connectedPortfoliosCount === 1) {
            alerts.push({
                type: 'info',
                color: '#94a3b8',
                bg: 'rgba(148,163,184,0.1)',
                border: 'rgba(148,163,184,0.3)',
                text: `Only one portfolio connected`
            });
        }
        
        const highestPct = ag.largestHoldingOverall && ag.totalPortfolioValueUsd > 0 
            ? (ag.largestHoldingOverall.valueUsd / ag.totalPortfolioValueUsd) * 100 
            : 0;
            
        if (highestPct > 40) {
            alerts.push({
                type: 'critical',
                color: '#f87171',
                bg: 'rgba(248,113,113,0.1)',
                border: 'rgba(248,113,113,0.3)',
                text: `High concentration risk: Largest position is ${highestPct.toFixed(0)}% of portfolio`
            });
        }
        
        // Let's assume AI report generated check is based on cache for now or just generic info if we can't tell easy.
        // Skipping AI report not generated alert as it's hard to tell synchronously without async cache check.

        if (alerts.length > 0) {
            container.style.display = 'block';
            cardsContainer.innerHTML = alerts.map(a => `
                <div style="background: ${a.bg}; border: 1px solid ${a.border}; color: ${a.color}; padding: 12px 16px; border-radius: 8px; font-size: 0.9rem; font-weight: 500; display: flex; align-items: center; gap: 10px;">
                    <span style="font-size: 1.1rem;">${a.type === 'warning' ? '⚠️' : a.type === 'critical' ? '🚨' : 'ℹ️'}</span>
                    ${a.text}
                </div>
            `).join('');
        } else {
            container.style.display = 'none';
        }
    }

    function _updateHeroConnected(ag) {
        const titleEl = g('cc-total-value');
        const secondaryEl = g('cc-secondary-metrics');
        if (titleEl) titleEl.textContent = fmtUsd(ag.totalPortfolioValueUsd);
        if (secondaryEl) {
            const pfText = ag.connectedPortfoliosCount === 1 ? '1 Portfolio' : `${ag.connectedPortfoliosCount} Portfolios`;
            const assetText = ag.totalAssetsCount === 1 ? '1 Asset' : `${ag.totalAssetsCount} Assets`;
            secondaryEl.textContent = `${pfText} • ${assetText} • ${ag.pricingCoveragePercent}% Priced`;
        }
    }

    function _renderIntelligenceBar(ag) {
        const container = g('ph-intelligence-bar');
        if (!container) return;

        const cards = [];

        // 1. Largest Exposure
        let exposureStr = 'None';
        let exposureColor = '#94a3b8'; // gray
        let highestPct = 0;
        if (ag.largestHoldingOverall && ag.totalPortfolioValueUsd > 0) {
            highestPct = (ag.largestHoldingOverall.valueUsd / ag.totalPortfolioValueUsd) * 100;
            const sym = ag.largestHoldingOverall.symbol || 'Unknown';
            exposureStr = `${sym} — ${highestPct.toFixed(0)}%`;
            if (highestPct > 40) exposureColor = '#f87171'; // red
            else if (highestPct > 20) exposureColor = '#fbbf24'; // yellow
            else exposureColor = '#4ade80'; // green
        }
        cards.push({ label: 'Largest Exposure', value: exposureStr, color: exposureColor });

        // 2. Concentration Risk
        let concStr = 'Low';
        let concColor = '#4ade80';
        if (highestPct > 40) { concStr = 'High'; concColor = '#f87171'; }
        else if (highestPct > 20) { concStr = 'Moderate'; concColor = '#fbbf24'; }
        else if (highestPct === 0) { concStr = 'N/A'; concColor = '#94a3b8'; }
        cards.push({ label: 'Concentration Risk', value: concStr, color: concColor });

        // 3. Network Diversification
        let netStr = `${ag.totalChainsCount} Networks`;
        let netColor = '#94a3b8';
        if (ag.totalChainsCount > 3) { netColor = '#4ade80'; }
        else if (ag.totalChainsCount > 1) { netColor = '#fbbf24'; }
        else if (ag.totalChainsCount === 1) { netColor = '#f87171'; }
        else { netStr = '0 Networks'; }
        cards.push({ label: 'Network Diver.', value: netStr, color: netColor });

        // 4. Liquidity Quality
        let liqStr = 'High';
        let liqColor = '#4ade80';
        if (ag.pricingCoveragePercent < 50) { liqStr = 'Low'; liqColor = '#f87171'; }
        else if (ag.pricingCoveragePercent < 90) { liqStr = 'Medium'; liqColor = '#fbbf24'; }
        else if (ag.totalAssetsCount === 0) { liqStr = 'N/A'; liqColor = '#94a3b8'; }
        cards.push({ label: 'Liquidity Quality', value: liqStr, color: liqColor });

        // 5. Pricing Coverage
        let priceStr = `${ag.pricingCoveragePercent}%`;
        let priceColor = '#4ade80';
        if (ag.pricingCoveragePercent < 80) { priceColor = '#f87171'; }
        else if (ag.pricingCoveragePercent < 100) { priceColor = '#fbbf24'; }
        else if (ag.totalAssetsCount === 0) { priceColor = '#94a3b8'; }
        cards.push({ label: 'Pricing Coverage', value: priceStr, color: priceColor });

        container.innerHTML = cards.map(c => `
            <div class="ph-intel-card" style="--intel-color: ${c.color}">
                <div class="ph-intel-label">${c.label}</div>
                <div class="ph-intel-value">${c.value}</div>
            </div>
        `).join('');
    }

    function _renderSummaryRow(ag) {
        const el = g('ph-summary-row');
        if (!el) return;
        const pnlPos = (ag.totalPnlValue || 0) >= 0;
        const pnlClass = pnlPos ? 'green' : 'red';
        const largestName = ag.largestPortfolio ? (ag.largestPortfolio.displayName || ag.largestPortfolio.providerName || 'Unknown') : 'None';
        
        el.innerHTML = `
            <div class="ph-metric">
                <div class="ph-metric-label">Total Value</div>
                <div class="ph-metric-val">${fmtUsd(ag.totalPortfolioValueUsd)}</div>
            </div>
            <div class="ph-metric">
                <div class="ph-metric-label">Total PnL</div>
                <div class="ph-metric-val ${pnlClass}">${pnlPos ? '+' : ''}${fmtUsd(ag.totalPnlValue)}</div>
            </div>
            <div class="ph-metric">
                <div class="ph-metric-label">Portfolios</div>
                <div class="ph-metric-val">${ag.connectedPortfoliosCount}</div>
            </div>
            <div class="ph-metric">
                <div class="ph-metric-label">Total Assets</div>
                <div class="ph-metric-val">${ag.totalAssetsCount}</div>
            </div>
            <div class="ph-metric">
                <div class="ph-metric-label">Pricing Coverage</div>
                <div class="ph-metric-val">${ag.pricingCoveragePercent}%</div>
            </div>
            <div class="ph-metric">
                <div class="ph-metric-label">Largest Portfolio</div>
                <div class="ph-metric-val" style="font-size: 1.1rem; align-self: center; margin-top: auto; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; border-bottom: none;" title="${largestName}">${largestName}</div>
            </div>`;
    }

    function _renderHubDonut(ag) {
        if (typeof Chart === 'undefined') return;
        const canvas = g('ph-hub-donut');
        if (!canvas) return;

        // Calculate total value for percentages
        const totalValue = ag.totalPortfolioValueUsd > 0 ? ag.totalPortfolioValueUsd : 1; // avoid div by 0

        // Process entries: group < 2% into "Other"
        let rawEntries = Object.entries(ag.combinedAllocation || {});
        let groupedEntries = [];
        let otherValue = 0;

        rawEntries.forEach(([label, value]) => {
            const pct = (value / totalValue) * 100;
            if (pct < 2) {
                otherValue += value;
            } else {
                groupedEntries.push([label, value]);
            }
        });

        // Add "Other" if there's any
        if (otherValue > 0) {
            groupedEntries.push(['Other', otherValue]);
        }

        // Sort descending by value
        groupedEntries.sort((a, b) => b[1] - a[1]);

        if (!groupedEntries.length) return;
        
        const COLORS = ['#D4AF37','#a3e635','#38bdf8','#c084fc','#f87171','#fb923c','#34d399','#818cf8','#f472b6','#94a3b8'];
        if (window._phHubChart) { try { window._phHubChart.destroy(); } catch (_) {} window._phHubChart = null; }
        window._phHubChart = new Chart(canvas.getContext('2d'), {
            type: 'doughnut',
            data: {
                labels: groupedEntries.map(([s]) => s),
                datasets: [{ data: groupedEntries.map(([, v]) => v), backgroundColor: COLORS.slice(0, groupedEntries.length), borderWidth: 2, borderColor: '#0f172a', hoverOffset: 6 }]
            },
            options: {
                responsive: true, cutout: '70%',
                plugins: {
                    legend: { position: 'bottom', labels: { color: '#94a3b8', padding: 10, font: { family: 'Inter', size: 11 } } },
                    tooltip: { 
                        backgroundColor: 'rgba(15, 23, 42, 0.95)',
                        titleColor: '#fff',
                        bodyColor: '#e2e8f0',
                        borderColor: 'rgba(212, 175, 55, 0.3)',
                        borderWidth: 1,
                        padding: 12,
                        callbacks: { 
                            title: function(context) { 
                                return context[0].label; 
                            },
                            label: function(ctx) {
                                const pct = ag.totalPortfolioValueUsd > 0 ? ((ctx.raw / ag.totalPortfolioValueUsd) * 100).toFixed(1) : '0';
                                return [
                                    `${pct}%`,
                                    `${fmtUsd(ctx.raw)}`
                                ];
                            }
                        }
                    }
                }
            }
        });
    }

    function _renderCards(portfolios) {
        const grid = g('ph-cards-grid');
        if (!grid || !window.PortfolioCard) return;
        grid.innerHTML = '';
        portfolios.forEach(pf => {
            const node = window.PortfolioCard.createNode(pf, id => openDetail(id));
            grid.appendChild(node);
        });

        // Add-card: always appended after real portfolio cards
        const addCard = document.createElement('div');
        addCard.className = 'ph-add-card';
        addCard.setAttribute('role', 'button');
        addCard.setAttribute('tabindex', '0');
        addCard.setAttribute('aria-label', 'Connect another portfolio');
        addCard.innerHTML = `
            <span class="ph-add-card-icon">＋</span>
            <span class="ph-add-card-label">Connect Another Portfolio</span>
            <span class="ph-add-card-sublabel">Wallet, brokerage, or investment account</span>`;
        function activateAddCard(e) {
            if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
            if (e.type === 'keydown') e.preventDefault();
            openAddPortfolioChooser();
        }
        addCard.addEventListener('click', activateAddCard);
        addCard.addEventListener('keydown', activateAddCard);
        grid.appendChild(addCard);
    }

    // =========================================================================
    // Detail View
    // =========================================================================
    function openDetail(portfolioId) {
        const store = window.PortfolioStore;
        const pf = store ? store.getPortfolioById(portfolioId) : null;
        if (!pf) { console.warn(LOG, 'Portfolio not found:', portfolioId, '— falling back to hub.'); showHub(); return; }

        _view = 'detail';
        _selectedId = portfolioId;
        setHash('detail', portfolioId);
        _lastSnapshot = snapshot();

        // Visibility
        show('portfolio-hub-view', false);
        show('ph-back-nav', true);
        show('dashboard-section', true);
        show('marketing-features-section', false);
        show('connect-accounts-section', true);

        // Set compat global (existing AI + Chart code reads this)
        window.portfolioData = pf.metadata || null;

        _renderDetail(pf);
    }

    function _renderDetail(pf) {
        if (!pf) return;

        // Show connected state in the connect-accounts card
        const conn = g('connected-state');
        const discon = g('disconnected-state');
        if (conn) conn.classList.remove('hidden');
        if (discon) discon.classList.add('hidden');

        // Inject + Add Portfolio button into the action row (idempotent)
        const heroButtons = document.querySelector('#connected-state .hero-buttons');
        if (heroButtons && !heroButtons.querySelector('[data-add-portfolio-btn]')) {
            const addBtn = document.createElement('button');
            addBtn.className = 'btn ph-add-portfolio-btn';
            addBtn.setAttribute('data-add-portfolio-btn', 'true');
            addBtn.setAttribute('aria-label', 'Connect another portfolio');
            addBtn.style.cssText = 'font-size:0.85rem;';
            addBtn.textContent = '+ Add Portfolio';
            addBtn.addEventListener('click', openAddPortfolioChooser);
            heroButtons.appendChild(addBtn);
        }

        const meta = pf.metadata || {};

        if (pf.sourceType === 'wallet') {
            const mcResult = meta.multichainData || {};
            const flat = mcResult.allHoldingsFlat || meta.holdings?.holdings || [];
            const totalUsd = pf.totalValueUsd || 0;

            if (window.PortfolioSummaryBar) {
                window.PortfolioSummaryBar.render('portfolio-summary-bar-container', { ...mcResult, totalPortfolioValueUsd: totalUsd, allHoldingsFlat: flat });
                show('portfolio-summary-bar-container', true);
            }
            if (window.PortfolioPerformanceChart) {
                window.PortfolioPerformanceChart.render('portfolio-performance-chart-container', totalUsd);
                show('portfolio-performance-chart-container', true);
            }
            if (window.PortfolioDistributionChart && flat.length) {
                window.PortfolioDistributionChart.render('distribution-chart', flat, totalUsd);
            }
            if (window.PortfolioInsightsPanel && flat.length) {
                window.PortfolioInsightsPanel.render('portfolio-insights-panel', { ...mcResult, allHoldingsFlat: flat, totalPortfolioValueUsd: totalUsd });
            }
            if (window.PortfolioHealthPanel && flat.length) {
                window.PortfolioHealthPanel.render('portfolio-health-panel', { ...mcResult, allHoldingsFlat: flat, totalPortfolioValueUsd: totalUsd });
            }
            if (window.PortfolioChainExposure && mcResult.chainTotals) {
                window.PortfolioChainExposure.render('portfolio-chain-exposure-container', { chainTotals: mcResult.chainTotals, totalPortfolioValueUsd: totalUsd });
            }
            // Re-render holdings via the exposed WalletTokenIngestion render path
            if (window.WalletTokenIngestion && window.WalletTokenIngestion.renderFromCachedResult && mcResult.chainGroupedHoldings) {
                window.WalletTokenIngestion.renderFromCachedResult(mcResult);
            }
            show('holdings-section', true);

        } else if (pf.sourceType === 'plaid') {
            const holdingsData = meta.holdings;
            const txData = meta.transactions;
            if (holdingsData && typeof updateSummaryBar === 'function') updateSummaryBar(holdingsData);
            if (holdingsData && typeof renderAnalysis === 'function') renderAnalysis(holdingsData);
            if (holdingsData && typeof renderHoldings === 'function') renderHoldings(holdingsData);
            if (txData && typeof renderTransactions === 'function') renderTransactions(txData);
        }

        // Update wallet summary display if applicable
        const walletSrc = meta.walletSource;
        if (walletSrc?.address) {
            const addrEl = g('wallet-address');
            if (addrEl) addrEl.textContent = walletSrc.address;
            const summaryEl = g('wallet-summary');
            if (summaryEl) summaryEl.classList.remove('hidden');
        }
    }

    function goBackToHub() { showHub(); }

    // =========================================================================
    // Store subscription (debounced ~50ms)
    // =========================================================================
    function onStoreChange(portfolios) {
        clearTimeout(_debounce);
        _debounce = setTimeout(() => {
            const s = snapshot();
            if (!changed(s)) return;

            if (_view === 'hub') {
                showHub();
            } else {
                const pf = window.PortfolioStore ? window.PortfolioStore.getPortfolioById(_selectedId) : null;
                if (!pf) { showHub(); return; }
                // Re-render detail only if selected portfolio data changed
                const prevCs = (_lastSnapshot?.cs || '').split('|').find(e => e.startsWith(_selectedId + ':')) || '';
                const currCs = `${pf.id}:${pf.portfolioHash || ''}:${pf.syncStatus || ''}`;
                if (currCs !== prevCs) { _renderDetail(pf); _lastSnapshot = snapshot(); }
            }
        }, 50);
    }

    // =========================================================================
    // Init
    // =========================================================================
    function init() {
        if (_initialized) return;
        _initialized = true;

        if (window.PortfolioStore) window.PortfolioStore.subscribe(onStoreChange);

        const backBtn = g('ph-back-to-hub');
        if (backBtn) backBtn.addEventListener('click', goBackToHub);

        window.addEventListener('hashchange', () => {
            const { view, portfolioId } = readHash();
            if (view === 'detail' && portfolioId) {
                if (_view !== 'detail' || _selectedId !== portfolioId) openDetail(portfolioId);
            } else {
                if (_view !== 'hub') showHub();
            }
        });

        // Route from initial hash
        const { view, portfolioId } = readHash();
        if (view === 'detail' && portfolioId && window.PortfolioStore?.getPortfolioById(portfolioId)) {
            openDetail(portfolioId);
        } else {
            showHub();
        }

        console.info(LOG, 'Initialized.');
    }

    // =========================================================================
    // Expose
    // =========================================================================
    window.PortfolioHub = { init, showHub, openDetail, goBackToHub };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        setTimeout(init, 0);
    }

    console.info(LOG, 'Loaded.');
})();
