/* ========================================================================
   STRATEGY HEALTH MEMORY v1 — Persist + Badges
   Records Backtest Runs + Paper Sessions, computes rolling health
   classification per strategy preset/version.
   UI-layer only. No engine modifications. No backend.
   ======================================================================== */

(function () {
    'use strict';

    // ====================================================================
    // CONSTANTS
    // ====================================================================
    const STORAGE_KEY = 'pp_strategy_health_records_v1';
    const MAX_RECORDS = 200;
    const ROLLING_N = 20;           // rolling window for aggregates
    const TREND_HALF = 5;           // last-5 vs previous-5 for trend
    const MIN_RECORDS_FOR_HEALTH = 5;
    const DRIFT_MIN_EACH = 3;       // min paper + backtest records for drift
    const DRIFT_STRONGLY_NEG = 0.5; // paper_mean_score < bt_mean_score - 0.5

    // ====================================================================
    // STORAGE — Flat array of RunRecords
    // ====================================================================
    let records = [];
    let _corruptionWarningShown = false;

    function genUUID() {
        return 'sh_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
    }

    function loadRecords() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) { records = []; return; }
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                records = parsed;
                return;
            }
        } catch (e) {
            console.warn('StrategyHealth: corrupted localStorage, resetting.', e);
            showCorruptionBanner();
        }
        records = [];
    }

    function saveRecords() {
        // Enforce cap
        if (records.length > MAX_RECORDS) {
            records = records.slice(records.length - MAX_RECORDS);
        }
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
        } catch (e) {
            console.warn('StrategyHealth: save failed', e);
        }
    }

    function showCorruptionBanner() {
        if (_corruptionWarningShown) return;
        _corruptionWarningShown = true;
        setTimeout(() => {
            const banner = document.createElement('div');
            banner.id = 'sh-corruption-banner';
            banner.style.cssText = `
                position: fixed; top: 12px; left: 50%; transform: translateX(-50%);
                z-index: 9999; padding: 10px 20px; border-radius: 8px;
                background: rgba(251,191,36,0.15); border: 1px solid rgba(251,191,36,0.4);
                color: #fbbf24; font-size: 0.8rem; font-family: 'Inter', sans-serif;
                display: flex; align-items: center; gap: 8px;
                box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            `;
            banner.innerHTML = `
                <span>⚠ Strategy Health data was corrupted and has been reset.</span>
                <button id="sh-corruption-dismiss" style="
                    background: transparent; border: 1px solid rgba(251,191,36,0.4);
                    color: #fbbf24; padding: 2px 8px; border-radius: 4px;
                    cursor: pointer; font-size: 0.7rem;
                ">Dismiss</button>
            `;
            document.body.appendChild(banner);
            banner.querySelector('#sh-corruption-dismiss').addEventListener('click', () => {
                banner.remove();
            });
            // Auto-dismiss after 10s
            setTimeout(() => { if (banner.parentNode) banner.remove(); }, 10000);
        }, 500);
    }

    // ====================================================================
    // INDEXING — Group records by strategy key
    // ====================================================================
    function getStrategyKey(rec) {
        if (rec.preset_name && rec.preset_name !== 'CUSTOM') return rec.preset_name;
        // Fallback: asset+timeframe
        return (rec.asset || 'UNK') + '_' + (rec.timeframe || 'UNK');
    }

    function getGroupedRecords(key) {
        return records.filter(r => getStrategyKey(r) === key);
    }

    function getAllStrategyKeys() {
        const keys = new Set();
        records.forEach(r => keys.add(getStrategyKey(r)));
        return Array.from(keys);
    }

    // ====================================================================
    // RECORD CREATION
    // ====================================================================

    /**
     * Record a completed backtest run.
     * @param {Object} report — output of buildReportObj()
     */
    function recordBacktestRun(report) {
        if (!report || !report.metrics) return;
        const m = report.metrics;
        const cfg = report.config || {};
        const cm = report.candleMetadata || {};

        const returnPct = parseFloat(m.totalReturn) || 0;
        const maxddPct = Math.abs(parseFloat(m.maxDrawdown)) || 0;
        const scoreRetDd = maxddPct > 0 ? returnPct / maxddPct : 0;
        const trades = parseInt(m.tradeCount) || 0;
        const winRate = parseFloat(m.winRate) || 0;

        // Compute avg R-multiple from trades array if available
        let avgRMult = 0;
        if (report.trades && report.trades.length > 0) {
            const rSum = report.trades.reduce((s, t) => s + (t.rMultiple || 0), 0);
            avgRMult = rSum / report.trades.length;
        }

        // Time in drawdown % — approximate from drawdown curve if available
        let timeInDdPct = 0;
        if (report.drawdownCurve && report.drawdownCurve.length > 0) {
            const ddBars = report.drawdownCurve.filter(d => Math.abs(d) > 0.1).length;
            timeInDdPct = (ddBars / report.drawdownCurve.length) * 100;
        }

        const rec = {
            id: genUUID(),
            created_at: new Date().toISOString(),
            source: 'BACKTEST',
            preset_name: report.preset_name || cfg.preset_name || 'CUSTOM',
            strategy_id: cfg.strategy || cfg.label || null,
            asset: cfg.asset || 'BTC-USD',
            timeframe: cfg.timeframe || '1d',
            date_range: cm.first && cm.last ? { start: cm.first, end: cm.last } : null,
            metrics: {
                return_pct: returnPct,
                maxdd_pct: maxddPct,
                score_ret_dd: parseFloat(scoreRetDd.toFixed(3)),
                profit_factor: parseFloat(m.profitFactor) || 0,
                expectancy_per_trade: parseFloat(m.expectancy) || 0,
                trades: trades,
                win_rate: winRate,
                avg_r_multiple: parseFloat(avgRMult.toFixed(3)),
                time_in_dd_pct: parseFloat(timeInDdPct.toFixed(1))
            },
            safety_events: null
        };

        records.push(rec);
        saveRecords();
        renderAllBadges();
        console.log('StrategyHealth: recorded BACKTEST run', rec.id);
    }

    /**
     * Record a completed paper trading session.
     * @param {Object} paperState — the paper trading state object
     */
    function recordPaperSession(paperState) {
        if (!paperState) return;
        const trades = (paperState.tradeLog || []).filter(t => t.type === 'EXIT');
        if (trades.length === 0) return;

        const cfg = paperState.config || {};
        const wins = trades.filter(t => (t.pnl || 0) > 0);
        const losses = trades.filter(t => (t.pnl || 0) <= 0);
        const totalPnl = trades.reduce((s, t) => s + (t.pnl || 0), 0);

        const startCapital = paperState.startCapital || cfg.startingCapital || 10000;
        const equity = paperState.capital + (paperState.inPosition ? (paperState.shares * paperState.entryPrice) : 0);
        const returnPct = ((equity - startCapital) / startCapital) * 100;

        const peakEquity = paperState.peakEquity || startCapital;
        const maxddPct = peakEquity > 0 ? ((peakEquity - Math.min(equity, peakEquity)) / peakEquity) * 100 : 0;
        const scoreRetDd = maxddPct > 0 ? returnPct / maxddPct : 0;

        const winRate = trades.length > 0 ? (wins.length / trades.length) * 100 : 0;
        const expectancy = trades.length > 0 ? totalPnl / trades.length : 0;

        const grossProfit = wins.reduce((s, t) => s + (t.pnl || 0), 0);
        const grossLoss = Math.abs(losses.reduce((s, t) => s + (t.pnl || 0), 0));
        const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : 0;

        // Avg R multiple from returnPct on each trade
        let avgRMult = 0;
        if (trades.length > 0) {
            const rSum = trades.reduce((s, t) => s + (t.returnPct || 0), 0);
            avgRMult = rSum / trades.length / 100; // normalize
        }

        // Time in DD — approximate from equity curve
        let timeInDdPct = 0;
        if (paperState.equityCurve && paperState.equityCurve.length > 1) {
            let peak = paperState.equityCurve[0].value;
            let ddCount = 0;
            paperState.equityCurve.forEach(p => {
                if (p.value > peak) peak = p.value;
                if (peak > 0 && ((peak - p.value) / peak) > 0.001) ddCount++;
            });
            timeInDdPct = (ddCount / paperState.equityCurve.length) * 100;
        }

        // Safety events
        const autoPaused = paperState._safetyStatus === 'AUTO_PAUSED';
        const breachReason = autoPaused ? (paperState._breachReason || 'Unknown') : null;

        const presetName = cfg.preset_name || paperState.candidateId || 'CUSTOM';

        const rec = {
            id: genUUID(),
            created_at: new Date().toISOString(),
            source: 'PAPER',
            preset_name: presetName,
            strategy_id: cfg.strategy || cfg.label || null,
            asset: cfg.asset || 'BTC-USD',
            timeframe: cfg.timeframe || '1d',
            date_range: paperState.createdAt ? { start: paperState.createdAt, end: new Date().toISOString() } : null,
            metrics: {
                return_pct: parseFloat(returnPct.toFixed(2)),
                maxdd_pct: parseFloat(maxddPct.toFixed(2)),
                score_ret_dd: parseFloat(scoreRetDd.toFixed(3)),
                profit_factor: parseFloat(profitFactor.toFixed(2)),
                expectancy_per_trade: parseFloat(expectancy.toFixed(2)),
                trades: trades.length,
                win_rate: parseFloat(winRate.toFixed(1)),
                avg_r_multiple: parseFloat(avgRMult.toFixed(3)),
                time_in_dd_pct: parseFloat(timeInDdPct.toFixed(1))
            },
            safety_events: autoPaused ? { auto_paused: true, breach_reason: breachReason } : null
        };

        records.push(rec);
        saveRecords();
        renderAllBadges();
        console.log('StrategyHealth: recorded PAPER session', rec.id);
    }

    // ====================================================================
    // ROLLING AGGREGATES (Last N = 20)
    // ====================================================================

    function computeRollingAggregates(strategyKey) {
        const group = getGroupedRecords(strategyKey);
        const slice = group.slice(-ROLLING_N);
        if (slice.length === 0) return null;

        const n = slice.length;
        const meanReturn = slice.reduce((s, r) => s + r.metrics.return_pct, 0) / n;
        const meanScore = slice.reduce((s, r) => s + r.metrics.score_ret_dd, 0) / n;
        const meanMaxdd = slice.reduce((s, r) => s + r.metrics.maxdd_pct, 0) / n;
        const meanExpectancy = slice.reduce((s, r) => s + r.metrics.expectancy_per_trade, 0) / n;
        const tradeCountTotal = slice.reduce((s, r) => s + r.metrics.trades, 0);

        // Median profit factor
        const pfs = slice.map(r => r.metrics.profit_factor).sort((a, b) => a - b);
        const pfMedian = pfs.length % 2 === 0
            ? (pfs[pfs.length / 2 - 1] + pfs[pfs.length / 2]) / 2
            : pfs[Math.floor(pfs.length / 2)];

        // Drift: paper vs backtest
        const btRuns = group.filter(r => r.source === 'BACKTEST').slice(-ROLLING_N);
        const ppRuns = group.filter(r => r.source === 'PAPER').slice(-ROLLING_N);
        let drift = null;

        if (btRuns.length >= DRIFT_MIN_EACH && ppRuns.length >= DRIFT_MIN_EACH) {
            const btMeanScore = btRuns.reduce((s, r) => s + r.metrics.score_ret_dd, 0) / btRuns.length;
            const ppMeanScore = ppRuns.reduce((s, r) => s + r.metrics.score_ret_dd, 0) / ppRuns.length;
            const btMeanReturn = btRuns.reduce((s, r) => s + r.metrics.return_pct, 0) / btRuns.length;
            const ppMeanReturn = ppRuns.reduce((s, r) => s + r.metrics.return_pct, 0) / ppRuns.length;

            drift = {
                drift_score: parseFloat((ppMeanScore - btMeanScore).toFixed(3)),
                drift_return: parseFloat((ppMeanReturn - btMeanReturn).toFixed(2)),
                bt_mean_score: parseFloat(btMeanScore.toFixed(3)),
                pp_mean_score: parseFloat(ppMeanScore.toFixed(3)),
                bt_mean_return: parseFloat(btMeanReturn.toFixed(2)),
                pp_mean_return: parseFloat(ppMeanReturn.toFixed(2)),
                bt_count: btRuns.length,
                pp_count: ppRuns.length
            };
        }

        return {
            rolling_mean_return: parseFloat(meanReturn.toFixed(2)),
            rolling_mean_score: parseFloat(meanScore.toFixed(3)),
            rolling_mean_maxdd: parseFloat(meanMaxdd.toFixed(2)),
            rolling_mean_expectancy: parseFloat(meanExpectancy.toFixed(2)),
            rolling_pf_median: parseFloat(pfMedian.toFixed(2)),
            rolling_trade_count_total: tradeCountTotal,
            rolling_paper_vs_backtest_drift: drift,
            record_count: n
        };
    }

    // ====================================================================
    // HEALTH CLASSIFICATION (v1)
    // ====================================================================

    function classifyHealth(strategyKey) {
        const group = getGroupedRecords(strategyKey);
        if (group.length < MIN_RECORDS_FOR_HEALTH) {
            return 'INSUFFICIENT DATA';
        }

        const agg = computeRollingAggregates(strategyKey);
        if (!agg) return 'INSUFFICIENT DATA';

        // Check UNSTABLE conditions first
        // 1) rolling_mean_score <= 0
        if (agg.rolling_mean_score <= 0) return 'UNSTABLE';

        // 2) paper vs backtest drift strongly negative
        const drift = agg.rolling_paper_vs_backtest_drift;
        if (drift && drift.pp_mean_score < drift.bt_mean_score - DRIFT_STRONGLY_NEG) {
            return 'UNSTABLE';
        }

        // 3) >= 2 safety auto-pauses in last 10 PAPER records
        const paperRecent = group.filter(r => r.source === 'PAPER').slice(-10);
        const autoPauseCount = paperRecent.filter(r => r.safety_events && r.safety_events.auto_paused).length;
        if (autoPauseCount >= 2) return 'UNSTABLE';

        // Check DEGRADING conditions
        if (group.length >= TREND_HALF * 2) {
            const recent = group.slice(-ROLLING_N);
            if (recent.length >= TREND_HALF * 2) {
                const last5 = recent.slice(-TREND_HALF);
                const prev5 = recent.slice(-(TREND_HALF * 2), -TREND_HALF);

                const last5MeanScore = last5.reduce((s, r) => s + r.metrics.score_ret_dd, 0) / last5.length;
                const prev5MeanScore = prev5.reduce((s, r) => s + r.metrics.score_ret_dd, 0) / prev5.length;
                const last5MeanDd = last5.reduce((s, r) => s + r.metrics.maxdd_pct, 0) / last5.length;
                const prev5MeanDd = prev5.reduce((s, r) => s + r.metrics.maxdd_pct, 0) / prev5.length;

                // Score trending down
                if (last5MeanScore < prev5MeanScore && agg.rolling_mean_score > 0) {
                    return 'DEGRADING';
                }
                // MaxDD rising
                if (last5MeanDd > prev5MeanDd && agg.rolling_mean_score > 0) {
                    return 'DEGRADING';
                }
            }
        }

        // Check HEALTHY conditions
        if (agg.rolling_mean_score > 0 && agg.rolling_mean_maxdd < 35) {
            // Check no recent safety breach in last 5 PAPER records
            const lastPaper5 = group.filter(r => r.source === 'PAPER').slice(-5);
            const recentBreach = lastPaper5.some(r => r.safety_events && r.safety_events.auto_paused);
            if (!recentBreach) return 'HEALTHY';
        }

        // Default to HEALTHY if score > 0 even with higher DD
        if (agg.rolling_mean_score > 0) return 'HEALTHY';

        return 'INSUFFICIENT DATA';
    }

    // ====================================================================
    // PUBLIC API
    // ====================================================================

    function getHealth(strategyKey) {
        const group = getGroupedRecords(strategyKey);
        const status = classifyHealth(strategyKey);
        const agg = computeRollingAggregates(strategyKey);

        // Last safety event
        let lastSafetyEvent = null;
        for (let i = group.length - 1; i >= 0; i--) {
            if (group[i].safety_events && group[i].safety_events.auto_paused) {
                lastSafetyEvent = group[i];
                break;
            }
        }

        return {
            status,
            aggregates: agg,
            lastSafetyEvent,
            recentRuns: group.slice(-10).reverse(),
            runCount: group.length
        };
    }

    function getRecentRuns(strategyKey, n) {
        return getGroupedRecords(strategyKey).slice(-(n || 10)).reverse();
    }

    // ====================================================================
    // BADGE STYLES
    // ====================================================================

    const BADGE_CONFIG = {
        'HEALTHY': { bg: 'rgba(34,197,94,0.12)', color: '#4ade80', border: 'rgba(34,197,94,0.25)', label: 'HEALTHY', icon: '●' },
        'DEGRADING': { bg: 'rgba(251,191,36,0.12)', color: '#fbbf24', border: 'rgba(251,191,36,0.25)', label: 'DEGRADING', icon: '▼' },
        'UNSTABLE': { bg: 'rgba(239,68,68,0.12)', color: '#f87171', border: 'rgba(239,68,68,0.25)', label: 'UNSTABLE', icon: '⚠' },
        'INSUFFICIENT DATA': { bg: 'rgba(100,116,139,0.08)', color: '#64748b', border: 'rgba(100,116,139,0.15)', label: 'INSUFFICIENT DATA', icon: '○' }
    };

    function createBadgeElement(strategyKey, compact = false) {
        const health = getHealth(strategyKey);
        const cfg = BADGE_CONFIG[health.status] || BADGE_CONFIG['INSUFFICIENT DATA'];

        const badge = document.createElement('span');
        badge.className = 'sh-badge sh-badge--' + health.status.toLowerCase().replace(/\s+/g, '-');
        badge.setAttribute('data-strategy-key', strategyKey);
        badge.style.cssText = `
            display: inline-flex; align-items: center; gap: 4px;
            padding: ${compact ? '1px 6px' : '2px 8px'}; border-radius: 4px;
            font-size: ${compact ? '0.58rem' : '0.65rem'};
            font-weight: 600; letter-spacing: 0.04em; font-family: 'Inter', sans-serif;
            background: ${cfg.bg}; color: ${cfg.color};
            border: 1px solid ${cfg.border}; white-space: nowrap;
            cursor: pointer; transition: opacity 0.2s;
        `;
        badge.textContent = compact ? cfg.label.split(' ')[0] : `${cfg.icon} ${cfg.label}`;

        if (health.runCount > 0 && health.aggregates) {
            const a = health.aggregates;
            badge.title = `${health.runCount} runs | Score: ${a.rolling_mean_score.toFixed(2)} | DD: ${a.rolling_mean_maxdd.toFixed(1)}% | Exp: $${a.rolling_mean_expectancy.toFixed(0)}`;
        }

        badge.addEventListener('click', (e) => {
            e.stopPropagation();
            openHealthPanel(strategyKey);
        });

        return badge;
    }

    // ====================================================================
    // BADGE PLACEMENT — Preset Selector + Watchlist
    // ====================================================================

    function renderPresetBadge() {
        const selector = document.getElementById('preset-selector');
        if (!selector) return;

        // Remove existing badge wrapper
        const existing = document.getElementById('sh-preset-badge-wrap');
        if (existing) existing.remove();

        const presetName = selector.value || 'CUSTOM';
        const health = getHealth(presetName);
        if (health.status === 'INSUFFICIENT DATA' && health.runCount === 0) return;

        const wrapper = document.createElement('div');
        wrapper.id = 'sh-preset-badge-wrap';
        wrapper.style.cssText = 'display: flex; align-items: center; gap: 8px; margin-top: 6px;';

        wrapper.appendChild(createBadgeElement(presetName));

        const countLabel = document.createElement('span');
        countLabel.style.cssText = 'font-size: 0.65rem; color: #64748b;';
        countLabel.textContent = `${health.runCount} run${health.runCount !== 1 ? 's' : ''} tracked`;
        wrapper.appendChild(countLabel);

        const fieldGroup = selector.closest('.bt-field-group');
        if (fieldGroup) fieldGroup.appendChild(wrapper);
    }

    function renderWatchlistBadge() {
        const sel = document.getElementById('pw-candidate-select');
        if (!sel) return;

        // Remove existing
        const existing = document.getElementById('sh-watchlist-badge-wrap');
        if (existing) existing.remove();

        const candidateId = sel.value;
        if (!candidateId) return;

        // Try to find a matching strategy key
        const allKeys = getAllStrategyKeys();
        let matchKey = allKeys.find(k => k === candidateId || candidateId.includes(k));
        if (!matchKey) return;

        const health = getHealth(matchKey);
        if (health.runCount === 0) return;

        const wrapper = document.createElement('div');
        wrapper.id = 'sh-watchlist-badge-wrap';
        wrapper.style.cssText = 'display: flex; align-items: center; gap: 6px; margin-top: 4px;';
        wrapper.appendChild(createBadgeElement(matchKey, true));

        const parent = sel.closest('.pw-settings-left');
        if (parent) parent.appendChild(wrapper);
    }

    function renderAllBadges() {
        renderPresetBadge();
        renderWatchlistBadge();
        updateInlineBadge();
        // If panel is open, refresh it
        const panel = document.getElementById('sh-health-panel');
        if (panel && panel.style.display !== 'none') {
            const key = panel.getAttribute('data-strategy-key');
            if (key) renderHealthPanelContent(key);
        }
    }

    // ====================================================================
    // INLINE BADGE (inside Strategy Health button)
    // ====================================================================

    function updateInlineBadge() {
        const span = document.getElementById('sh-inline-badge');
        if (!span) return;

        const selector = document.getElementById('preset-selector');
        const key = selector ? selector.value || 'CUSTOM' : 'CUSTOM';
        const health = getHealth(key);
        const cfg = BADGE_CONFIG[health.status] || BADGE_CONFIG['INSUFFICIENT DATA'];

        if (health.runCount === 0) {
            span.innerHTML = '';
            span.style.cssText = '';
            return;
        }

        span.style.cssText = `
            display: inline-flex; align-items: center; gap: 3px;
            padding: 1px 6px; border-radius: 3px; font-size: 0.6rem;
            font-weight: 700; letter-spacing: 0.04em;
            background: ${cfg.bg}; color: ${cfg.color};
            border: 1px solid ${cfg.border};
        `;
        span.textContent = `${cfg.icon} ${cfg.label}`;
    }

    // ====================================================================
    // HEALTH PANEL — Collapsible
    // ====================================================================

    function ensureHealthPanel() {
        if (document.getElementById('sh-health-panel')) return;

        const panel = document.createElement('div');
        panel.id = 'sh-health-panel';
        panel.style.cssText = `
            display: none; position: fixed; bottom: 20px; right: 20px;
            width: 420px; max-height: 580px; overflow-y: auto;
            background: #0f172a; border: 1px solid rgba(99, 102, 241, 0.2);
            border-radius: 12px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5);
            z-index: 1000; font-family: 'Inter', sans-serif;
        `;
        panel.innerHTML = `
            <div id="sh-panel-header" style="
                display: flex; justify-content: space-between; align-items: center;
                padding: 14px 18px; border-bottom: 1px solid rgba(255,255,255,0.06);
                background: rgba(255,255,255,0.02); border-radius: 12px 12px 0 0;
                cursor: pointer; user-select: none;
            ">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                        <path d="M3 12h4l3-9 4 18 3-9h4" stroke="#6366f1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                    <span style="font-size: 0.85rem; font-weight: 600; color: #e2e8f0;">Strategy Health</span>
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span id="sh-panel-collapse-icon" style="color: #64748b; font-size: 0.8rem;">▼</span>
                    <button id="sh-panel-close" style="
                        background: transparent; border: none; color: #64748b;
                        cursor: pointer; padding: 2px; font-size: 1.1rem; line-height: 1;
                    ">&times;</button>
                </div>
            </div>
            <div id="sh-panel-body" style="padding: 16px 18px;"></div>
        `;
        document.body.appendChild(panel);

        // Close button
        panel.querySelector('#sh-panel-close').addEventListener('click', (e) => {
            e.stopPropagation();
            panel.style.display = 'none';
        });

        // Collapse/expand on header click
        let collapsed = false;
        panel.querySelector('#sh-panel-header').addEventListener('click', (e) => {
            if (e.target.id === 'sh-panel-close') return;
            collapsed = !collapsed;
            const body = document.getElementById('sh-panel-body');
            const icon = document.getElementById('sh-panel-collapse-icon');
            if (body) body.style.display = collapsed ? 'none' : 'block';
            if (icon) icon.textContent = collapsed ? '▶' : '▼';
        });
    }

    function openHealthPanel(strategyKey) {
        ensureHealthPanel();
        const panel = document.getElementById('sh-health-panel');
        panel.setAttribute('data-strategy-key', strategyKey);
        panel.style.display = 'block';
        // Ensure body is visible
        const body = document.getElementById('sh-panel-body');
        if (body) body.style.display = 'block';
        const icon = document.getElementById('sh-panel-collapse-icon');
        if (icon) icon.textContent = '▼';
        renderHealthPanelContent(strategyKey);
    }

    function renderHealthPanelContent(strategyKey) {
        const body = document.getElementById('sh-panel-body');
        if (!body) return;

        const health = getHealth(strategyKey);
        const cfg = BADGE_CONFIG[health.status] || BADGE_CONFIG['INSUFFICIENT DATA'];
        const agg = health.aggregates;

        let html = '';

        // ── Strategy Name + Badge ──
        html += `
            <div style="margin-bottom: 16px;">
                <div style="font-size: 0.68rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 6px;">
                    STRATEGY
                </div>
                <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                    <span style="font-size: 0.95rem; font-weight: 600; color: #e2e8f0;">${strategyKey}</span>
                    <span style="
                        display: inline-flex; align-items: center; gap: 4px;
                        padding: 3px 10px; border-radius: 5px; font-size: 0.68rem;
                        font-weight: 700; letter-spacing: 0.05em;
                        background: ${cfg.bg}; color: ${cfg.color};
                        border: 1px solid ${cfg.border};
                    ">${cfg.icon} ${cfg.label}</span>
                </div>
                <div style="font-size: 0.68rem; color: #64748b; margin-top: 4px;">
                    ${health.runCount} total run${health.runCount !== 1 ? 's' : ''} tracked
                </div>
            </div>
        `;

        // ── Rolling Summary ──
        if (agg && health.runCount > 0) {
            html += `
                <div style="
                    display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px;
                    margin-bottom: 14px; padding: 12px;
                    background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.04);
                    border-radius: 8px;
                ">
                    <div style="text-align: center;">
                        <div style="font-size: 0.6rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 3px;">Score</div>
                        <div style="font-size: 0.88rem; font-weight: 600; color: ${agg.rolling_mean_score >= 0 ? '#4ade80' : '#f87171'}; font-family: 'JetBrains Mono', monospace;">
                            ${agg.rolling_mean_score.toFixed(2)}
                        </div>
                    </div>
                    <div style="text-align: center;">
                        <div style="font-size: 0.6rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 3px;">Avg DD</div>
                        <div style="font-size: 0.88rem; font-weight: 600; color: #f87171; font-family: 'JetBrains Mono', monospace;">
                            ${agg.rolling_mean_maxdd.toFixed(1)}%
                        </div>
                    </div>
                    <div style="text-align: center;">
                        <div style="font-size: 0.6rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 3px;">Expectancy</div>
                        <div style="font-size: 0.88rem; font-weight: 600; color: ${agg.rolling_mean_expectancy >= 0 ? '#4ade80' : '#f87171'}; font-family: 'JetBrains Mono', monospace;">
                            $${agg.rolling_mean_expectancy.toFixed(0)}
                        </div>
                    </div>
                </div>
                <div style="
                    display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px;
                    margin-bottom: 14px; padding: 10px 12px;
                    background: rgba(255,255,255,0.015); border: 1px solid rgba(255,255,255,0.03);
                    border-radius: 6px; font-size: 0.72rem;
                ">
                    <div style="text-align: center;">
                        <span style="color: #64748b;">Avg Return</span><br>
                        <span style="color: ${agg.rolling_mean_return >= 0 ? '#4ade80' : '#f87171'}; font-family: 'JetBrains Mono', monospace; font-weight: 600;">
                            ${agg.rolling_mean_return >= 0 ? '+' : ''}${agg.rolling_mean_return.toFixed(1)}%
                        </span>
                    </div>
                    <div style="text-align: center;">
                        <span style="color: #64748b;">PF (med)</span><br>
                        <span style="color: #e2e8f0; font-family: 'JetBrains Mono', monospace; font-weight: 600;">
                            ${agg.rolling_pf_median.toFixed(2)}
                        </span>
                    </div>
                    <div style="text-align: center;">
                        <span style="color: #64748b;">Trades</span><br>
                        <span style="color: #e2e8f0; font-family: 'JetBrains Mono', monospace; font-weight: 600;">
                            ${agg.rolling_trade_count_total}
                        </span>
                    </div>
                </div>
            `;

            // ── Drift Warning ──
            const drift = agg.rolling_paper_vs_backtest_drift;
            if (drift) {
                const driftNeg = drift.drift_score < 0;
                const driftColor = driftNeg ? '#fbbf24' : '#4ade80';
                html += `
                    <div style="
                        margin-bottom: 14px; padding: 10px 14px;
                        background: ${driftNeg ? 'rgba(251,191,36,0.06)' : 'rgba(34,197,94,0.06)'};
                        border: 1px solid ${driftNeg ? 'rgba(251,191,36,0.15)' : 'rgba(34,197,94,0.15)'};
                        border-radius: 8px;
                    ">
                        <div style="font-size: 0.7rem; font-weight: 600; color: ${driftColor}; margin-bottom: 4px;">
                            ${driftNeg ? '⚠' : '✓'} Paper vs Backtest Drift
                        </div>
                        <div style="font-size: 0.66rem; color: #94a3b8; line-height: 1.6;">
                            BT score: <strong style="color:#e2e8f0;">${drift.bt_mean_score.toFixed(2)}</strong> (${drift.bt_count} runs)
                            &nbsp;|&nbsp;
                            Paper score: <strong style="color:#e2e8f0;">${drift.pp_mean_score.toFixed(2)}</strong> (${drift.pp_count} runs)
                            <br>Drift: <strong style="color:${driftColor};">${drift.drift_score >= 0 ? '+' : ''}${drift.drift_score.toFixed(3)}</strong>
                            &nbsp;|&nbsp;
                            Return drift: <strong style="color:${driftColor};">${drift.drift_return >= 0 ? '+' : ''}${drift.drift_return.toFixed(1)}%</strong>
                        </div>
                    </div>
                `;
            }
        }

        // ── Last Safety Event ──
        if (health.lastSafetyEvent) {
            const se = health.lastSafetyEvent;
            const seDate = new Date(se.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
            html += `
                <div style="
                    margin-bottom: 14px; padding: 10px 14px;
                    background: rgba(239,68,68,0.06); border: 1px solid rgba(239,68,68,0.15);
                    border-radius: 8px;
                ">
                    <div style="font-size: 0.7rem; font-weight: 600; color: #f87171; margin-bottom: 3px;">
                        ⛔ Last Safety Event
                    </div>
                    <div style="font-size: 0.66rem; color: #94a3b8;">
                        ${seDate} — ${se.safety_events.breach_reason || 'Auto-paused'}
                    </div>
                </div>
            `;
        }

        // ── Recent Runs Table (last 10) ──
        html += `
            <div style="margin-bottom: 8px;">
                <div style="font-size: 0.68rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 8px;">
                    Recent Runs (last 10)
                </div>
                <div style="display: flex; flex-direction: column; gap: 3px; max-height: 240px; overflow-y: auto;">
        `;

        const recent = health.recentRuns || [];
        if (recent.length === 0) {
            html += '<div style="font-size: 0.72rem; color: #475569; font-style: italic; padding: 8px;">No runs recorded.</div>';
        } else {
            // Table header
            html += `
                <div style="
                    display: grid; grid-template-columns: 70px 36px 60px 60px 50px; gap: 6px;
                    padding: 4px 8px; font-size: 0.58rem; color: #475569;
                    text-transform: uppercase; letter-spacing: 0.05em;
                    border-bottom: 1px solid rgba(255,255,255,0.04);
                ">
                    <span>Time</span><span>Src</span><span>Score</span><span>Return</span><span>DD</span>
                </div>
            `;

            recent.forEach(run => {
                const date = new Date(run.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                const sourceColor = run.source === 'BACKTEST' ? '#818cf8' : '#38bdf8';
                const sourceLabel = run.source === 'BACKTEST' ? 'BT' : 'PP';
                const retColor = run.metrics.return_pct >= 0 ? '#4ade80' : '#f87171';
                const scoreColor = run.metrics.score_ret_dd >= 0 ? '#4ade80' : '#f87171';

                html += `
                    <div style="
                        display: grid; grid-template-columns: 70px 36px 60px 60px 50px; gap: 6px;
                        padding: 5px 8px; background: rgba(255,255,255,0.015);
                        border: 1px solid rgba(255,255,255,0.03); border-radius: 4px;
                        font-size: 0.66rem; align-items: center;
                    ">
                        <span style="color: #94a3b8; font-size: 0.6rem;">${date}</span>
                        <span style="
                            font-size: 0.54rem; font-weight: 700; padding: 1px 4px;
                            border-radius: 3px; background: ${sourceColor}12;
                            color: ${sourceColor}; border: 1px solid ${sourceColor}25;
                            text-align: center;
                        ">${sourceLabel}</span>
                        <span style="color: ${scoreColor}; font-family: 'JetBrains Mono', monospace; font-size: 0.64rem;">
                            ${run.metrics.score_ret_dd.toFixed(2)}
                        </span>
                        <span style="color: ${retColor}; font-family: 'JetBrains Mono', monospace; font-size: 0.64rem;">
                            ${run.metrics.return_pct >= 0 ? '+' : ''}${run.metrics.return_pct.toFixed(1)}%
                        </span>
                        <span style="color: #94a3b8; font-family: 'JetBrains Mono', monospace; font-size: 0.64rem;">
                            ${run.metrics.maxdd_pct.toFixed(1)}%
                        </span>
                    </div>
                `;
            });
        }

        html += '</div></div>';

        body.innerHTML = html;
    }

    // ====================================================================
    // PRESET SELECTOR LISTENER
    // ====================================================================

    function initPresetListener() {
        const selector = document.getElementById('preset-selector');
        if (!selector) return;
        selector.addEventListener('change', () => {
            renderPresetBadge();
            updateInlineBadge();
        });
    }

    // ====================================================================
    // STRATEGY HEALTH BUTTON (dynamic injection)
    // ====================================================================

    function initHealthButton() {
        // Look for existing button first
        let btn = document.getElementById('btn-strategy-health');

        // If no button exists, try to inject one near the export/compare area
        if (!btn) {
            // Find the right panel or export area to inject the button
            const exportGroup = document.getElementById('export-group');
            const compareGroup = document.getElementById('compare-group');
            const rightPanel = document.querySelector('.bt-panel-right .bt-panel-body, .bt-panel-right');

            let insertTarget = rightPanel || (compareGroup ? compareGroup.parentNode : null) || (exportGroup ? exportGroup.parentNode : null);

            if (!insertTarget) {
                // As a last resort, find any panel body
                const panels = document.querySelectorAll('.bt-panel-body');
                if (panels.length >= 2) insertTarget = panels[panels.length - 1];
            }

            if (insertTarget) {
                const btnWrap = document.createElement('div');
                btnWrap.id = 'sh-health-btn-wrap';
                btnWrap.style.cssText = 'display: grid; gap: 6px; margin-top: 12px;';
                btnWrap.innerHTML = `
                    <button id="btn-strategy-health" class="bt-btn-sm" style="
                        display: flex; align-items: center; justify-content: center; gap: 6px;
                        padding: 8px 12px; border-radius: 6px; cursor: pointer;
                        background: rgba(99,102,241,0.08); color: #a5b4fc;
                        border: 1px solid rgba(99,102,241,0.2);
                        font-size: 0.8rem; font-weight: 500; font-family: 'Inter', sans-serif;
                        transition: background 0.15s, border-color 0.15s;
                    ">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                            <path d="M3 12h4l3-9 4 18 3-9h4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                        Strategy Health
                        <span id="sh-inline-badge"></span>
                    </button>
                `;
                insertTarget.appendChild(btnWrap);
                btn = document.getElementById('btn-strategy-health');
            }
        }

        if (!btn) return;

        btn.addEventListener('click', () => {
            const selector = document.getElementById('preset-selector');
            const key = selector ? selector.value || 'CUSTOM' : 'CUSTOM';
            openHealthPanel(key);
        });

        updateInlineBadge();
    }

    // ====================================================================
    // WATCHLIST CANDIDATE LISTENER
    // ====================================================================

    function initWatchlistListener() {
        // Observe candidate select changes in paper trading modal
        const observer = new MutationObserver(() => {
            const sel = document.getElementById('pw-candidate-select');
            if (sel && !sel._shListenerBound) {
                sel._shListenerBound = true;
                sel.addEventListener('change', renderWatchlistBadge);
                renderWatchlistBadge();
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    // ====================================================================
    // INITIALIZATION
    // ====================================================================

    function init() {
        loadRecords();
        initPresetListener();
        initWatchlistListener();
        // Defer badge rendering to ensure DOM is ready
        setTimeout(() => {
            renderAllBadges();
            initHealthButton();
        }, 600);
    }

    // Auto-init
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // ====================================================================
    // EXPOSE PUBLIC API
    // ====================================================================
    window.StrategyHealth = {
        recordBacktestRun,
        recordPaperSession,
        getHealth,
        getAllStrategyKeys,
        getRecentRuns,
        openHealthPanel,
        renderAllBadges
    };

})();
