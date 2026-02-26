/* ========================================================================
   PORTFOLIO MANAGER v1 — Multi-Strategy Paper Portfolio + Allocator
   Enables users to run/monitor a PAPER portfolio of multiple strategies
   with a deterministic allocator that assigns capital weights based on
   strategy lifecycle tier + CRS.

   PAPER ONLY. No live trading. No engine changes.
   ======================================================================== */

(function () {
    'use strict';

    const LOG = '[PortfolioManager]';
    const STORAGE_KEY = 'pp_portfolio_v1';
    const PAPER_STORAGE_KEY = 'pp_paper_sessions_v1';
    const MAX_SLOTS = 10;

    // ====================================================================
    // HELPERS
    // ====================================================================
    function genUUID() {
        return 'pf-' + 'xxxx-xxxx-4xxx'.replace(/[x]/g, () =>
            ((Math.random() * 16) | 0).toString(16)
        ) + '-' + Date.now().toString(36);
    }

    function isoNow() { return new Date().toISOString(); }

    function safeParseJSON(str, fallback) {
        try { const v = JSON.parse(str); return v != null ? v : fallback; } catch { return fallback; }
    }

    function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

    function fmtMoney(v) {
        if (v == null || isNaN(v)) return '$0.00';
        return '$' + Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function fmtPct(v, digits = 1) {
        if (v == null || isNaN(v)) return '0.0%';
        return (v * 100).toFixed(digits) + '%';
    }

    function showToast(msg, color) {
        const t = document.createElement('div');
        t.textContent = msg;
        Object.assign(t.style, {
            position: 'fixed', bottom: '20px', right: '20px',
            background: color || '#4ade80', color: '#0f172a',
            padding: '12px 24px', borderRadius: '8px', fontWeight: '600',
            fontFamily: "'Inter', sans-serif", fontSize: '0.85rem',
            boxShadow: '0 10px 15px -3px rgba(0,0,0,0.5)',
            zIndex: '99999', opacity: '1', transition: 'opacity 0.5s'
        });
        document.body.appendChild(t);
        setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 500); }, 3500);
    }

    // ====================================================================
    // PORTFOLIO DATA MODEL
    // ====================================================================
    let portfolio = null;

    function createPortfolio(opts = {}) {
        portfolio = {
            portfolio_id: genUUID(),
            name: opts.name || 'My Portfolio',
            created_at: isoNow(),
            updated_at: isoNow(),
            base_currency: 'USD',
            starting_capital: opts.starting_capital || 100000,
            max_strategies: MAX_SLOTS,
            risk_limits: {
                max_portfolio_dd_pct: opts.max_dd || 25,
                max_single_weight_pct: opts.max_weight || 0.40,
                min_strategy_crs: opts.min_crs || 40
            },
            holdings: []
        };
        savePortfolio();
        console.log(LOG, 'Portfolio created:', portfolio.name);
        return portfolio;
    }

    function loadPortfolio() {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            portfolio = safeParseJSON(raw, null);
            if (portfolio) {
                // Sanitize slots — fix any missing labels from corrupt data
                if (Array.isArray(portfolio.holdings)) {
                    portfolio.holdings.forEach((slot, idx) => {
                        if (!slot.label) {
                            slot.label = slot.strategy_id
                                ? `Strategy ${slot.strategy_id.substring(0, 8)}`
                                : `Strategy #${idx + 1}`;
                        }
                        if (!slot.slot_id) slot.slot_id = genUUID();
                    });
                } else {
                    portfolio.holdings = [];
                }
                console.log(LOG, `Loaded portfolio "${portfolio.name}" with ${portfolio.holdings.length} slots`);
            }
        }
        return portfolio;
    }

    function savePortfolio() {
        if (!portfolio) return;
        portfolio.updated_at = isoNow();
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(portfolio));
        } catch (e) {
            console.error(LOG, 'Save failed:', e);
        }
    }

    function getPortfolio() { return portfolio; }

    // ====================================================================
    // SLOT MANAGEMENT
    // ====================================================================
    function addSlot(strategyId, versionId) {
        if (!portfolio) { console.error(LOG, 'No portfolio'); return null; }
        if (portfolio.holdings.length >= portfolio.max_strategies) {
            showToast('Portfolio full — max ' + portfolio.max_strategies + ' strategies', '#f87171');
            return null;
        }
        // Prevent duplicate strategy+version
        if (portfolio.holdings.find(s => s.strategy_id === strategyId && s.version_id === versionId)) {
            showToast('Strategy version already in portfolio', '#fbbf24');
            return null;
        }

        // Resolve strategy + version info from lifecycle registry
        const SL = window.StrategyLifecycle;
        if (!SL) { console.error(LOG, 'StrategyLifecycle not found'); return null; }
        const strategy = SL.getStrategy(strategyId);
        if (!strategy) { console.error(LOG, 'Strategy not found:', strategyId); return null; }

        let version = null;
        if (versionId) {
            version = strategy.versions.find(v => v.version_id === versionId);
        }
        if (!version && strategy.versions.length > 0) {
            version = strategy.versions[strategy.versions.length - 1];
        }
        if (!version) { showToast('No version found for strategy', '#f87171'); return null; }

        const crs = version.snapshots?.readiness?.crs ?? 0;
        const tier = version.snapshots?.readiness?.tier || strategy.state || 'DRAFT';
        const label = `${strategy.name}@${version.version}`;

        const slot = {
            slot_id: genUUID(),
            strategy_id: strategyId,
            version_id: version.version_id,
            label: label,
            crs_snapshot: crs,
            tier_snapshot: tier,
            weight_mode: 'AUTO',
            target_weight: 0,
            enabled: true
        };

        // Auto eligibility check
        const eligible = checkEligibility(slot);
        if (!eligible) {
            slot.enabled = false;
        }

        portfolio.holdings.push(slot);
        runAllocator();
        savePortfolio();
        showToast(`Added ${label} to portfolio`, '#4ade80');
        return slot;
    }

    function removeSlot(slotId) {
        if (!portfolio) return;
        portfolio.holdings = portfolio.holdings.filter(s => s.slot_id !== slotId);
        runAllocator();
        savePortfolio();
    }

    function updateSlot(slotId, changes) {
        if (!portfolio) return null;
        const slot = portfolio.holdings.find(s => s.slot_id === slotId);
        if (!slot) return null;
        Object.assign(slot, changes);
        runAllocator();
        savePortfolio();
        return slot;
    }

    // ====================================================================
    // ELIGIBILITY FILTER
    // ====================================================================
    const ELIGIBLE_TIERS = ['VALIDATED', 'PRODUCTION', 'CAPITAL-READY', 'CAPITAL_READY'];

    function checkEligibility(slot) {
        if (!portfolio) return false;
        const tierUpper = (slot.tier_snapshot || '').toUpperCase().replace(/[\s-]/g, '_').replace(/_+/g, '_');
        const tierMatch = ELIGIBLE_TIERS.some(t => tierUpper.includes(t.replace(/-/g, '_')));
        const crsMatch = slot.crs_snapshot >= (portfolio.risk_limits.min_strategy_crs || 0);
        return tierMatch || crsMatch;
    }

    function refreshEligibility() {
        if (!portfolio) return;
        portfolio.holdings.forEach(slot => {
            const eligible = checkEligibility(slot);
            if (!eligible && slot.enabled) {
                slot.enabled = false;
            }
        });
    }

    // ====================================================================
    // ALLOCATOR v1 — DETERMINISTIC
    // ====================================================================
    function getTierBonus(tier) {
        const t = (tier || '').toUpperCase();
        if (t === 'PRODUCTION') return 20;
        if (t === 'VALIDATED' || t.includes('CAPITAL') && t.includes('READY')) return 10;
        return 0;
    }

    function runAllocator() {
        if (!portfolio) return [];

        const enabledSlots = portfolio.holdings.filter(s => s.enabled);
        if (enabledSlots.length === 0) {
            portfolio.holdings.forEach(s => { s.target_weight = 0; });
            return [];
        }

        const maxCap = portfolio.risk_limits.max_single_weight_pct || 0.40;

        // Separate MANUAL and AUTO slots
        const manualSlots = enabledSlots.filter(s => s.weight_mode === 'MANUAL');
        const autoSlots = enabledSlots.filter(s => s.weight_mode === 'AUTO');

        // Sum manual weights (cap each individually first)
        let manualSum = 0;
        manualSlots.forEach(s => {
            s.target_weight = clamp(s.target_weight, 0, maxCap);
            manualSum += s.target_weight;
        });
        if (manualSum > 1) {
            manualSlots.forEach(s => { s.target_weight = s.target_weight / manualSum; });
            manualSum = 1;
        }

        const remainingWeight = Math.max(0, 1 - manualSum);

        if (autoSlots.length === 0) {
            portfolio.holdings.filter(s => !s.enabled).forEach(s => { s.target_weight = 0; });
            return portfolio.holdings;
        }

        // Single AUTO slot gets all remaining weight
        if (autoSlots.length === 1) {
            autoSlots[0].target_weight = remainingWeight;
            portfolio.holdings.filter(s => !s.enabled).forEach(s => { s.target_weight = 0; });
            return portfolio.holdings;
        }

        // Compute alloc scores for auto slots
        autoSlots.forEach(s => {
            s._alloc_score = Math.max(0, (s.crs_snapshot || 0) + getTierBonus(s.tier_snapshot));
        });

        const totalScore = autoSlots.reduce((sum, s) => sum + s._alloc_score, 0);

        if (totalScore === 0) {
            // Equal weight fallback
            const eqWeight = remainingWeight / autoSlots.length;
            autoSlots.forEach(s => {
                s.target_weight = eqWeight;
                delete s._alloc_score;
            });
        } else {
            // Normalize — distribute remainingWeight proportionally by score
            autoSlots.forEach(s => {
                s.target_weight = (s._alloc_score / totalScore) * remainingWeight;
                delete s._alloc_score;
            });
        }

        // Apply caps with iterative redistribution — track frozen (permanently capped) slots
        const frozenSet = new Set();
        for (let pass = 0; pass < 10; pass++) {
            let excess = 0;
            const uncapped = [];

            autoSlots.forEach(s => {
                if (frozenSet.has(s.slot_id)) return; // already permanently capped
                if (s.target_weight > maxCap) {
                    excess += s.target_weight - maxCap;
                    s.target_weight = maxCap;
                    frozenSet.add(s.slot_id); // permanently frozen
                } else {
                    uncapped.push(s);
                }
            });

            if (excess <= 1e-9) break;
            if (uncapped.length === 0) break; // all capped — remaining excess becomes cash

            // Redistribute excess proportionally among non-frozen slots
            const uncappedTotal = uncapped.reduce((sum, s) => sum + s.target_weight, 0);
            if (uncappedTotal > 0) {
                uncapped.forEach(s => {
                    s.target_weight += excess * (s.target_weight / uncappedTotal);
                });
            } else {
                // All uncapped have 0 weight — distribute equally
                const share = excess / uncapped.length;
                uncapped.forEach(s => { s.target_weight += share; });
            }
        }

        // Disabled slots get 0
        portfolio.holdings.filter(s => !s.enabled).forEach(s => { s.target_weight = 0; });

        // Single enabled slot edge case — always 1.0
        if (enabledSlots.length === 1) {
            enabledSlots[0].target_weight = 1.0;
        }

        return portfolio.holdings;
    }

    // ====================================================================
    // PORTFOLIO EQUITY COMPUTATION
    // ====================================================================
    function getPortfolioEquity() {
        if (!portfolio || portfolio.holdings.length === 0) return { curve: [], totalEquity: 0, totalPnl: 0, portfolioDD: 0, strategyResults: [] };

        const paperSessionsRaw = localStorage.getItem(PAPER_STORAGE_KEY);
        let paperSessions = safeParseJSON(paperSessionsRaw, []);
        if (!Array.isArray(paperSessions)) paperSessions = [];

        const enabledSlots = portfolio.holdings.filter(s => s.enabled && s.target_weight > 0);
        const startingCapital = portfolio.starting_capital || 100000;
        const strategyResults = [];

        enabledSlots.forEach(slot => {
            const allocatedCapital = startingCapital * slot.target_weight;
            // Find matching paper session by strategy config hash or best match
            const sessions = paperSessions.filter(ps =>
                ps && ps.state && (ps.state.candidateId || '').toLowerCase().includes(
                    (slot.label || '').split('@')[0].toLowerCase().replace(/\s+/g, '')
                )
            );

            let equityCurve = [];
            let currentEquity = allocatedCapital;
            let pnl = 0;

            if (sessions.length > 0) {
                const latestSession = sessions[sessions.length - 1];
                if (latestSession.state && latestSession.state.equityCurve && latestSession.state.equityCurve.length > 0) {
                    const sessionEquity = latestSession.state.equityCurve;
                    const sessionStartCap = latestSession.state.startingCapital || latestSession.state.config?.starting_capital || 10000;
                    const scale = allocatedCapital / sessionStartCap;

                    equityCurve = sessionEquity.map(p => ({
                        ts: p.ts || p.t || p.time,
                        value: (p.value || p.equity || p.v || sessionStartCap) * scale
                    }));

                    currentEquity = equityCurve.length > 0 ? equityCurve[equityCurve.length - 1].value : allocatedCapital;
                    pnl = currentEquity - allocatedCapital;
                }
            }

            strategyResults.push({
                slot,
                allocatedCapital,
                currentEquity,
                pnl,
                pnlPct: allocatedCapital > 0 ? pnl / allocatedCapital : 0,
                equityCurve
            });
        });

        // Combine equity curves into portfolio curve
        const totalEquity = strategyResults.reduce((s, r) => s + r.currentEquity, 0);
        const totalPnl = strategyResults.reduce((s, r) => s + r.pnl, 0);

        // Portfolio DD calculation
        let peak = startingCapital;
        let maxDD = 0;

        // Simple portfolio curve: aggregate at each point
        // For simplicity, use latest equity values since paper sessions may have different cadences
        const portfolioCurve = [];
        const maxLen = Math.max(...strategyResults.map(r => r.equityCurve.length), 0);

        for (let i = 0; i < maxLen; i++) {
            let pointEquity = 0;
            let pointTs = null;
            strategyResults.forEach(r => {
                const idx = Math.min(i, r.equityCurve.length - 1);
                if (idx >= 0 && r.equityCurve[idx]) {
                    pointEquity += r.equityCurve[idx].value;
                    if (!pointTs) pointTs = r.equityCurve[idx].ts;
                } else {
                    pointEquity += r.allocatedCapital;
                }
            });

            if (pointEquity > peak) peak = pointEquity;
            const dd = peak > 0 ? (peak - pointEquity) / peak : 0;
            if (dd > maxDD) maxDD = dd;

            portfolioCurve.push({ ts: pointTs, value: pointEquity });
        }

        return {
            curve: portfolioCurve,
            totalEquity: totalEquity || startingCapital,
            totalPnl,
            portfolioDD: maxDD,
            strategyResults
        };
    }

    // ====================================================================
    // PORTFOLIO UI — MODAL
    // ====================================================================
    let modalEl = null;
    let equityChartInstance = null;

    function ensureModal() {
        if (modalEl) return modalEl;
        modalEl = document.createElement('div');
        modalEl.id = 'pf-modal-overlay';
        modalEl.className = 'pf-modal-overlay';
        modalEl.innerHTML = buildModalHTML();
        document.body.appendChild(modalEl);
        attachModalListeners();
        return modalEl;
    }

    function buildModalHTML() {
        return `
<div class="pf-modal">
  <div class="pf-modal-header">
    <div class="pf-modal-title-group">
      <div class="pf-modal-icon">📊</div>
      <h2 class="pf-modal-title">Paper Portfolio</h2>
      <span class="pf-mode-badge">PAPER MODE</span>
    </div>
    <div class="pf-modal-tabs" id="pf-modal-tabs">
      <button class="pf-tab-btn active" data-tab="overview">Overview</button>
      <button class="pf-tab-btn" data-tab="execution">Execution</button>
    </div>
    <button class="pf-modal-close" id="pf-modal-close">&times;</button>
  </div>
  <div class="pf-modal-body">
    <!-- Execution Panel -->
    <div id="pf-execution-panel" class="pf-tab-panel" style="display:none; padding:16px;"></div>
    <!-- Create / Setup Panel -->
    <div id="pf-setup-panel" style="display:none;">
      <div class="pf-setup-card">
        <h3 class="pf-setup-title">Create Paper Portfolio</h3>
        <div class="pf-setup-grid">
          <div class="pf-field">
            <label class="pf-label">Portfolio Name</label>
            <input type="text" id="pf-name-input" class="pf-input" value="My Portfolio" />
          </div>
          <div class="pf-field">
            <label class="pf-label">Starting Capital ($)</label>
            <input type="number" id="pf-capital-input" class="pf-input" value="100000" min="1000" step="1000" />
          </div>
          <div class="pf-field">
            <label class="pf-label">Max Portfolio DD (%)</label>
            <input type="number" id="pf-dd-input" class="pf-input" value="25" min="1" max="100" />
          </div>
          <div class="pf-field">
            <label class="pf-label">Max Single Weight (%)</label>
            <input type="number" id="pf-maxwt-input" class="pf-input" value="40" min="10" max="100" />
          </div>
          <div class="pf-field">
            <label class="pf-label">Min Strategy CRS</label>
            <input type="number" id="pf-mincrs-input" class="pf-input" value="40" min="0" max="100" />
          </div>
        </div>
        <button id="pf-btn-create" class="pf-btn pf-btn-primary" style="margin-top:16px;width:100%;">Create Portfolio</button>
      </div>
    </div>

    <!-- Alert Banners -->
    <div id="pf-alerts" class="pf-alerts"></div>

    <!-- Overview Cards -->
    <div id="pf-overview-panel" style="display:none;">
      <div class="pf-overview-row">
        <div class="pf-overview-card">
          <span class="pf-ov-label">TOTAL EQUITY</span>
          <span class="pf-ov-value" id="pf-ov-equity">$100,000</span>
        </div>
        <div class="pf-overview-card">
          <span class="pf-ov-label">TOTAL PnL</span>
          <span class="pf-ov-value" id="pf-ov-pnl">$0.00</span>
        </div>
        <div class="pf-overview-card">
          <span class="pf-ov-label">PORTFOLIO DD</span>
          <span class="pf-ov-value" id="pf-ov-dd">0.0%</span>
        </div>
        <div class="pf-overview-card">
          <span class="pf-ov-label">ACTIVE STRATEGIES</span>
          <span class="pf-ov-value" id="pf-ov-active">0</span>
        </div>
      </div>

      <!-- Allocation Table -->
      <div class="pf-section">
        <div class="pf-section-header">
          <span class="pf-section-title">STRATEGY ALLOCATIONS</span>
          <button id="pf-btn-recalc" class="pf-btn pf-btn-sm">↻ Recalculate</button>
        </div>
        <div id="pf-alloc-table-wrap" class="pf-alloc-table-wrap">
          <table class="pf-alloc-table">
            <thead>
              <tr>
                <th>Strategy</th>
                <th>State</th>
                <th>CRS</th>
                <th>Weight</th>
                <th>Capital</th>
                <th>Mode</th>
                <th>Enabled</th>
                <th></th>
              </tr>
            </thead>
            <tbody id="pf-alloc-tbody"></tbody>
          </table>
          <div id="pf-alloc-empty" class="pf-alloc-empty">
            No strategies added. Use "Add to Portfolio" from the Strategy Library.
          </div>
        </div>
      </div>

      <!-- Portfolio Equity Curve -->
      <div class="pf-section">
        <div class="pf-section-header">
          <span class="pf-section-title">PORTFOLIO EQUITY CURVE</span>
        </div>
        <div class="pf-chart-container">
          <canvas id="pf-equity-canvas"></canvas>
          <div id="pf-chart-empty" class="pf-chart-empty">
            Start paper trading on added strategies to see the portfolio equity curve.
          </div>
        </div>
      </div>

      <!-- Per-Strategy Contributions -->
      <div class="pf-section">
        <div class="pf-section-header">
          <span class="pf-section-title">STRATEGY CONTRIBUTIONS</span>
        </div>
        <div id="pf-contributions" class="pf-contributions"></div>
      </div>

      <!-- Portfolio Settings -->
      <div class="pf-section">
        <div class="pf-section-header">
          <span class="pf-section-title">PORTFOLIO SETTINGS</span>
        </div>
        <div class="pf-settings-row">
          <span class="pf-settings-label">Starting Capital</span>
          <span class="pf-settings-value" id="pf-set-capital">$100,000</span>
        </div>
        <div class="pf-settings-row">
          <span class="pf-settings-label">Max DD Limit</span>
          <span class="pf-settings-value" id="pf-set-dd">25%</span>
        </div>
        <div class="pf-settings-row">
          <span class="pf-settings-label">Max Single Weight</span>
          <span class="pf-settings-value" id="pf-set-maxwt">40%</span>
        </div>
        <div class="pf-settings-row">
          <span class="pf-settings-label">Min CRS Eligibility</span>
          <span class="pf-settings-value" id="pf-set-crs">40</span>
        </div>
        <div style="margin-top:12px;display:flex;gap:8px;">
          <button id="pf-btn-reset" class="pf-btn pf-btn-danger pf-btn-sm">Reset Portfolio</button>
        </div>
      </div>

      <!-- Attribution & Diagnostics (v1) -->
      <div id="pf-attribution-section" class="pf-section">
        <div class="pf-section-header">
          <span class="pf-section-title">ATTRIBUTION & DIAGNOSTICS</span>
          <button id="pf-btn-export-diagnostics" class="pf-btn pf-btn-sm" style="background:rgba(56, 189, 248, 0.1); color:#38bdf8; border-color:rgba(56, 189, 248, 0.2);">📥 Export JSON</button>
        </div>
        
        <!-- Summary Cards -->
        <div id="pf-diag-summaries" style="display:grid; grid-template-columns:repeat(4, 1fr); gap:10px; margin-bottom:16px;">
          <!-- Injected via renderModal -->
        </div>

        <!-- Problem Detector -->
        <div id="pf-problem-detector" style="background:rgba(248, 113, 113, 0.05); border:1px solid rgba(248, 113, 113, 0.15); border-radius:8px; padding:12px; margin-bottom:16px; display:none;">
          <div style="font-size:0.75rem; font-weight:700; color:#f87171; margin-bottom:8px; text-transform:uppercase; letter-spacing:0.5px;">Problem Detector</div>
          <ul id="pf-problem-bullets" style="margin:0; padding-left:18px; font-size:0.8rem; color:#cbd5e1; line-height:1.5;"></ul>
        </div>

        <!-- Strategy Contribution Table -->
        <div class="pf-alloc-table-wrap">
          <table class="pf-alloc-table">
            <thead>
              <tr>
                <th>Strategy</th>
                <th>Weight</th>
                <th>PnL $</th>
                <th>Contrib %</th>
                <th>MaxDD</th>
                <th>CurrDD</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody id="pf-attribution-tbody"></tbody>
          </table>
        </div>

        <!-- Correlation & Overlap Zone -->
        <div id="pf-correlation-zone" style="margin-top:16px; display:none;">
          <div style="font-size:0.72rem; text-transform:uppercase; color:#64748b; font-weight:600; margin-bottom:8px; letter-spacing:0.5px;">Correlation Matrix (Returns)</div>
          <div id="pf-correlation-matrix-wrap" style="overflow-x:auto;"></div>
        </div>
      </div>
    </div>
  </div>
</div>`;
    }

    function attachModalListeners() {
        modalEl.querySelector('#pf-modal-close').addEventListener('click', closeModal);
        modalEl.addEventListener('click', e => { if (e.target === modalEl) closeModal(); });

        // Tab Switching
        const tabs = modalEl.querySelectorAll('.pf-tab-btn');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                const target = tab.dataset.tab;

                // Track current tab
                modalEl.dataset.activeTab = target;
                renderModal();
            });
        });

        modalEl.querySelector('#pf-btn-create').addEventListener('click', () => {
            const name = modalEl.querySelector('#pf-name-input').value.trim() || 'My Portfolio';
            const capital = parseFloat(modalEl.querySelector('#pf-capital-input').value) || 100000;
            const maxDD = parseFloat(modalEl.querySelector('#pf-dd-input').value) || 25;
            const maxWt = parseFloat(modalEl.querySelector('#pf-maxwt-input').value) || 40;
            const minCrs = parseFloat(modalEl.querySelector('#pf-mincrs-input').value) || 40;
            createPortfolio({
                name, starting_capital: capital,
                max_dd: maxDD, max_weight: maxWt / 100, min_crs: minCrs
            });
            renderModal();
            showToast('Portfolio created!', '#4ade80');
        });

        modalEl.querySelector('#pf-btn-recalc').addEventListener('click', () => {
            refreshEligibility();
            runAllocator();
            savePortfolio();
            renderModal();
            showToast('Allocations recalculated', '#818cf8');
        });

        modalEl.querySelector('#pf-btn-reset').addEventListener('click', () => {
            if (!confirm('Reset portfolio? This will remove all slots and settings.')) return;
            portfolio = null;
            localStorage.removeItem(STORAGE_KEY);
            renderModal();
            showToast('Portfolio reset', '#f87171');
        });
    }

    function openModal() {
        ensureModal();
        renderModal();
        modalEl.style.display = 'flex';
    }

    function closeModal() {
        if (modalEl) modalEl.style.display = 'none';
    }

    function renderModal() {
        if (!modalEl) return;
        const setupPanel = modalEl.querySelector('#pf-setup-panel');
        const overviewPanel = modalEl.querySelector('#pf-overview-panel');
        const executionPanel = modalEl.querySelector('#pf-execution-panel');
        const tabsContainer = modalEl.querySelector('#pf-modal-tabs');
        const alertsArea = modalEl.querySelector('#pf-alerts');
        alertsArea.innerHTML = '';

        if (!portfolio) {
            setupPanel.style.display = 'block';
            overviewPanel.style.display = 'none';
            executionPanel.style.display = 'none';
            tabsContainer.style.display = 'none';
            return;
        }

        tabsContainer.style.display = 'flex';
        const activeTab = modalEl.dataset.activeTab || 'overview';

        if (activeTab === 'execution') {
            setupPanel.style.display = 'none';
            overviewPanel.style.display = 'none';
            executionPanel.style.display = 'block';
            if (window.PaperExecution) {
                window.PaperExecution.renderTab(executionPanel);
            } else {
                executionPanel.innerHTML = '<div style="padding:40px;text-align:center;color:#64748b;">PaperExecution module not loaded.</div>';
            }
            return;
        }

        setupPanel.style.display = 'none';
        overviewPanel.style.display = 'block';
        executionPanel.style.display = 'none';

        // Compute equity
        const eq = getPortfolioEquity();
        const enabledCount = portfolio.holdings.filter(s => s.enabled).length;

        // Overview cards
        modalEl.querySelector('#pf-ov-equity').textContent = fmtMoney(eq.totalEquity);
        const pnlEl = modalEl.querySelector('#pf-ov-pnl');
        pnlEl.textContent = (eq.totalPnl >= 0 ? '+' : '') + fmtMoney(eq.totalPnl);
        pnlEl.style.color = eq.totalPnl >= 0 ? '#4ade80' : '#f87171';

        const ddEl = modalEl.querySelector('#pf-ov-dd');
        ddEl.textContent = (eq.portfolioDD * 100).toFixed(1) + '%';
        ddEl.style.color = eq.portfolioDD > 0.15 ? '#f87171' : eq.portfolioDD > 0.05 ? '#fbbf24' : '#4ade80';

        modalEl.querySelector('#pf-ov-active').textContent = enabledCount;

        // Alerts
        if (eq.portfolioDD * 100 > portfolio.risk_limits.max_portfolio_dd_pct) {
            alertsArea.innerHTML += `<div class="pf-alert pf-alert-danger">
                ⚠ Portfolio DD (${(eq.portfolioDD * 100).toFixed(1)}%) exceeds limit (${portfolio.risk_limits.max_portfolio_dd_pct}%)
            </div>`;
        }

        // Check eligibility warnings
        portfolio.holdings.forEach(slot => {
            if (slot.enabled && !checkEligibility(slot)) {
                alertsArea.innerHTML += `<div class="pf-alert pf-alert-warn">
                    ⚠ "${slot.label}" is below eligibility threshold (CRS: ${slot.crs_snapshot}, Tier: ${slot.tier_snapshot})
                </div>`;
            }
        });

        // Single slot cap warning
        if (enabledCount === 1) {
            const single = portfolio.holdings.find(s => s.enabled);
            if (single && single.target_weight === 1.0 && portfolio.risk_limits.max_single_weight_pct < 1.0) {
                alertsArea.innerHTML += `<div class="pf-alert pf-alert-info">
                    ℹ Single strategy at 100% weight exceeds max single weight cap (${(portfolio.risk_limits.max_single_weight_pct * 100).toFixed(0)}%). Add more strategies to diversify.
                </div>`;
            }
        }

        // Allocation table
        renderAllocationTable();

        // Settings
        modalEl.querySelector('#pf-set-capital').textContent = fmtMoney(portfolio.starting_capital);
        modalEl.querySelector('#pf-set-dd').textContent = portfolio.risk_limits.max_portfolio_dd_pct + '%';
        modalEl.querySelector('#pf-set-maxwt').textContent = (portfolio.risk_limits.max_single_weight_pct * 100).toFixed(0) + '%';
        modalEl.querySelector('#pf-set-crs').textContent = portfolio.risk_limits.min_strategy_crs;

        // Equity chart
        renderEquityChart(eq);

        // Contributions
        renderContributions(eq);

        // --- Attribution & Diagnostics (v1) ---
        renderAttribution(eq);
    }

    function renderAttribution(eq) {
        const PA = window.PortfolioAttribution;
        const section = modalEl.querySelector('#pf-attribution-section');
        if (!PA || !section) return;

        const attr = PA.computeAttribution(portfolio, eq);
        if (!attr) {
            section.style.display = 'none';
            return;
        }
        section.style.display = 'block';

        // Summary Cards
        const summaryGrid = modalEl.querySelector('#pf-diag-summaries');
        const p = attr.portfolio;
        summaryGrid.innerHTML = `
            <div class="pf-overview-card" style="padding:10px;">
                <span class="pf-ov-label" style="font-size:0.6rem;">BEST CONTRIB</span>
                <span class="pf-ov-value" style="font-size:0.9rem; color:#4ade80;">${p.top_contributor ? p.top_contributor.label : '—'}</span>
            </div>
            <div class="pf-overview-card" style="padding:10px;">
                <span class="pf-ov-label" style="font-size:0.6rem;">WORST DRAG</span>
                <span class="pf-ov-value" style="font-size:0.9rem; color:#f87171;">${p.worst_drag ? p.worst_drag.label : '—'}</span>
            </div>
            <div class="pf-overview-card" style="padding:10px;">
                <span class="pf-ov-label" style="font-size:0.6rem;">AVG CORR</span>
                <span class="pf-ov-value" style="font-size:0.9rem;">${p.correlation ? p.correlation.avg.toFixed(2) : '—'}</span>
            </div>
            <div class="pf-overview-card" style="padding:10px;">
                <span class="pf-ov-label" style="font-size:0.6rem;">RISK CONC.</span>
                <span class="pf-ov-value" style="font-size:0.9rem; color:${p.risk_concentration > 0.5 ? '#f87171' : '#4ade80'}">${(p.risk_concentration * 100).toFixed(0)}%</span>
            </div>
        `;

        // Problem Detector
        const detector = modalEl.querySelector('#pf-problem-detector');
        const bulletList = modalEl.querySelector('#pf-problem-bullets');
        if (p.bullets && p.bullets.length > 0) {
            detector.style.display = 'block';
            bulletList.innerHTML = p.bullets.map(b => `<li>${b}</li>`).join('');
        } else {
            detector.style.display = 'none';
        }

        // Attribution Table
        const tbody = modalEl.querySelector('#pf-attribution-tbody');
        tbody.innerHTML = attr.slots.map(s => {
            const statusColor = s.status === 'HEALTHY' ? '#4ade80' : s.status === 'DRAGGING' ? '#fbbf24' : '#f87171';
            return `<tr>
                <td style="font-size:0.75rem; font-weight:500; color:#e2e8f0;">${s.label}</td>
                <td style="font-size:0.75rem; color:#94a3b8;">${(s.weight * 100).toFixed(1)}%</td>
                <td style="font-size:0.75rem; color:${s.pnl >= 0 ? '#4ade80' : '#f87171'};">${s.pnl >= 0 ? '+' : ''}${fmtMoney(s.pnl)}</td>
                <td style="font-size:0.75rem; color:${s.contribReturnPct >= 0 ? '#4ade80' : '#f87171'};">${s.contribReturnPct >= 0 ? '+' : ''}${(s.contribReturnPct * 100).toFixed(2)}%</td>
                <td style="font-size:0.75rem; color:#94a3b8;">${(s.maxDD * 100).toFixed(1)}%</td>
                <td style="font-size:0.75rem; color:${s.currentDD > 0.1 ? '#f87171' : '#94a3b8'};">${(s.currentDD * 100).toFixed(1)}%</td>
                <td><span style="font-size:0.6rem; font-weight:700; color:${statusColor}; border:1px solid ${statusColor}40; padding:2px 6px; border-radius:4px;">${s.status}</span></td>
            </tr>`;
        }).join('');

        // Correlation Matrix
        const corrZone = modalEl.querySelector('#pf-correlation-zone');
        const matrixWrap = modalEl.querySelector('#pf-correlation-matrix-wrap');
        if (p.correlation && p.correlation.matrix.length > 0) {
            corrZone.style.display = 'block';
            let table = '<table style="width:100%; border-collapse:collapse; font-size:0.65rem; color:#94a3b8; font-family:\'JetBrains Mono\', monospace;"><thead><tr><th style="padding:4px;"></th>';
            p.correlation.labels.forEach((l, i) => {
                table += `<th style="padding:4px; text-align:center;" title="${l}">S${i + 1}</th>`;
            });
            table += '</tr></thead><tbody>';
            p.correlation.matrix.forEach((row, i) => {
                table += `<tr><td style="padding:4px; font-weight:700;" title="${p.correlation.labels[i]}">S${i + 1}</td>`;
                row.forEach(val => {
                    const color = val > 0.7 ? '#f87171' : val > 0.4 ? '#fbbf24' : '#4ade80';
                    table += `<td style="padding:4px; text-align:center; color:${color}; background:rgba(255,255,255,0.02);">${val.toFixed(2)}</td>`;
                });
                table += '</tr>';
            });
            table += '</tbody></table>';
            matrixWrap.innerHTML = table;
        } else {
            corrZone.style.display = 'none';
        }
    }

    function renderAllocationTable() {
        const tbody = modalEl.querySelector('#pf-alloc-tbody');
        const emptyEl = modalEl.querySelector('#pf-alloc-empty');
        const startingCapital = portfolio.starting_capital || 100000;

        if (portfolio.holdings.length === 0) {
            tbody.innerHTML = '';
            emptyEl.style.display = 'block';
            return;
        }

        emptyEl.style.display = 'none';
        let html = '';

        portfolio.holdings.forEach(slot => {
            const eligible = checkEligibility(slot);
            const allocCapital = startingCapital * slot.target_weight;
            const tierColors = getTierColors(slot.tier_snapshot);

            const displayLabel = slot.label || slot.strategy_id || `Slot ${slot.slot_id?.substring(0, 6) || '?'}`;
            html += `<tr class="pf-alloc-row ${!eligible ? 'pf-ineligible' : ''}">
                <td class="pf-alloc-name">
                    <span class="pf-alloc-label">${escHtml(displayLabel)}</span>
                    ${!eligible ? '<span class="pf-badge-ineligible">INELIGIBLE</span>' : ''}
                </td>
                <td><span class="pf-tier-badge" style="color:${tierColors.color};background:${tierColors.bg};border-color:${tierColors.border}">${slot.tier_snapshot}</span></td>
                <td class="pf-alloc-crs">${slot.crs_snapshot != null ? slot.crs_snapshot.toFixed(0) : '—'}</td>
                <td class="pf-alloc-weight-cell">
                    <div class="pf-weight-bar-wrap">
                        <div class="pf-weight-bar" style="width:${(slot.target_weight * 100).toFixed(1)}%"></div>
                    </div>
                    <span class="pf-weight-pct">${(slot.target_weight * 100).toFixed(1)}%</span>
                </td>
                <td class="pf-alloc-capital">${fmtMoney(allocCapital)}</td>
                <td>
                    <select class="pf-mode-select" data-slot="${slot.slot_id}">
                        <option value="AUTO" ${slot.weight_mode === 'AUTO' ? 'selected' : ''}>Auto</option>
                        <option value="MANUAL" ${slot.weight_mode === 'MANUAL' ? 'selected' : ''}>Manual</option>
                    </select>
                    ${slot.weight_mode === 'MANUAL' ? `<input type="number" class="pf-manual-wt" data-slot="${slot.slot_id}" value="${(slot.target_weight * 100).toFixed(0)}" min="0" max="100" step="5" style="width:50px;margin-left:4px;" />%` : ''}
                </td>
                <td>
                    <label class="pf-toggle">
                        <input type="checkbox" class="pf-enable-cb" data-slot="${slot.slot_id}" ${slot.enabled ? 'checked' : ''} />
                        <span class="pf-toggle-slider"></span>
                    </label>
                </td>
                <td>
                    <button class="pf-btn-remove" data-slot="${slot.slot_id}" title="Remove">✕</button>
                </td>
            </tr>`;
        });

        tbody.innerHTML = html;

        // Weight sum row
        const totalWeight = portfolio.holdings.reduce((s, slot) => s + slot.target_weight, 0);
        tbody.innerHTML += `<tr class="pf-alloc-total">
            <td colspan="3" style="text-align:right;font-weight:600;color:#94a3b8;">TOTAL</td>
            <td class="pf-alloc-weight-cell"><span class="pf-weight-pct" style="color:${Math.abs(totalWeight - 1) < 0.01 ? '#4ade80' : '#fbbf24'}">${(totalWeight * 100).toFixed(1)}%</span></td>
            <td class="pf-alloc-capital">${fmtMoney(portfolio.starting_capital * totalWeight)}</td>
            <td colspan="3"></td>
        </tr>`;

        // Bind events
        tbody.querySelectorAll('.pf-mode-select').forEach(sel => {
            sel.addEventListener('change', e => {
                const slotId = e.target.dataset.slot;
                updateSlot(slotId, { weight_mode: e.target.value });
                renderModal();
            });
        });

        tbody.querySelectorAll('.pf-manual-wt').forEach(inp => {
            inp.addEventListener('change', e => {
                const slotId = e.target.dataset.slot;
                const wt = clamp(parseFloat(e.target.value) / 100, 0, 1);
                updateSlot(slotId, { target_weight: wt });
                renderModal();
            });
        });

        tbody.querySelectorAll('.pf-enable-cb').forEach(cb => {
            cb.addEventListener('change', e => {
                const slotId = e.target.dataset.slot;
                updateSlot(slotId, { enabled: e.target.checked });
                renderModal();
            });
        });

        tbody.querySelectorAll('.pf-btn-remove').forEach(btn => {
            btn.addEventListener('click', e => {
                const slotId = e.target.dataset.slot || e.target.closest('[data-slot]')?.dataset.slot;
                if (slotId && confirm('Remove this strategy from portfolio?')) {
                    removeSlot(slotId);
                    renderModal();
                }
            });
        });
    }

    function renderEquityChart(eq) {
        const canvas = modalEl.querySelector('#pf-equity-canvas');
        const emptyEl = modalEl.querySelector('#pf-chart-empty');

        if (!eq.curve || eq.curve.length < 2) {
            emptyEl.style.display = 'flex';
            canvas.style.display = 'none';
            return;
        }

        emptyEl.style.display = 'none';
        canvas.style.display = 'block';

        // Use Chart.js if available
        if (typeof Chart !== 'undefined') {
            if (equityChartInstance) {
                equityChartInstance.destroy();
            }

            const labels = eq.curve.map((p, i) => {
                if (p.ts) {
                    const d = new Date(p.ts);
                    return `${d.getMonth() + 1}/${d.getDate()}`;
                }
                return i;
            });

            equityChartInstance = new Chart(canvas.getContext('2d'), {
                type: 'line',
                data: {
                    labels,
                    datasets: [{
                        label: 'Portfolio Equity',
                        data: eq.curve.map(p => p.value),
                        borderColor: '#818cf8',
                        backgroundColor: 'rgba(129, 140, 248, 0.1)',
                        borderWidth: 2,
                        pointRadius: 0,
                        fill: true,
                        tension: 0.3
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: ctx => fmtMoney(ctx.raw)
                            }
                        }
                    },
                    scales: {
                        x: {
                            display: true,
                            grid: { color: 'rgba(255,255,255,0.03)' },
                            ticks: { color: '#64748b', font: { size: 10 }, maxTicksLimit: 10 }
                        },
                        y: {
                            display: true,
                            grid: { color: 'rgba(255,255,255,0.03)' },
                            ticks: {
                                color: '#64748b', font: { size: 10 },
                                callback: v => '$' + (v / 1000).toFixed(0) + 'k'
                            }
                        }
                    }
                }
            });
        } else {
            // Fallback: simple text
            emptyEl.textContent = 'Chart.js not loaded. Equity: ' + fmtMoney(eq.totalEquity);
            emptyEl.style.display = 'flex';
        }
    }

    function renderContributions(eq) {
        const container = modalEl.querySelector('#pf-contributions');
        if (!eq.strategyResults || eq.strategyResults.length === 0) {
            container.innerHTML = '<div class="pf-contrib-empty">No active strategies with equity data.</div>';
            return;
        }

        let html = '';
        eq.strategyResults.forEach(r => {
            const pnlColor = r.pnl >= 0 ? '#4ade80' : '#f87171';
            const pnlPctStr = (r.pnlPct * 100).toFixed(2);
            html += `<div class="pf-contrib-item">
                <span class="pf-contrib-name">${escHtml(r.slot.label)}</span>
                <span class="pf-contrib-alloc">${fmtMoney(r.allocatedCapital)}</span>
                <span class="pf-contrib-equity">${fmtMoney(r.currentEquity)}</span>
                <span class="pf-contrib-pnl" style="color:${pnlColor}">${r.pnl >= 0 ? '+' : ''}${fmtMoney(r.pnl)} (${pnlPctStr}%)</span>
            </div>`;
        });
        container.innerHTML = html;
    }

    function getTierColors(tier) {
        const t = (tier || '').toUpperCase();
        if (t === 'PRODUCTION') return { color: '#a78bfa', bg: 'rgba(167,139,250,0.10)', border: 'rgba(167,139,250,0.25)' };
        if (t === 'VALIDATED' || t.includes('CAPITAL')) return { color: '#4ade80', bg: 'rgba(74,222,128,0.10)', border: 'rgba(74,222,128,0.25)' };
        if (t.includes('RESEARCH')) return { color: '#60a5fa', bg: 'rgba(96,165,250,0.10)', border: 'rgba(96,165,250,0.25)' };
        return { color: '#94a3b8', bg: 'rgba(148,163,184,0.08)', border: 'rgba(148,163,184,0.15)' };
    }

    function escHtml(s) {
        const d = document.createElement('div');
        d.textContent = s || '';
        return d.innerHTML;
    }

    // ====================================================================
    // INTEGRATION — INJECT "ADD TO PORTFOLIO" BUTTONS
    // ====================================================================
    function injectButtons() {
        // 1. Portfolio button in left panel (near Strategy Library)
        const slContainer = document.querySelector('#sl-buttons-container');
        if (slContainer && !document.querySelector('#btn-open-portfolio')) {
            const btnPortfolio = document.createElement('button');
            btnPortfolio.id = 'btn-open-portfolio';
            btnPortfolio.className = 'bt-btn-sm';
            Object.assign(btnPortfolio.style, {
                justifyContent: 'center', padding: '8px', fontSize: '0.72rem',
                background: 'rgba(167,139,250,0.08)', color: '#c4b5fd',
                border: '1px solid rgba(167,139,250,0.25)', gridColumn: 'span 2',
                marginTop: '4px'
            });
            btnPortfolio.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" style="margin-right:4px;"><path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" stroke="currentColor" stroke-width="2"/><path d="M9 12h6M12 9v6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>Paper Portfolio`;
            btnPortfolio.addEventListener('click', openModal);
            slContainer.appendChild(btnPortfolio);
        }

        // 2. Hook into Strategy Library detail view to add "Add to Portfolio" button
        injectLibraryHook();
    }

    function injectLibraryHook() {
        // Use MutationObserver to detect when Strategy Library detail view opens
        const observer = new MutationObserver(() => {
            const detail = document.querySelector('#sl-lib-detail');
            if (!detail || detail.style.display === 'none') return;

            // Only inject once
            if (detail.querySelector('#pf-add-from-lib')) return;

            const exportBtn = detail.querySelector('#sl-btn-export');
            if (!exportBtn) return;

            const addBtn = document.createElement('button');
            addBtn.id = 'pf-add-from-lib';
            Object.assign(addBtn.style, {
                padding: '5px 14px', borderRadius: '6px', fontSize: '0.7rem',
                fontWeight: '600', cursor: 'pointer',
                background: 'rgba(167,139,250,0.12)', color: '#c4b5fd',
                border: '1px solid rgba(167,139,250,0.3)',
                fontFamily: "'Inter', sans-serif"
            });
            addBtn.textContent = '📊 Add to Portfolio';
            addBtn.addEventListener('click', () => {
                // Find the currently viewed strategy
                const backBtn = detail.querySelector('#sl-detail-back');
                const nameEl = detail.querySelector('h4');
                if (!nameEl) return;
                const strategyName = nameEl.textContent;

                const SL = window.StrategyLifecycle;
                if (!SL) return;
                const strategy = SL.getStrategyByName(strategyName);
                if (!strategy) { showToast('Strategy not found', '#f87171'); return; }

                // Ensure portfolio exists
                if (!portfolio) {
                    createPortfolio();
                }
                addSlot(strategy.strategy_id, null);
                renderModal();
            });

            exportBtn.parentElement.appendChild(addBtn);
        });

        observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
    }

    function injectBacktestHook() {
        // Hook into backtest completion: add "Add to Portfolio" to post-run actions
        // Watch for #export-group visibility or custom event
        const observer = new MutationObserver(() => {
            const exportGroup = document.querySelector('#export-group');
            if (!exportGroup) return;
            if (exportGroup.querySelector('#pf-add-from-backtest')) return;

            // Only show if there are results
            const metricsEl = document.querySelector('[data-metric="totalReturn"]');
            if (!metricsEl || !metricsEl.textContent || metricsEl.textContent === '—') return;

            const addBtn = document.createElement('button');
            addBtn.id = 'pf-add-from-backtest';
            addBtn.className = 'bt-btn-sm';
            Object.assign(addBtn.style, {
                justifyContent: 'center', padding: '6px 12px', fontSize: '0.72rem',
                background: 'rgba(167,139,250,0.08)', color: '#c4b5fd',
                border: '1px solid rgba(167,139,250,0.25)', marginTop: '6px',
                width: '100%'
            });
            addBtn.textContent = '📊 Add to Portfolio';
            addBtn.addEventListener('click', () => {
                // Try to find the strategy from the save modal or preset
                const SL = window.StrategyLifecycle;
                if (!SL) { showToast('Strategy Lifecycle not loaded', '#f87171'); return; }

                const strategies = SL.listStrategies();
                if (strategies.length === 0) {
                    showToast('Save as a Strategy Version first, then add to portfolio', '#fbbf24');
                    return;
                }

                if (!portfolio) createPortfolio();

                // Show quick picker
                showStrategyPicker(strategies);
            });

            exportGroup.appendChild(addBtn);
        });

        observer.observe(document.body, { childList: true, subtree: true });
    }

    function showStrategyPicker(strategies) {
        // Simple modal picker to choose which strategy to add
        const existing = document.querySelector('#pf-picker-overlay');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id = 'pf-picker-overlay';
        Object.assign(overlay.style, {
            position: 'fixed', inset: '0', zIndex: '10002',
            background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
        });

        let listHTML = strategies.slice(0, 20).map(s => {
            const ver = s.versions.length > 0 ? s.versions[s.versions.length - 1].version : '—';
            const crs = s.versions.length > 0 ? (s.versions[s.versions.length - 1].snapshots?.readiness?.crs ?? '—') : '—';
            return `<div class="pf-picker-item" data-sid="${s.strategy_id}" style="padding:10px 14px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,0.04);display:flex;justify-content:space-between;align-items:center;transition:background 0.15s;">
                <div>
                    <span style="color:#e2e8f0;font-weight:500;">${escHtml(s.name)}</span>
                    <span style="color:#64748b;font-size:0.7rem;margin-left:8px;">v${ver}</span>
                </div>
                <div style="display:flex;gap:8px;align-items:center;">
                    <span style="color:#94a3b8;font-size:0.7rem;font-family:'JetBrains Mono',monospace;">CRS: ${typeof crs === 'number' ? crs.toFixed(0) : crs}</span>
                    <span style="padding:2px 8px;border-radius:4px;font-size:0.6rem;font-weight:600;color:#a5b4fc;background:rgba(99,102,241,0.15);border:1px solid rgba(99,102,241,0.25);">${s.state}</span>
                </div>
            </div>`;
        }).join('');

        overlay.innerHTML = `<div style="background:#0f172a;border:1px solid rgba(167,139,250,0.2);border-radius:12px;width:480px;max-width:90vw;max-height:70vh;overflow:hidden;font-family:'Inter',sans-serif;">
            <div style="padding:16px 20px;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;justify-content:space-between;align-items:center;">
                <h3 style="margin:0;color:#e2e8f0;font-size:0.95rem;">Add Strategy to Portfolio</h3>
                <button id="pf-picker-close" style="background:none;border:none;color:#64748b;font-size:1.2rem;cursor:pointer;">&times;</button>
            </div>
            <div style="max-height:50vh;overflow-y:auto;">${listHTML || '<div style="padding:24px;color:#64748b;text-align:center;">No strategies available. Save a strategy version first.</div>'}</div>
        </div>`;

        document.body.appendChild(overlay);

        overlay.querySelector('#pf-picker-close').addEventListener('click', () => overlay.remove());
        overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

        overlay.querySelectorAll('.pf-picker-item').forEach(item => {
            item.addEventListener('mouseenter', () => { item.style.background = 'rgba(99,102,241,0.08)'; });
            item.addEventListener('mouseleave', () => { item.style.background = 'transparent'; });
            item.addEventListener('click', () => {
                const sid = item.dataset.sid;
                addSlot(sid, null);
                overlay.remove();
                renderModal();
            });
        });
    }

    // ====================================================================
    // SELF-TEST
    // ====================================================================
    function selfTest() {
        console.log('=== PORTFOLIO MANAGER v1 — SELF-TEST ===');
        let pass = 0, fail = 0;
        const assert = (cond, msg) => {
            if (cond) { console.log('✅ PASS:', msg); pass++; }
            else { console.error('❌ FAIL:', msg); fail++; }
        };

        // Backup
        const backup = portfolio ? JSON.parse(JSON.stringify(portfolio)) : null;
        const backupStorage = localStorage.getItem(STORAGE_KEY);

        try {
            // 1. Create portfolio
            const p = createPortfolio({ name: 'Test Portfolio', starting_capital: 100000, max_dd: 20, max_weight: 0.40, min_crs: 30 });
            assert(p.portfolio_id.startsWith('pf-'), '1. Portfolio created with ID');
            assert(p.starting_capital === 100000, '1b. Starting capital set');
            assert(p.risk_limits.max_single_weight_pct === 0.40, '1c. Max weight set');

            // 2. Allocator with no slots
            const r0 = runAllocator();
            assert(r0.length === 0, '2. Empty allocator returns empty');

            // 3. Add mock slot directly (bypass StrategyLifecycle dependency)
            portfolio.holdings.push({
                slot_id: 'test-slot-1', strategy_id: 's1', version_id: 'v1',
                label: 'Test@1.0.0', crs_snapshot: 80, tier_snapshot: 'PRODUCTION',
                weight_mode: 'AUTO', target_weight: 0, enabled: true
            });
            runAllocator();
            assert(portfolio.holdings[0].target_weight === 1.0, '3. Single slot gets 100% weight');

            // 4. Cap redistribution with 3 AUTO slots (3×40%=120% ≥ 100%, so full alloc possible)
            portfolio.holdings.push({
                slot_id: 'test-slot-2', strategy_id: 's2', version_id: 'v2',
                label: 'Test2@1.0.0', crs_snapshot: 30, tier_snapshot: 'RESEARCH',
                weight_mode: 'AUTO', target_weight: 0, enabled: true
            });
            portfolio.holdings.push({
                slot_id: 'test-slot-extra', strategy_id: 's_extra', version_id: 'v_extra',
                label: 'TestExtra@1.0.0', crs_snapshot: 20, tier_snapshot: 'RESEARCH',
                weight_mode: 'AUTO', target_weight: 0, enabled: true
            });
            runAllocator();
            const w1 = portfolio.holdings[0].target_weight;
            assert(w1 <= 0.401, '4a. Top slot capped at max weight');
            const totalW4 = portfolio.holdings.reduce((s, h) => s + h.target_weight, 0);
            assert(Math.abs(totalW4 - 1.0) < 0.01, '4b. 3-slot total = 1.0 after redistribution');
            // Remove extra slot for subsequent tests
            portfolio.holdings = portfolio.holdings.filter(s => s.slot_id !== 'test-slot-extra');
            // 4c. Two-slot all-capped edge case: 2×40%=80% < 100% → unallocated cash
            const savedCrs = portfolio.holdings[1].crs_snapshot;
            const savedTier = portfolio.holdings[1].tier_snapshot;
            portfolio.holdings[1].crs_snapshot = 80;
            portfolio.holdings[1].tier_snapshot = 'PRODUCTION';
            runAllocator();
            const allCappedTotal = portfolio.holdings[0].target_weight + portfolio.holdings[1].target_weight;
            assert(Math.abs(allCappedTotal - 0.80) < 0.01, '4c. 2-slot all-capped = 80% (unallocated cash by design)');
            portfolio.holdings[1].crs_snapshot = savedCrs;
            portfolio.holdings[1].tier_snapshot = savedTier;

            // 5. Manual override
            portfolio.holdings[0].weight_mode = 'MANUAL';
            portfolio.holdings[0].target_weight = 0.30;
            runAllocator();
            assert(portfolio.holdings[0].target_weight === 0.30, '5a. Manual weight respected');
            assert(Math.abs(portfolio.holdings[1].target_weight - 0.70) < 0.01, '5b. AUTO slot gets remainder');

            // 6. Eligibility
            portfolio.holdings.push({
                slot_id: 'test-slot-3', strategy_id: 's3', version_id: 'v3',
                label: 'Test3@1.0.0', crs_snapshot: 10, tier_snapshot: 'DRAFT',
                weight_mode: 'AUTO', target_weight: 0, enabled: true
            });
            const eligible = checkEligibility(portfolio.holdings[2]);
            assert(!eligible, '6. Low CRS DRAFT strategy is ineligible');

            // 7. Disabled slot gets 0 weight
            portfolio.holdings[2].enabled = false;
            runAllocator();
            assert(portfolio.holdings[2].target_weight === 0, '7. Disabled slot gets 0 weight');

            // 8. Persistence
            savePortfolio();
            const rawStored = localStorage.getItem(STORAGE_KEY);
            const parsed = safeParseJSON(rawStored, null);
            assert(parsed && parsed.portfolio_id === portfolio.portfolio_id, '8. Portfolio persisted to localStorage');

            // 9. Tier bonus
            assert(getTierBonus('PRODUCTION') === 20, '9a. PRODUCTION tier bonus = 20');
            assert(getTierBonus('VALIDATED') === 10, '9b. VALIDATED tier bonus = 10');
            assert(getTierBonus('DRAFT') === 0, '9c. DRAFT tier bonus = 0');

            // 10. Cap redistribution with 3 AUTO slots
            portfolio.holdings = [
                { slot_id: 'a', strategy_id: 'a', version_id: 'a', label: 'A', crs_snapshot: 90, tier_snapshot: 'PRODUCTION', weight_mode: 'AUTO', target_weight: 0, enabled: true },
                { slot_id: 'b', strategy_id: 'b', version_id: 'b', label: 'B', crs_snapshot: 80, tier_snapshot: 'VALIDATED', weight_mode: 'AUTO', target_weight: 0, enabled: true },
                { slot_id: 'c', strategy_id: 'c', version_id: 'c', label: 'C', crs_snapshot: 70, tier_snapshot: 'VALIDATED', weight_mode: 'AUTO', target_weight: 0, enabled: true },
            ];
            runAllocator();
            const totalW = portfolio.holdings.reduce((s, h) => s + h.target_weight, 0);
            assert(Math.abs(totalW - 1.0) < 0.01, '10a. 3-slot total = 1.0');
            assert(portfolio.holdings.every(h => h.target_weight <= 0.401), '10b. All slots within cap');

        } catch (e) {
            console.error('Test exception:', e);
            fail++;
        }

        // Restore
        if (backup) {
            portfolio = backup;
            localStorage.setItem(STORAGE_KEY, JSON.stringify(backup));
        } else {
            portfolio = null;
            if (backupStorage) localStorage.setItem(STORAGE_KEY, backupStorage);
            else localStorage.removeItem(STORAGE_KEY);
        }

        console.log(`=== SELF-TEST COMPLETE: ${pass} PASS / ${fail} FAIL ===`);
        return fail === 0 ? 'ALL PASS' : 'SOME FAILED';
    }

    // ====================================================================
    // INITIALIZATION
    // ====================================================================
    function init() {
        loadPortfolio();

        // Wait for StrategyLifecycle buttons to be injected, then add ours
        const waitForSL = () => {
            if (document.querySelector('#sl-buttons-container')) {
                injectButtons();
                injectBacktestHook();
            } else {
                setTimeout(waitForSL, 200);
            }
        };
        waitForSL();

        console.log(LOG, 'v1 loaded', portfolio ? `— portfolio "${portfolio.name}" with ${portfolio.holdings.length} slots` : '— no portfolio');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // ====================================================================
    // PUBLIC API
    // ====================================================================
    window.PortfolioManager = {
        createPortfolio,
        getPortfolio,
        addSlot,
        removeSlot,
        updateSlot,
        runAllocator,
        checkEligibility,
        getPortfolioEquity,
        openPortfolioModal: openModal,
        selfTest
    };

})();
