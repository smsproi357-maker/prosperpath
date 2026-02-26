/* ========================================================================
   CAPITAL READINESS SCORING v1 — CRS 0–100
   Classifies each strategy preset into a deployment tier based on
   sample adequacy, stability, edge quality, alignment, and risk hygiene.
   UI-layer only. No engine modifications. No backend.
   ======================================================================== */

(function () {
    'use strict';

    // ====================================================================
    // TIER DEFINITIONS (unchanged UI styling)
    // ====================================================================
    const TIER_CONFIG = {
        'RESEARCH-ONLY': {
            color: '#60a5fa',
            bg: 'rgba(96,165,250,0.10)',
            border: 'rgba(96,165,250,0.25)',
            icon: '🔵',
            label: 'RESEARCH-ONLY',
            description: 'Insufficient data or unstable performance. Continue iterating in research mode.'
        },
        'OBSERVE': {
            color: '#fbbf24',
            bg: 'rgba(251,191,36,0.10)',
            border: 'rgba(251,191,36,0.25)',
            icon: '🟡',
            label: 'OBSERVE (PAPER-ONLY)',
            description: 'Some positive signals but drift or instability present. Continue paper observation.'
        },
        'CAPITAL-READY': {
            color: '#4ade80',
            bg: 'rgba(34,197,94,0.10)',
            border: 'rgba(34,197,94,0.25)',
            icon: '🟢',
            label: 'CAPITAL-READY',
            description: 'Stable rolling performance, acceptable drawdown, low drift, adequate sample size.'
        },
        'DO NOT DEPLOY': {
            color: '#f87171',
            bg: 'rgba(239,68,68,0.10)',
            border: 'rgba(239,68,68,0.25)',
            icon: '🔴',
            label: 'DO NOT DEPLOY',
            description: 'Strong negative drift, frequent safety breaches, or clear instability detected.'
        }
    };

    // ====================================================================
    // HELPER — Collect all runs for a strategy
    // ====================================================================
    function getAllRuns(strategyKey) {
        if (!window.StrategyHealth || !window.StrategyHealth.getRecentRuns) return [];
        return window.StrategyHealth.getRecentRuns(strategyKey, 200) || [];
    }

    function safeNum(val, fallback) {
        const n = parseFloat(val);
        return isFinite(n) ? n : fallback;
    }

    // ====================================================================
    // CRS v1 — PURE SCORING FUNCTION
    // ====================================================================

    /**
     * computeCRS(strategyKey)
     * Returns { crs, tier, breakdown, notes, aggregate, warnings, runCount, healthStatus }
     */
    function computeCRS(strategyKey) {
        if (!window.StrategyHealth) {
            return emptyResult('Strategy Health module not loaded.');
        }

        const health = window.StrategyHealth.getHealth(strategyKey);
        if (!health) {
            return emptyResult('No health data available.');
        }

        const allRuns = getAllRuns(strategyKey);
        if (allRuns.length === 0) {
            return emptyResult('No run records found.');
        }

        // Split by source
        const btRuns = allRuns.filter(r => r.source === 'BACKTEST');
        const ppRuns = allRuns.filter(r => r.source === 'PAPER');
        const agg = health.aggregates;

        // ── A) SAMPLE ADEQUACY (0–20) ──
        const sample = computeSample(allRuns, ppRuns, strategyKey);

        // ── B) STABILITY (0–35) ──
        const stability = computeStability(agg, strategyKey);

        // ── C) EDGE QUALITY (0–25) ──
        const edge = computeEdge(agg);

        // ── D) ALIGNMENT (0–15) ──
        const alignment = computeAlignment(btRuns, ppRuns);

        // ── E) HYGIENE PENALTY (0 to –20) ──
        const hygiene = computeHygiene(ppRuns);

        // ── Aggregate CRS ──
        const rawCrs = sample + stability + edge + alignment + hygiene;
        const crs = Math.max(0, Math.min(100, Math.round(rawCrs)));

        // ── Base tier from CRS ──
        let tier;
        if (crs >= 75) tier = 'CAPITAL-READY';
        else if (crs >= 55) tier = 'OBSERVE';
        else if (crs >= 35) tier = 'RESEARCH-ONLY';
        else tier = 'DO NOT DEPLOY';

        // ── Build notes ──
        const notes = buildNotes(sample, stability, edge, alignment, hygiene, agg, ppRuns, btRuns);

        // ── HARD OVERRIDES (Safety Rails) ──
        tier = applyHardOverrides(tier, agg, ppRuns, btRuns, notes);

        return {
            crs,
            tier,
            breakdown: {
                sample: parseFloat(sample.toFixed(1)),
                stability: parseFloat(stability.toFixed(1)),
                edge: parseFloat(edge.toFixed(1)),
                alignment: parseFloat(alignment.toFixed(1)),
                hygiene: parseFloat(hygiene.toFixed(1))
            },
            notes: notes.slice(0, 4),
            // Backward compatibility
            aggregate: crs / 100,
            warnings: notes.slice(0, 4),
            runCount: health.runCount,
            healthStatus: health.status
        };
    }

    function emptyResult(reason) {
        return {
            crs: 0,
            tier: 'RESEARCH-ONLY',
            breakdown: { sample: 0, stability: 0, edge: 0, alignment: 0, hygiene: 0 },
            notes: [reason],
            aggregate: 0,
            warnings: [reason],
            runCount: 0,
            healthStatus: 'INSUFFICIENT DATA'
        };
    }

    // ====================================================================
    // A) SAMPLE ADEQUACY (0–20)
    // ====================================================================
    function computeSample(allRuns, ppRuns, strategyKey) {
        // --- SMART GATING OVERRIDE (v1.1) ---
        // If strategy preset is tagged as "DEPLOYMENT_GRADE_PRESET" 
        // AND historical backtest sample >= required trade threshold:
        // -> SampleScore = MAX (do not penalize user for low paper trades yet)

        const isDeploymentGrade = strategyKey && (strategyKey.includes('DEPLOYMENT_GRADE_PRESET') || strategyKey.includes('PRODUCTION'));
        const btRuns = allRuns.filter(r => r.source === 'BACKTEST');
        const btTrades = btRuns.reduce((s, r) => s + safeNum(r.metrics && r.metrics.trades, 0), 0);

        if (isDeploymentGrade && btTrades >= 100) {
            return 20; // Max SampleScore
        }

        const totalRuns = allRuns.length;
        const paperRuns = ppRuns.length;
        const paperTrades = ppRuns.reduce((s, r) => s + safeNum(r.metrics && r.metrics.trades, 0), 0);

        // Total runs: ramp to 10 → 8 pts
        const runScore = Math.min(1, totalRuns / 10) * 8;

        // Paper runs: ramp to 5 → 6 pts
        const paperRunScore = Math.min(1, paperRuns / 5) * 6;

        // Paper trades sum: ramp to 30 → 6 pts
        const paperTradeScore = Math.min(1, paperTrades / 30) * 6;

        return runScore + paperRunScore + paperTradeScore;
    }

    // ====================================================================
    // B) STABILITY (0–35)
    // ====================================================================
    function computeStability(agg, strategyKey) {
        if (!agg) return 0;

        const meanScoreRetDd = safeNum(agg.rolling_mean_score, 0);
        const meanMaxDd = safeNum(agg.rolling_mean_maxdd, 0);

        // Sigmoid normalize score_ret_dd: 0 → 17.5, >=3 → 35
        const cap = 3.0;
        const clamped = Math.max(-cap, Math.min(cap, meanScoreRetDd));
        let score = ((clamped + cap) / (2 * cap)) * 35;

        // Penalty: rolling mean maxdd > 30%
        if (meanMaxDd > 30) {
            score = Math.max(0, score - 7);
        }

        // ── LIVE STABILITY SIGNAL WIRING (v1.1) ──
        if (window.PaperExecution) {
            const live = window.PaperExecution.getLiveSignals();
            const s = live.stability;
            let stabilityPenaltyPct = 0;

            // rolling_drawdown > backtest_maxDD * 1.25 -> -30%
            // We need backtest_maxDD. Let's find the max DD across all BT runs for this key.
            const allRuns = getRecentRunsForStability(strategyKey);
            const btRuns = allRuns.filter(r => r.source === 'BACKTEST');
            const btMaxDd = btRuns.length > 0 ? Math.max(...btRuns.map(r => safeNum(r.metrics && r.metrics.maxdd_pct, 0))) : 0;

            if (btMaxDd > 0 && s.rollingDrawdown > btMaxDd * 1.25) {
                stabilityPenaltyPct += 30;
            }

            // rolling_loss_streak > backtest_p95_loss_streak -> -20%
            // Simple approximation: if streak > 5 (default p95ish)
            if (s.rollingLossStreak > 8) {
                stabilityPenaltyPct += 20;
            }

            // equity_drift exceeds tolerance band -> -25%
            if (Math.abs(s.rollingEquityDrift) > 15) {
                stabilityPenaltyPct += 25;
            }

            // live_slippage > 2x modeled slippage -> -15%
            if (s.liveSlippageDeviation > 100) { // > 100% deviation
                stabilityPenaltyPct += 15;
            }

            if (stabilityPenaltyPct > 0) {
                score *= (1 - (stabilityPenaltyPct / 100));
            }
        }

        return Math.max(0, Math.min(35, score));
    }

    // Helper for stability runs
    function getRecentRunsForStability(strategyKey) {
        if (!window.StrategyHealth || !window.StrategyHealth.getRecentRuns) return [];
        return window.StrategyHealth.getRecentRuns(strategyKey, 50) || [];
    }

    // ====================================================================
    // C) EDGE QUALITY (0–25)
    // ====================================================================
    function computeEdge(agg) {
        if (!agg) return 0;

        const medianPf = safeNum(agg.rolling_pf_median, 1.0);
        const meanExpectancy = safeNum(agg.rolling_mean_expectancy, 0);

        // Profit Factor: sigmoid-ish map 0.8→0, 1.5→8, 2.5→15
        const pfNorm = Math.max(0, Math.min(1, (medianPf - 0.8) / (2.5 - 0.8)));
        const pfScore = pfNorm * 15;

        // Expectancy: ramp 0→0, 50→10 (per trade in dollars)
        const expScore = Math.max(0, Math.min(10, (meanExpectancy / 50) * 10));

        return Math.max(0, Math.min(25, pfScore + expScore));
    }

    // ====================================================================
    // D) ALIGNMENT (0–15)
    // ====================================================================
    function computeAlignment(btRuns, ppRuns) {
        // Need >=3 of each to compute
        if (btRuns.length < 3 || ppRuns.length < 3) {
            return 7.5; // Neutral mid-score
        }

        const btMeanScore = btRuns.reduce((s, r) => s + safeNum(r.metrics && r.metrics.score_ret_dd, 0), 0) / btRuns.length;
        const ppMeanScore = ppRuns.reduce((s, r) => s + safeNum(r.metrics && r.metrics.score_ret_dd, 0), 0) / ppRuns.length;

        const drift = ppMeanScore - btMeanScore;

        // drift >= 0 → full score 15
        // drift = -0.5 → 7.5
        // drift <= -1.0 → 0
        if (drift >= 0) return 15;
        if (drift <= -1.0) return 0;

        return Math.max(0, 15 * (1 + drift));
    }

    // ====================================================================
    // E) HYGIENE PENALTY (0 to –20)
    // ====================================================================
    function computeHygiene(ppRuns) {
        let baseScore = 0; // Hygiene is a penalty system (0 to -20 in v1, now more severe)

        // ── LIVE SYSTEM HYGIENE (v1.1) ──
        if (window.PaperExecution) {
            const live = window.PaperExecution.getLiveSignals();

            // If Kill Switch triggered -> Wipe score to 0 (which results in DO NOT DEPLOY)
            if (live.killSwitched) return -100; // Total penalty

            const h = live.hygiene;
            let livePenalty = 0;

            // data_feed_disconnect_count > 2 -> -50% of the possible CRS? 
            // The prompt says "HygieneScore -= 50%". Assuming this means -50 points.
            if (h.disconnectCount > 2) livePenalty -= 50;

            // engine_restart_count > 1 -> -30%
            if (h.restartCount > 1) livePenalty -= 30;

            // execution_error_count > 0 -> -40%
            if (h.errorCount > 0) livePenalty -= 40;

            // stale_tick_events -> -20%
            if (h.staleTickCount > 0) livePenalty -= 20;

            // If we have live penalties, return them immediately
            if (livePenalty < 0) return Math.max(-100, livePenalty);
        }

        // --- HISTORICAL HYGIENE (v1 fallback) ---
        // Last 10 paper runs
        const last10 = ppRuns.slice(0, 10); // ppRuns is reverse-chronological from getRecentRuns
        let penalty = 0;

        // -5 per auto_paused
        const autoPauseCount = last10.filter(r => r.safety_events && r.safety_events.auto_paused).length;
        penalty -= autoPauseCount * 5;

        // -5 per DD breach (maxdd > 25%) in last 10 paper runs
        const ddBreachCount = last10.filter(r => safeNum(r.metrics && r.metrics.maxdd_pct, 0) > 25).length;
        penalty -= ddBreachCount * 5;

        return Math.max(-20, Math.min(0, penalty));
    }

    // ====================================================================
    // HARD OVERRIDES (Safety Rails)
    // ====================================================================
    function applyHardOverrides(tier, agg, ppRuns, btRuns, notes) {
        // ── LIVE HARD BLOCKS (v1.1) ──
        if (window.PaperExecution) {
            const live = window.PaperExecution.getLiveSignals();
            let blocked = false;

            if (live.killSwitched) {
                notes.push('HARD BLOCK: Kill Switch triggered');
                blocked = true;
            }
            if (live.hygiene.disconnectCount > 3) {
                notes.push('HARD BLOCK: Excessive data feed disconnects');
                blocked = true;
            }
            if (live.hygiene.errorCount > 0) {
                notes.push('HARD BLOCK: Execution errors detected');
                blocked = true;
            }

            // live MaxDD > backtest MaxDD * 1.5 -> HARD BLOCK
            if (btRuns.length > 0) {
                const btMaxDd = Math.max(...btRuns.map(r => safeNum(r.metrics && r.metrics.maxdd_pct, 0)));
                const currentLiveDd = live.stability.rollingDrawdown;
                if (currentLiveDd > btMaxDd * 1.5) {
                    notes.push('HARD BLOCK: Live MaxDD ' + currentLiveDd.toFixed(1) + '% exceeds limit (' + (btMaxDd * 1.5).toFixed(1) + '%)');
                    blocked = true;
                }
            }

            if (blocked) return 'DO NOT DEPLOY';
        }

        const last10Paper = ppRuns.slice(0, 10);

        // 1) If >=2 auto_paused in last 10 paper runs → DO NOT DEPLOY
        const autoPauseCount = last10Paper.filter(r => r.safety_events && r.safety_events.auto_paused).length;
        if (autoPauseCount >= 2) {
            if (tier !== 'DO NOT DEPLOY') {
                notes.push('Override: ≥2 auto-pauses in last 10 paper runs');
            }
            return 'DO NOT DEPLOY';
        }

        // 2) If alignment drift severe (paper_mean_score ≤ bt_mean_score - 1.0) → DO NOT DEPLOY
        if (btRuns.length >= 3 && ppRuns.length >= 3) {
            const btMeanScore = btRuns.reduce((s, r) => s + safeNum(r.metrics && r.metrics.score_ret_dd, 0), 0) / btRuns.length;
            const ppMeanScore = ppRuns.reduce((s, r) => s + safeNum(r.metrics && r.metrics.score_ret_dd, 0), 0) / ppRuns.length;
            if (ppMeanScore <= btMeanScore - 1.0) {
                if (tier !== 'DO NOT DEPLOY') {
                    notes.push('Override: Severe paper-backtest drift detected');
                }
                return 'DO NOT DEPLOY';
            }
        }

        // 3) If rolling mean score_ret_dd < 0 OR rolling median PF < 1.0 OR rolling mean expectancy <= 0
        //    → cap to RESEARCH-ONLY at best
        if (agg) {
            const meanScore = safeNum(agg.rolling_mean_score, 0);
            const medianPf = safeNum(agg.rolling_pf_median, 1.0);
            const meanExp = safeNum(agg.rolling_mean_expectancy, 0);

            if (meanScore < 0 || medianPf < 1.0 || meanExp <= 0) {
                if (tier === 'CAPITAL-READY' || tier === 'OBSERVE') {
                    notes.push('Override: Negative edge metrics — capped to RESEARCH-ONLY');
                    return 'RESEARCH-ONLY';
                }
            }
        }

        return tier;
    }

    // ====================================================================
    // NOTE BUILDER
    // ====================================================================
    function buildNotes(sample, stability, edge, alignment, hygiene, agg, ppRuns, btRuns) {
        const notes = [];

        if (sample < 10) {
            notes.push('Insufficient data for reliable scoring');
        }

        if (stability < 15) {
            const meanDd = agg ? safeNum(agg.rolling_mean_maxdd, 0).toFixed(1) : '?';
            notes.push('Drawdown profile elevated (avg DD: ' + meanDd + '%)');
        }

        if (alignment < 5 && btRuns.length >= 3 && ppRuns.length >= 3) {
            notes.push('Paper diverging from backtest');
        }

        if (hygiene < -10) {
            notes.push('Safety breaches detected in recent paper runs');
        }

        if (edge < 10 && agg) {
            const pf = safeNum(agg.rolling_pf_median, 0).toFixed(2);
            notes.push('Edge quality weak (median PF: ' + pf + ')');
        }

        return notes;
    }

    // ====================================================================
    // CONVENIENCE — Get tier only
    // ====================================================================
    function getTier(strategyKey) {
        return computeCRS(strategyKey).tier;
    }

    // ====================================================================
    // UI — TIER BADGE (unchanged component, driven by CRS)
    // ====================================================================

    function createTierBadge(strategyKey, compact) {
        const crs = computeCRS(strategyKey);
        const cfg = TIER_CONFIG[crs.tier] || TIER_CONFIG['RESEARCH-ONLY'];

        const badge = document.createElement('span');
        badge.className = 'cr-tier-badge cr-tier--' + crs.tier.toLowerCase().replace(/[\s]/g, '-');
        badge.setAttribute('data-cr-strategy-key', strategyKey);
        badge.style.cssText = `
            display: inline-flex; align-items: center; gap: 4px;
            padding: ${compact ? '2px 7px' : '3px 10px'}; border-radius: 4px;
            font-size: ${compact ? '0.58rem' : '0.65rem'};
            font-weight: 600; letter-spacing: 0.04em; font-family: 'Inter', sans-serif;
            background: ${cfg.bg}; color: ${cfg.color};
            border: 1px solid ${cfg.border}; white-space: nowrap;
            cursor: pointer; transition: opacity 0.2s;
        `;
        badge.textContent = compact
            ? cfg.label.split(' ')[0]
            : cfg.icon + ' ' + cfg.label;

        badge.title = 'CRS: ' + crs.crs + ' / 100 — Click for details\nScore reflects LIVE system health + backtest edge + execution stability.';

        badge.addEventListener('click', (e) => {
            e.stopPropagation();
            openReadinessPanel(strategyKey);
        });

        return badge;
    }

    // ====================================================================
    // UI — BADGE PLACEMENT (unchanged)
    // ====================================================================

    function renderPresetTierBadge() {
        const selector = document.getElementById('preset-selector');
        if (!selector) return;

        const existing = document.getElementById('cr-preset-tier-wrap');
        if (existing) existing.remove();

        const presetName = selector.value || 'CUSTOM';
        if (!window.StrategyHealth) return;

        const health = window.StrategyHealth.getHealth(presetName);
        if (!health || health.runCount === 0) return;

        const wrapper = document.createElement('div');
        wrapper.id = 'cr-preset-tier-wrap';
        wrapper.style.cssText = 'display: flex; align-items: center; gap: 8px; margin-top: 4px;';
        wrapper.appendChild(createTierBadge(presetName));

        const fieldGroup = selector.closest('.bt-field-group');
        if (fieldGroup) fieldGroup.appendChild(wrapper);
    }

    function renderWatchlistTierBadge() {
        const sel = document.getElementById('pw-candidate-select');
        if (!sel) return;

        const existing = document.getElementById('cr-watchlist-tier-wrap');
        if (existing) existing.remove();

        const candidateId = sel.value;
        if (!candidateId || !window.StrategyHealth) return;

        const allKeys = window.StrategyHealth.getAllStrategyKeys();
        let matchKey = allKeys.find(k => k === candidateId || candidateId.includes(k));
        if (!matchKey) return;

        const health = window.StrategyHealth.getHealth(matchKey);
        if (!health || health.runCount === 0) return;

        const wrapper = document.createElement('div');
        wrapper.id = 'cr-watchlist-tier-wrap';
        wrapper.style.cssText = 'display: flex; align-items: center; gap: 6px; margin-top: 4px;';
        wrapper.appendChild(createTierBadge(matchKey, true));

        const parent = sel.closest('.pw-settings-left');
        if (parent) parent.appendChild(wrapper);

        renderGatingWarning(matchKey);
    }

    function renderAllTierBadges() {
        renderPresetTierBadge();
        renderWatchlistTierBadge();
        updateReadinessButton();

        const panel = document.getElementById('cr-readiness-panel');
        if (panel && panel.style.display !== 'none') {
            const key = panel.getAttribute('data-cr-strategy-key');
            if (key) renderReadinessPanelContent(key);
        }
    }

    // ====================================================================
    // UI — GATING WARNING BANNER (warn-only, CRS-driven)
    // ====================================================================

    function renderGatingWarning(strategyKey) {
        const existing = document.getElementById('cr-gating-banner');
        if (existing) existing.remove();

        const crs = computeCRS(strategyKey);
        if (crs.tier !== 'DO NOT DEPLOY') return;

        const banner = document.createElement('div');
        banner.id = 'cr-gating-banner';
        banner.style.cssText = `
            margin: 8px 0; padding: 10px 14px; border-radius: 8px;
            background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.25);
            display: flex; align-items: flex-start; gap: 10px;
            font-family: 'Inter', sans-serif;
        `;

        const reason = crs.notes.length > 0 ? crs.notes[0].toLowerCase() : 'significant risk factors';
        banner.innerHTML = `
            <div style="flex: 1;">
                <div style="font-size: 0.72rem; font-weight: 600; color: #f87171; margin-bottom: 4px;">
                    ⚠ Deployment Risk — DO NOT DEPLOY (CRS: ${crs.crs}/100)
                </div>
                <div style="font-size: 0.66rem; color: #94a3b8; line-height: 1.5;">
                    This strategy has been flagged due to ${reason}.
                    Review the Deployment Readiness panel before proceeding.
                </div>
            </div>
            <button id="cr-gating-dismiss" style="
                background: transparent; border: 1px solid rgba(239,68,68,0.3);
                color: #f87171; padding: 3px 8px; border-radius: 4px;
                cursor: pointer; font-size: 0.6rem; font-family: 'Inter', sans-serif;
                white-space: nowrap;
            ">Dismiss</button>
        `;

        const modal = document.getElementById('paper-trading-modal');
        if (modal) {
            const body = modal.querySelector('.pw-modal-body') || modal;
            body.insertBefore(banner, body.firstChild);
        }

        banner.querySelector('#cr-gating-dismiss').addEventListener('click', () => {
            banner.remove();
        });
    }

    // ====================================================================
    // UI — READINESS BUTTON (unchanged injection)
    // ====================================================================

    function updateReadinessButton() {
        let btn = document.getElementById('btn-capital-readiness');
        if (!btn) return;

        const selector = document.getElementById('preset-selector');
        const key = selector ? selector.value || 'CUSTOM' : 'CUSTOM';

        if (!window.StrategyHealth) return;
        const health = window.StrategyHealth.getHealth(key);
        if (!health || health.runCount === 0) {
            btn.querySelector('#cr-inline-tier').innerHTML = '';
            return;
        }

        const crs = computeCRS(key);
        const cfg = TIER_CONFIG[crs.tier] || TIER_CONFIG['RESEARCH-ONLY'];

        const inlineTier = btn.querySelector('#cr-inline-tier');
        if (inlineTier) {
            inlineTier.style.cssText = `
                display: inline-flex; align-items: center; gap: 3px;
                padding: 1px 6px; border-radius: 3px; font-size: 0.6rem;
                font-weight: 700; letter-spacing: 0.04em;
                background: ${cfg.bg}; color: ${cfg.color};
                border: 1px solid ${cfg.border};
            `;
            inlineTier.textContent = cfg.icon + ' ' + cfg.label.split(' ')[0];
        }
    }

    function initReadinessButton() {
        const healthBtn = document.getElementById('btn-strategy-health');
        if (!healthBtn) {
            setTimeout(initReadinessButton, 1000);
            return;
        }

        if (document.getElementById('btn-capital-readiness')) return;

        const btn = document.createElement('button');
        btn.id = 'btn-capital-readiness';
        btn.className = 'bt-btn bt-btn-outline';
        btn.style.cssText = `
            width: 100%; margin-bottom: 12px; display: flex; align-items: center;
            justify-content: center; gap: 6px; padding: 10px 16px; font-size: 0.8rem;
            font-weight: 500; color: #94a3b8; background: rgba(34,197,94,0.04);
            border: 1px solid rgba(34,197,94,0.15); border-radius: 8px; cursor: pointer;
            transition: all 0.2s; font-family: 'Inter', sans-serif;
        `;
        btn.onmouseover = function () {
            this.style.borderColor = 'rgba(34,197,94,0.35)';
            this.style.color = '#86efac';
        };
        btn.onmouseout = function () {
            this.style.borderColor = 'rgba(34,197,94,0.15)';
            this.style.color = '#94a3b8';
        };
        btn.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M9 12l2 2 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M12 2a10 10 0 100 20 10 10 0 000-20z" stroke="currentColor" stroke-width="2"/>
            </svg>
            Deployment Readiness
            <span id="cr-inline-tier" style="margin-left:4px;"></span>
        `;
        btn.title = 'Score reflects LIVE system health + backtest edge + execution stability.';
        btn.addEventListener('click', () => {
            const selector = document.getElementById('preset-selector');
            const key = selector ? selector.value || 'CUSTOM' : 'CUSTOM';
            openReadinessPanel(key);
        });

        healthBtn.parentNode.insertBefore(btn, healthBtn.nextSibling);
        updateReadinessButton();
    }

    // ====================================================================
    // UI — READINESS PANEL (floating, same structure)
    // ====================================================================

    function ensureReadinessPanel() {
        if (document.getElementById('cr-readiness-panel')) return;

        const panel = document.createElement('div');
        panel.id = 'cr-readiness-panel';
        panel.style.cssText = `
            display: none; position: fixed; bottom: 20px; left: 20px;
            width: 440px; max-height: 600px; overflow-y: auto;
            background: #0f172a; border: 1px solid rgba(34, 197, 94, 0.2);
            border-radius: 12px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5);
            z-index: 1001; font-family: 'Inter', sans-serif;
        `;
        panel.innerHTML = `
            <div id="cr-panel-header" style="
                display: flex; justify-content: space-between; align-items: center;
                padding: 14px 18px; border-bottom: 1px solid rgba(255,255,255,0.06);
                background: rgba(255,255,255,0.02); border-radius: 12px 12px 0 0;
                cursor: pointer; user-select: none;
            ">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                        <path d="M9 12l2 2 4-4" stroke="#4ade80" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        <path d="M12 2a10 10 0 100 20 10 10 0 000-20z" stroke="#4ade80" stroke-width="2"/>
                    </svg>
                    <span style="font-size: 0.85rem; font-weight: 600; color: #e2e8f0;">Deployment Readiness</span>
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span id="cr-panel-collapse-icon" style="color: #64748b; font-size: 0.8rem;">▼</span>
                    <button id="cr-panel-close" style="
                        background: transparent; border: none; color: #64748b;
                        cursor: pointer; padding: 2px; font-size: 1.1rem; line-height: 1;
                    ">&times;</button>
                </div>
            </div>
            <div id="cr-panel-body" style="padding: 16px 18px;"></div>
        `;
        document.body.appendChild(panel);

        panel.querySelector('#cr-panel-close').addEventListener('click', (e) => {
            e.stopPropagation();
            panel.style.display = 'none';
        });

        let collapsed = false;
        panel.querySelector('#cr-panel-header').addEventListener('click', (e) => {
            if (e.target.id === 'cr-panel-close') return;
            collapsed = !collapsed;
            const body = document.getElementById('cr-panel-body');
            const icon = document.getElementById('cr-panel-collapse-icon');
            if (body) body.style.display = collapsed ? 'none' : 'block';
            if (icon) icon.textContent = collapsed ? '▶' : '▼';
        });
    }

    function openReadinessPanel(strategyKey) {
        ensureReadinessPanel();
        const panel = document.getElementById('cr-readiness-panel');
        panel.setAttribute('data-cr-strategy-key', strategyKey);
        panel.style.display = 'block';
        const body = document.getElementById('cr-panel-body');
        if (body) body.style.display = 'block';
        const icon = document.getElementById('cr-panel-collapse-icon');
        if (icon) icon.textContent = '▼';
        renderReadinessPanelContent(strategyKey);
    }

    // ====================================================================
    // UI — PANEL CONTENT RENDERING (enhanced with CRS v1)
    // ====================================================================

    function renderReadinessPanelContent(strategyKey) {
        const body = document.getElementById('cr-panel-body');
        if (!body) return;

        const crs = computeCRS(strategyKey);
        const cfg = TIER_CONFIG[crs.tier] || TIER_CONFIG['RESEARCH-ONLY'];
        const bd = crs.breakdown;

        let html = '';

        // ── Strategy Name + Tier Badge ──
        html += `
            <div style="margin-bottom: 16px;">
                <div style="font-size: 0.62rem; color: #475569; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 6px;">
                    STRATEGY PRESET
                </div>
                <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                    <span style="font-size: 0.95rem; font-weight: 600; color: #e2e8f0;">${strategyKey}</span>
                    <span style="
                        display: inline-flex; align-items: center; gap: 5px;
                        padding: 4px 12px; border-radius: 5px; font-size: 0.68rem;
                        font-weight: 700; letter-spacing: 0.05em;
                        background: ${cfg.bg}; color: ${cfg.color};
                        border: 1px solid ${cfg.border};
                    ">${cfg.icon} ${cfg.label}</span>
                </div>
                <div style="font-size: 0.62rem; color: #475569; margin-top: 6px; line-height: 1.5;">
                    ${cfg.description}
                </div>
            </div>
        `;

        // ── CRS: XX / 100 ──
        const barColor = crs.crs >= 75 ? '#4ade80' : crs.crs >= 55 ? '#fbbf24' : crs.crs >= 35 ? '#60a5fa' : '#f87171';
        html += `
            <div style="margin-bottom: 18px;">
                <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px;">
                    <span style="font-size: 0.68rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.06em;">
                        Capital Readiness Score
                    </span>
                    <span style="font-size: 1.1rem; font-weight: 700; color: ${barColor}; font-family: 'JetBrains Mono', monospace;">
                        ${crs.crs} <span style="font-size: 0.7rem; font-weight: 400; color: #64748b;">/ 100</span>
                    </span>
                </div>
                <div style="height: 6px; background: rgba(255,255,255,0.06); border-radius: 3px; overflow: hidden;">
                    <div style="height: 100%; width: ${crs.crs}%; background: ${barColor}; border-radius: 3px; transition: width 0.4s;"></div>
                </div>
            </div>
        `;

        // ── 5-Row Component Breakdown ──
        html += `
            <div style="margin-bottom: 16px;">
                <div style="font-size: 0.62rem; color: #475569; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 10px;">
                    CRS BREAKDOWN
                </div>
                ${renderBreakdownRow('Sample', bd.sample, 20, 'Run count, paper sessions, and trade volume')}
                ${renderBreakdownRow('Stability', bd.stability, 35, 'Rolling score consistency and drawdown profile')}
                ${renderBreakdownRow('Edge', bd.edge, 25, 'Profit factor and expectancy per trade')}
                ${renderBreakdownRow('Alignment', bd.alignment, 15, 'Paper vs backtest performance drift')}
                ${renderBreakdownRow('Hygiene', bd.hygiene, 0, 'Safety breaches and drawdown incidents', true)}
            </div>
        `;

        // ── Path to Deployment Guidance (Objective v1.2) ──
        html += renderPathToDeployment(strategyKey);

        // ── Reasons / Notes ──
        if (crs.notes.length > 0) {
            html += `
                <div style="margin-bottom: 16px;">
                    <div style="font-size: 0.62rem; color: #475569; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 8px;">
                        REASONS
                    </div>
            `;
            crs.notes.forEach(n => {
                const isHighRisk = n.includes('Override') || n.includes('Safety') || n.includes('diverging');
                const warnColor = isHighRisk ? '#f87171' : '#fbbf24';
                const warnBg = isHighRisk ? 'rgba(239,68,68,0.06)' : 'rgba(251,191,36,0.06)';
                const warnBorder = isHighRisk ? 'rgba(239,68,68,0.15)' : 'rgba(251,191,36,0.15)';
                html += `
                    <div style="
                        padding: 8px 12px; margin-bottom: 4px; border-radius: 6px;
                        background: ${warnBg}; border: 1px solid ${warnBorder};
                        font-size: 0.66rem; color: ${warnColor}; line-height: 1.4;
                    ">
                        ${isHighRisk ? '⚠' : '○'} ${n}
                    </div>
                `;
            });
            html += '</div>';
        }

        // ── Recent Runs Table ──
        html += renderRecentRunsTable(strategyKey);

        body.innerHTML = html;
    }

    // ====================================================================
    // UI HELPERS
    // ====================================================================

    function renderPathRequirement(label, status, text, progress, tooltip) {
        const statusIcon = status === 'GREEN' ? '✅' : status === 'YELLOW' ? '🟡' : '❌';
        const statusColor = status === 'GREEN' ? '#4ade80' : status === 'YELLOW' ? '#fbbf24' : '#f87171';

        let progressHtml = '';
        if (progress !== undefined && progress !== null) {
            const barPct = Math.min(100, Math.max(0, progress));
            progressHtml = `
                <div style="height: 4px; background: rgba(255,255,255,0.06); border-radius: 2px; overflow: hidden; margin-top: 4px;">
                    <div style="height: 100%; width: ${barPct}%; background: ${statusColor}; border-radius: 2px; transition: width 0.3s;"></div>
                </div>
            `;
        }

        return `
            <div style="margin-bottom: 12px;" title="${tooltip}">
                <div style="display: flex; align-items: flex-start; gap: 10px;">
                    <span style="font-size: 0.9rem; line-height: 1.2;">${statusIcon}</span>
                    <div style="flex: 1;">
                        <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 2px;">
                            <span style="font-size: 0.72rem; font-weight: 600; color: #e2e8f0;">${label}</span>
                            <span style="font-size: 0.62rem; font-weight: 500; color: ${statusColor}; text-transform: uppercase;">${status}</span>
                        </div>
                        <div style="font-size: 0.64rem; color: #94a3b8; line-height: 1.4;">
                            ${text}
                        </div>
                        ${progressHtml}
                    </div>
                </div>
            </div>
        `;
    }

    function renderPathToDeployment(strategyKey) {
        if (!window.StrategyHealth || !window.PaperExecution) return '';

        const ppRuns = getAllRuns(strategyKey).filter(r => r.source === 'PAPER');
        const live = window.PaperExecution.getLiveSignals();
        const thresholds = GATE_THRESHOLDS;

        // 1. Sample Size Requirement
        const paperTrades = ppRuns.reduce((s, r) => s + safeNum(r.metrics && r.metrics.trades, 0), 0);
        const samplePassed = paperTrades >= thresholds.minTrades;
        const sampleStatus = samplePassed ? 'GREEN' : 'RED';
        const tradesRemaining = Math.max(0, thresholds.minTrades - paperTrades);
        const sampleText = samplePassed
            ? `Target of ${thresholds.minTrades} paper trades achieved (${paperTrades} total).`
            : `Run at least ${tradesRemaining} more paper trades to meet minimal sample requirements.`;
        const sampleProgress = (paperTrades / thresholds.minTrades) * 100;

        // 2. Stability Requirement
        const killSwitched = live.killSwitched;
        let daysActive = 0;
        if (ppRuns.length > 0) {
            const firstRunTs = Math.min(...ppRuns.map(r => new Date(r.created_at).getTime()));
            daysActive = Math.floor((Date.now() - firstRunTs) / (1000 * 60 * 60 * 24));
        }
        const stabilityPassed = !killSwitched && daysActive >= 7;
        const stabilityStatus = killSwitched ? 'RED' : (daysActive >= 7 ? 'GREEN' : 'YELLOW');
        const stabilityText = killSwitched
            ? "Stability breached: Kill Switch was triggered. Reset required."
            : (stabilityPassed
                ? `System stable for ${daysActive} days without safety breaches.`
                : `Maintain stability for ${Math.max(0, 7 - daysActive)} more days without safety breaches.`);
        const stabilityProgress = (daysActive / 7) * 100;

        // 3. Drawdown Requirement
        const currentDD = live.stability ? live.stability.rollingDrawdown : 0;
        const historicalMaxDD = ppRuns.length > 0 ? Math.max(...ppRuns.map(r => safeNum(r.metrics && r.metrics.maxdd_pct, 0))) : 0;
        const effectiveDD = Math.max(currentDD, historicalMaxDD);
        const ddPassed = effectiveDD <= thresholds.maxDrawdownPct;
        const ddStatus = ddPassed ? 'GREEN' : 'RED';
        const ddText = ddPassed
            ? `Drawdown Profile Healthy: Latest peak DD is ${effectiveDD.toFixed(1)}% (Limit: ${thresholds.maxDrawdownPct}%).`
            : `Reduce drawdown below ${thresholds.maxDrawdownPct}% (Current peak: ${effectiveDD.toFixed(1)}%).`;
        const ddProgress = ddPassed ? 100 : (thresholds.maxDrawdownPct / Math.max(1, effectiveDD)) * 100;

        // 4. Hygiene Requirement
        const hygieneScore = computeHygiene(ppRuns);
        const hygienePassed = hygieneScore > -10;
        const hygieneStatus = hygienePassed ? 'GREEN' : 'RED';
        const hygieneText = hygienePassed
            ? "Hygiene Check Passed: Low execution error rate and no major data gaps."
            : "Pass hygiene checks: Resolve execution violations or data feed instability.";

        return `
            <div style="margin-bottom: 20px; padding: 16px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 10px;">
                <div style="font-size: 0.72rem; font-weight: 700; color: #e2e8f0; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 2px;">
                    PATH TO DEPLOYMENT
                </div>
                <div style="font-size: 0.64rem; color: #64748b; margin-bottom: 16px;">
                    Complete the following to unlock deployment readiness
                </div>

                ${renderPathRequirement('Sample Size', sampleStatus, sampleText, sampleProgress, 'Requires statistically significant volume of paper trades before production.')}
                ${renderPathRequirement('Stability', stabilityStatus, stabilityText, stabilityProgress, 'Observation period without emergency stops or safety breaches.')}
                ${renderPathRequirement('Drawdown', ddStatus, ddText, ddProgress, 'Strategy must remain within absolute risk parameters during paper phase.')}
                ${renderPathRequirement('Hygiene', hygieneStatus, hygieneText, null, 'No execution errors, stale data, or engine restarts.')}
            </div>
        `;
    }

    function renderBreakdownRow(label, value, maxVal, tooltip, isPenalty) {
        let displayVal, barPct, barColor;

        if (isPenalty) {
            // Hygiene: value is 0 to -20
            displayVal = value.toFixed(0);
            barPct = Math.abs(value) / 20 * 100;
            barColor = value >= 0 ? '#4ade80' : value > -10 ? '#fbbf24' : '#f87171';
        } else {
            displayVal = value.toFixed(0);
            barPct = maxVal > 0 ? (value / maxVal) * 100 : 0;
            const ratio = maxVal > 0 ? value / maxVal : 0;
            barColor = ratio >= 0.7 ? '#4ade80' : ratio >= 0.4 ? '#fbbf24' : '#f87171';
        }

        const scoreDisplay = isPenalty
            ? `${displayVal}`
            : `${displayVal}/${maxVal}`;

        return `
            <div style="margin-bottom: 8px;" title="${tooltip}">
                <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 3px;">
                    <span style="font-size: 0.66rem; color: #94a3b8;">${label}</span>
                    <span style="font-size: 0.72rem; font-weight: 600; color: ${barColor}; font-family: 'JetBrains Mono', monospace;">
                        ${scoreDisplay}
                    </span>
                </div>
                <div style="height: 4px; background: rgba(255,255,255,0.06); border-radius: 2px; overflow: hidden;">
                    <div style="height: 100%; width: ${Math.min(100, barPct)}%; background: ${barColor}; border-radius: 2px; transition: width 0.3s;"></div>
                </div>
            </div>
        `;
    }

    function renderRecentRunsTable(strategyKey) {
        if (!window.StrategyHealth) return '';

        const runs = window.StrategyHealth.getRecentRuns(strategyKey, 8);
        if (!runs || runs.length === 0) {
            return `
                <div style="font-size: 0.66rem; color: #475569; font-style: italic; padding: 8px;">
                    No runs contributing to this score.
                </div>
            `;
        }

        let html = `
            <div style="margin-bottom: 8px;">
                <div style="font-size: 0.62rem; color: #475569; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 8px;">
                    RECENT RUNS (LAST ${runs.length})
                </div>
                <div style="display: flex; flex-direction: column; gap: 2px; max-height: 200px; overflow-y: auto;">
        `;

        // Header
        html += `
            <div style="
                display: grid; grid-template-columns: 68px 32px 55px 55px 48px; gap: 6px;
                padding: 4px 8px; font-size: 0.54rem; color: #475569;
                text-transform: uppercase; letter-spacing: 0.05em;
                border-bottom: 1px solid rgba(255,255,255,0.04);
            ">
                <span>Time</span><span>Src</span><span>Score</span><span>Return</span><span>DD</span>
            </div>
        `;

        runs.forEach(run => {
            const date = new Date(run.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' });
            const sourceColor = run.source === 'BACKTEST' ? '#818cf8' : '#38bdf8';
            const sourceLabel = run.source === 'BACKTEST' ? 'BT' : 'PP';
            const retPct = safeNum(run.metrics && run.metrics.return_pct, 0);
            const scoreRetDd = safeNum(run.metrics && run.metrics.score_ret_dd, 0);
            const maxddPct = safeNum(run.metrics && run.metrics.maxdd_pct, 0);
            const retColor = retPct >= 0 ? '#4ade80' : '#f87171';
            const scoreColor = scoreRetDd >= 0 ? '#4ade80' : '#f87171';
            const hasSafety = run.safety_events && run.safety_events.auto_paused;

            html += `
                <div style="
                    display: grid; grid-template-columns: 68px 32px 55px 55px 48px; gap: 6px;
                    padding: 4px 8px; background: ${hasSafety ? 'rgba(239,68,68,0.04)' : 'rgba(255,255,255,0.015)'};
                    border: 1px solid ${hasSafety ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.03)'}; border-radius: 3px;
                    font-size: 0.62rem; align-items: center;
                ">
                    <span style="color: #94a3b8; font-size: 0.58rem;">${date}</span>
                    <span style="
                        font-size: 0.52rem; font-weight: 700; padding: 1px 3px;
                        border-radius: 2px; background: ${sourceColor}12;
                        color: ${sourceColor}; text-align: center;
                    ">${sourceLabel}</span>
                    <span style="color: ${scoreColor}; font-family: 'JetBrains Mono', monospace; font-weight: 600;">
                        ${scoreRetDd.toFixed(2)}
                    </span>
                    <span style="color: ${retColor}; font-family: 'JetBrains Mono', monospace; font-weight: 600;">
                        ${retPct >= 0 ? '+' : ''}${retPct.toFixed(1)}%
                    </span>
                    <span style="color: #f87171; font-family: 'JetBrains Mono', monospace; font-weight: 600;">
                        ${maxddPct.toFixed(1)}%
                    </span>
                </div>
            `;
        });

        html += '</div></div>';
        return html;
    }

    // ====================================================================
    // PRESET SELECTOR LISTENER
    // ====================================================================

    function initPresetListener() {
        const selector = document.getElementById('preset-selector');
        if (!selector) return;

        selector.addEventListener('change', () => {
            renderAllTierBadges();
        });
    }

    // ====================================================================
    // WATCHLIST CANDIDATE LISTENER
    // ====================================================================

    function initWatchlistListener() {
        const observer = new MutationObserver(() => {
            const sel = document.getElementById('pw-candidate-select');
            if (sel && !sel._crListenerBound) {
                sel._crListenerBound = true;
                sel.addEventListener('change', renderWatchlistTierBadge);
                renderWatchlistTierBadge();
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    // ====================================================================
    // INITIALIZATION
    // ====================================================================

    function init() {
        initPresetListener();
        initWatchlistListener();
        setTimeout(() => {
            renderAllTierBadges();
            initReadinessButton();
        }, 800);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // ====================================================================
    // CAPITAL READINESS GATE v1 — Per-Run Evaluation Layer
    // Post-processing only. Uses existing backtest outputs.
    // ====================================================================

    // ── CONFIGURABLE THRESHOLDS ──
    const GATE_THRESHOLDS = {
        minTrades: 30,     // Hard fail if < 30 trades
        maxDrawdownPct: 25,     // Hard fail if maxDD > 25%
        minProfitFactor: 1.2,    // Soft criterion
        mcProbOfLossCeil: 0.30,   // Monte Carlo: max 30% chance of net loss
        oosScoreMin: 0.5,    // Walk-Forward OOS: min score 0.5
        stabilityPctMin: 60      // % of OOS windows that are profitable
    };

    // ── WALK-FORWARD OOS SIMULATION ──
    // Splits equity curve into N windows, computes return & drawdown per window.
    // Returns { score, profitableWindows, totalWindows, windows[] }
    function runWalkForwardOOS(equityCurve, numWindows) {
        numWindows = numWindows || 5;
        if (!equityCurve || equityCurve.length < 20) {
            return { score: 0, profitableWindows: 0, totalWindows: 0, windows: [] };
        }

        const len = equityCurve.length;
        const windowSize = Math.floor(len / numWindows);
        if (windowSize < 4) {
            return { score: 0, profitableWindows: 0, totalWindows: 0, windows: [] };
        }

        const windows = [];
        let profitableCount = 0;
        let totalScore = 0;

        for (let w = 0; w < numWindows; w++) {
            const start = w * windowSize;
            const end = (w === numWindows - 1) ? len - 1 : (start + windowSize - 1);
            const eqStart = equityCurve[start];
            const eqEnd = equityCurve[end];

            // Return for this window
            const windowReturn = eqStart > 0 ? ((eqEnd - eqStart) / eqStart) * 100 : 0;

            // Max drawdown within this window
            let peak = equityCurve[start];
            let maxDD = 0;
            for (let i = start + 1; i <= end; i++) {
                if (equityCurve[i] > peak) peak = equityCurve[i];
                const dd = peak > 0 ? ((peak - equityCurve[i]) / peak) * 100 : 0;
                if (dd > maxDD) maxDD = dd;
            }

            // Window score: return / max(maxDD, 1) — penalizes high DD
            const windowScore = maxDD > 1 ? windowReturn / maxDD : windowReturn;
            const isProfitable = windowReturn > 0;
            if (isProfitable) profitableCount++;
            totalScore += windowScore;

            windows.push({
                windowIndex: w,
                startIdx: start,
                endIdx: end,
                returnPct: parseFloat(windowReturn.toFixed(2)),
                maxDD: parseFloat(maxDD.toFixed(2)),
                score: parseFloat(windowScore.toFixed(3)),
                profitable: isProfitable
            });
        }

        // Normalized score: average window score clamped to [0, 1]
        const avgScore = numWindows > 0 ? totalScore / numWindows : 0;
        const normalizedScore = Math.max(0, Math.min(1, avgScore / 3)); // 3.0 = excellent

        return {
            score: parseFloat(normalizedScore.toFixed(3)),
            profitableWindows: profitableCount,
            totalWindows: numWindows,
            windows: windows
        };
    }

    // ── MONTE CARLO SIMULATION ──
    // Bootstraps trade PnL array N times, computes probability of ending in net loss.
    // Returns { probOfLoss, medianReturn, p5Return }
    function runMonteCarlo(trades, numSims, startingCapital) {
        numSims = numSims || 1000;
        startingCapital = startingCapital || 100000;

        if (!trades || trades.length < 5) {
            return { probOfLoss: 1.0, medianReturn: 0, p5Return: 0 };
        }

        const pnls = trades.map(function (t) { return t.pnl || 0; });
        const n = pnls.length;
        const finalReturns = [];

        // Seeded pseudo-random for determinism (simple LCG)
        let seed = 42;
        function nextRand() {
            seed = (seed * 1664525 + 1013904223) & 0x7fffffff;
            return seed / 0x7fffffff;
        }

        for (let sim = 0; sim < numSims; sim++) {
            let equity = startingCapital;
            for (let i = 0; i < n; i++) {
                const idx = Math.floor(nextRand() * n);
                equity += pnls[idx];
            }
            const simReturn = ((equity - startingCapital) / startingCapital) * 100;
            finalReturns.push(simReturn);
        }

        // Sort for percentile analysis
        finalReturns.sort(function (a, b) { return a - b; });

        const lossCount = finalReturns.filter(function (r) { return r < 0; }).length;
        const probOfLoss = lossCount / numSims;
        const medianIdx = Math.floor(numSims / 2);
        const p5Idx = Math.floor(numSims * 0.05);

        return {
            probOfLoss: parseFloat(probOfLoss.toFixed(3)),
            medianReturn: parseFloat(finalReturns[medianIdx].toFixed(2)),
            p5Return: parseFloat(finalReturns[p5Idx].toFixed(2))
        };
    }

    // ── GATE EVALUATION ──
    // Takes a backtest report object and returns structured classification.
    function evaluateCapitalReadiness(report) {
        if (!report) {
            return _emptyGateResult('No report provided.');
        }

        const metrics = report.metrics || {};
        const trades = report.trades || [];
        const eq = report.equityCurve || [];
        const startCap = (report.config && parseFloat(report.config.capital)) || 100000;

        // Parse metric values
        const tradeCount = trades.length;
        const maxDD = Math.abs(parseFloat(metrics.maxDrawdown)) || 0;
        const pf = parseFloat(metrics.profitFactor) || 0;
        const sharpe = parseFloat(metrics.sharpe) || 0;
        const winRate = parseFloat(metrics.winRate) || 0;
        const expectancy = parseFloat(metrics.expectancy) || 0;

        // Run simulations
        const wf = runWalkForwardOOS(eq, 5);
        const mc = runMonteCarlo(trades, 1000, startCap);

        // Stability: % profitable OOS windows
        const stabilityPct = wf.totalWindows > 0
            ? (wf.profitableWindows / wf.totalWindows) * 100
            : 0;

        // ── Evaluate each criterion ──
        const criteria = [
            {
                name: 'Minimum Trades',
                threshold: '≥ ' + GATE_THRESHOLDS.minTrades,
                actual: tradeCount,
                passed: tradeCount >= GATE_THRESHOLDS.minTrades,
                hardFail: true
            },
            {
                name: 'Max Drawdown',
                threshold: '≤ ' + GATE_THRESHOLDS.maxDrawdownPct + '%',
                actual: maxDD.toFixed(1) + '%',
                passed: maxDD <= GATE_THRESHOLDS.maxDrawdownPct,
                hardFail: true
            },
            {
                name: 'Profit Factor',
                threshold: '≥ ' + GATE_THRESHOLDS.minProfitFactor,
                actual: pf.toFixed(2),
                passed: pf >= GATE_THRESHOLDS.minProfitFactor,
                hardFail: false
            },
            {
                name: 'Monte Carlo P(Loss)',
                threshold: '≤ ' + (GATE_THRESHOLDS.mcProbOfLossCeil * 100) + '%',
                actual: (mc.probOfLoss * 100).toFixed(1) + '%',
                passed: mc.probOfLoss <= GATE_THRESHOLDS.mcProbOfLossCeil,
                hardFail: false
            },
            {
                name: 'OOS Walk-Forward Score',
                threshold: '≥ ' + GATE_THRESHOLDS.oosScoreMin,
                actual: wf.score.toFixed(3),
                passed: wf.score >= GATE_THRESHOLDS.oosScoreMin,
                hardFail: false
            },
            {
                name: 'OOS Stability',
                threshold: '≥ ' + GATE_THRESHOLDS.stabilityPctMin + '%',
                actual: stabilityPct.toFixed(0) + '%',
                passed: stabilityPct >= GATE_THRESHOLDS.stabilityPctMin,
                hardFail: false
            }
        ];

        // ── Determine classification ──
        const hardFails = criteria.filter(function (c) { return c.hardFail && !c.passed; });
        const softFails = criteria.filter(function (c) { return !c.hardFail && !c.passed; });
        const totalFails = hardFails.length + softFails.length;

        let classification;
        if (hardFails.length > 0 || totalFails >= 3) {
            classification = 'RESEARCH_ONLY';
        } else if (softFails.length >= 1) {
            classification = 'EXPERIMENTAL';
        } else {
            classification = 'CAPITAL_READY';
        }

        // ── Build rejection reasons ──
        const rejectionReasons = [];
        criteria.forEach(function (c) {
            if (!c.passed) {
                rejectionReasons.push(c.name + ': actual ' + c.actual + ' (required ' + c.threshold + ')');
            }
        });

        return {
            classification: classification,
            criteria: criteria,
            rejectionReasons: rejectionReasons,
            walkForward: wf,
            monteCarlo: mc,
            inputMetrics: {
                trades: tradeCount,
                maxDD: maxDD,
                profitFactor: pf,
                sharpe: sharpe,
                winRate: winRate,
                expectancy: expectancy
            },
            timestamp: new Date().toISOString()
        };
    }

    function _emptyGateResult(reason) {
        return {
            classification: 'RESEARCH_ONLY',
            criteria: [],
            rejectionReasons: [reason],
            walkForward: { score: 0, profitableWindows: 0, totalWindows: 0, windows: [] },
            monteCarlo: { probOfLoss: 1, medianReturn: 0, p5Return: 0 },
            inputMetrics: { trades: 0, maxDD: 0, profitFactor: 0, sharpe: 0, winRate: 0, expectancy: 0 },
            timestamp: new Date().toISOString()
        };
    }

    // ── GATE UI CONFIG ──
    const GATE_TIER_DISPLAY = {
        'CAPITAL_READY': { color: '#4ade80', bg: 'rgba(34,197,94,0.10)', border: 'rgba(34,197,94,0.25)', icon: '🟢', label: 'CAPITAL READY' },
        'EXPERIMENTAL': { color: '#fbbf24', bg: 'rgba(251,191,36,0.10)', border: 'rgba(251,191,36,0.25)', icon: '🟡', label: 'EXPERIMENTAL' },
        'RESEARCH_ONLY': { color: '#60a5fa', bg: 'rgba(96,165,250,0.10)', border: 'rgba(96,165,250,0.25)', icon: '🔵', label: 'RESEARCH ONLY' }
    };

    // ── RENDER GATE BADGE ──
    function renderGateBadge(gateResult) {
        const cfg = GATE_TIER_DISPLAY[gateResult.classification] || GATE_TIER_DISPLAY['RESEARCH_ONLY'];

        // Remove existing badge
        const existing = document.getElementById('crg-gate-badge');
        if (existing) existing.remove();

        const badge = document.createElement('div');
        badge.id = 'crg-gate-badge';
        badge.className = 'crg-badge';
        badge.style.cssText =
            'display: inline-flex; align-items: center; gap: 6px; padding: 5px 14px;' +
            'border-radius: 6px; font-size: 0.72rem; font-weight: 700; letter-spacing: 0.05em;' +
            'font-family: "Inter", sans-serif; cursor: pointer; transition: all 0.2s;' +
            'background: ' + cfg.bg + '; color: ' + cfg.color + '; border: 1px solid ' + cfg.border + ';';
        badge.textContent = cfg.icon + ' ' + cfg.label;
        badge.title = 'Click to view Deployment Readiness details';

        badge.addEventListener('click', function () {
            renderGatePanel(gateResult);
        });

        // Insert badge after bt-status-bar or metrics area
        const metricsArea = document.getElementById('bt-status');
        if (metricsArea && metricsArea.parentNode) {
            metricsArea.parentNode.insertBefore(badge, metricsArea.nextSibling);
        }

        return badge;
    }

    // ── RENDER GATE WARNING BANNER ──
    function renderGateWarningBanner(gateResult) {
        const existing = document.getElementById('crg-warning-banner');
        if (existing) existing.remove();

        if (gateResult.classification === 'CAPITAL_READY') return;

        const cfg = GATE_TIER_DISPLAY[gateResult.classification];
        const isResearch = gateResult.classification === 'RESEARCH_ONLY';
        const warnBg = isResearch ? 'rgba(96,165,250,0.06)' : 'rgba(251,191,36,0.06)';
        const warnBorder = isResearch ? 'rgba(96,165,250,0.18)' : 'rgba(251,191,36,0.18)';

        const banner = document.createElement('div');
        banner.id = 'crg-warning-banner';
        banner.className = 'crg-warning-banner';
        banner.style.cssText =
            'margin: 8px 16px; padding: 12px 16px; border-radius: 8px;' +
            'background: ' + warnBg + '; border: 1px solid ' + warnBorder + ';' +
            'display: flex; align-items: flex-start; gap: 10px; font-family: "Inter", sans-serif;';

        const topReason = gateResult.rejectionReasons.length > 0
            ? gateResult.rejectionReasons[0]
            : 'criteria not met';

        banner.innerHTML =
            '<div style="flex:1;">' +
            '<div style="font-size: 0.74rem; font-weight: 600; color: ' + cfg.color + '; margin-bottom: 4px;">' +
            '⚠ ' + cfg.label + ' — Not Deployment-Grade' +
            '</div>' +
            '<div style="font-size: 0.66rem; color: #94a3b8; line-height: 1.5;">' +
            'This result is classified as <strong>' + cfg.label + '</strong> and should not be treated as capital-ready. ' +
            'Primary reason: ' + topReason + '.' +
            '</div>' +
            '</div>' +
            '<button id="crg-banner-dismiss" style="' +
            'background: transparent; border: 1px solid ' + warnBorder + ';' +
            'color: ' + cfg.color + '; padding: 3px 8px; border-radius: 4px;' +
            'cursor: pointer; font-size: 0.6rem; font-family: \'Inter\', sans-serif; white-space: nowrap;' +
            '">Dismiss</button>';

        // Insert after status bar
        const statusBar = document.querySelector('.bt-status-bar');
        if (statusBar && statusBar.parentNode) {
            statusBar.parentNode.insertBefore(banner, statusBar.nextSibling);
        }

        banner.querySelector('#crg-banner-dismiss').addEventListener('click', function () {
            banner.remove();
        });
    }

    // ── RENDER GATE PANEL (Deployment Readiness Detail) ──
    function renderGatePanel(gateResult) {
        let panel = document.getElementById('crg-gate-panel');
        if (!panel) {
            panel = document.createElement('div');
            panel.id = 'crg-gate-panel';
            panel.style.cssText =
                'display: none; position: fixed; bottom: 20px; right: 20px;' +
                'width: 460px; max-height: 620px; overflow-y: auto;' +
                'background: #0f172a; border: 1px solid rgba(99,102,241,0.2);' +
                'border-radius: 12px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5);' +
                'z-index: 1002; font-family: "Inter", sans-serif;';
            document.body.appendChild(panel);
        }

        const cfg = GATE_TIER_DISPLAY[gateResult.classification] || GATE_TIER_DISPLAY['RESEARCH_ONLY'];
        const wf = gateResult.walkForward;
        const mc = gateResult.monteCarlo;

        let html = '';

        // ── Header ──
        html += '<div style="' +
            'display: flex; justify-content: space-between; align-items: center;' +
            'padding: 14px 18px; border-bottom: 1px solid rgba(255,255,255,0.06);' +
            'background: rgba(255,255,255,0.02); border-radius: 12px 12px 0 0;">' +
            '<div style="display: flex; align-items: center; gap: 8px;">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none">' +
            '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="' + cfg.color + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
            '</svg>' +
            '<span style="font-size: 0.85rem; font-weight: 600; color: #e2e8f0;">Deployment Readiness</span>' +
            '</div>' +
            '<button id="crg-panel-close" style="background: transparent; border: none; color: #64748b; cursor: pointer; padding: 2px; font-size: 1.1rem; line-height: 1;">&times;</button>' +
            '</div>';

        // ── Classification Badge ──
        html += '<div style="padding: 16px 18px;">';
        html += '<div style="display: flex; align-items: center; gap: 10px; margin-bottom: 16px;">' +
            '<span style="display: inline-flex; align-items: center; gap: 5px;' +
            'padding: 6px 16px; border-radius: 6px; font-size: 0.78rem;' +
            'font-weight: 700; letter-spacing: 0.05em;' +
            'background: ' + cfg.bg + '; color: ' + cfg.color + ';' +
            'border: 1px solid ' + cfg.border + ';">' + cfg.icon + ' ' + cfg.label + '</span>' +
            '</div>';

        // ── Criteria Table ──
        html += '<div style="font-size: 0.62rem; color: #475569; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 10px;">GATE CRITERIA</div>';

        gateResult.criteria.forEach(function (c) {
            var statusIcon = c.passed ? '✅' : (c.hardFail ? '🚫' : '⚠️');
            var rowBg = c.passed ? 'rgba(34,197,94,0.04)' : (c.hardFail ? 'rgba(239,68,68,0.06)' : 'rgba(251,191,36,0.06)');
            var rowBorder = c.passed ? 'rgba(34,197,94,0.1)' : (c.hardFail ? 'rgba(239,68,68,0.12)' : 'rgba(251,191,36,0.12)');
            var valColor = c.passed ? '#4ade80' : (c.hardFail ? '#f87171' : '#fbbf24');

            html += '<div style="display: flex; align-items: center; gap: 8px;' +
                'padding: 8px 12px; margin-bottom: 4px; border-radius: 6px;' +
                'background: ' + rowBg + '; border: 1px solid ' + rowBorder + '; font-size: 0.68rem;">' +
                '<span style="width: 20px; text-align: center;">' + statusIcon + '</span>' +
                '<span style="flex: 1; color: #e2e8f0;">' + c.name + '</span>' +
                '<span style="color: #64748b; font-size: 0.62rem; margin-right: 8px;">req: ' + c.threshold + '</span>' +
                '<span style="color: ' + valColor + '; font-weight: 600; font-family: \'JetBrains Mono\', monospace;">' + c.actual + '</span>' +
                '</div>';
        });

        // ── Walk-Forward OOS Windows ──
        if (wf.windows && wf.windows.length > 0) {
            html += '<div style="font-size: 0.62rem; color: #475569; text-transform: uppercase; letter-spacing: 0.08em; margin-top: 16px; margin-bottom: 8px;">WALK-FORWARD OOS (' + wf.profitableWindows + '/' + wf.totalWindows + ' profitable)</div>';

            html += '<div style="display: flex; gap: 4px; margin-bottom: 4px;">';
            wf.windows.forEach(function (w) {
                var wColor = w.profitable ? '#4ade80' : '#f87171';
                var wBg = w.profitable ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)';
                html += '<div style="flex: 1; text-align: center; padding: 6px 4px; border-radius: 4px;' +
                    'background: ' + wBg + '; border: 1px solid ' + (w.profitable ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)') + ';">' +
                    '<div style="font-size: 0.58rem; color: #64748b;">W' + (w.windowIndex + 1) + '</div>' +
                    '<div style="font-size: 0.68rem; font-weight: 600; color: ' + wColor + '; font-family: \'JetBrains Mono\', monospace;">' +
                    (w.returnPct >= 0 ? '+' : '') + w.returnPct + '%</div>' +
                    '<div style="font-size: 0.54rem; color: #64748b;">DD: ' + w.maxDD + '%</div>' +
                    '</div>';
            });
            html += '</div>';
        }

        // ── Monte Carlo Results ──
        html += '<div style="font-size: 0.62rem; color: #475569; text-transform: uppercase; letter-spacing: 0.08em; margin-top: 16px; margin-bottom: 8px;">MONTE CARLO (1000 sims)</div>';
        var mcLossColor = mc.probOfLoss <= 0.30 ? '#4ade80' : (mc.probOfLoss <= 0.50 ? '#fbbf24' : '#f87171');
        html += '<div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px;">' +
            '<div style="text-align: center; padding: 8px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.04); border-radius: 6px;">' +
            '<div style="font-size: 0.58rem; color: #64748b;">P(Loss)</div>' +
            '<div style="font-size: 0.78rem; font-weight: 700; color: ' + mcLossColor + '; font-family: \'JetBrains Mono\', monospace;">' + (mc.probOfLoss * 100).toFixed(1) + '%</div>' +
            '</div>' +
            '<div style="text-align: center; padding: 8px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.04); border-radius: 6px;">' +
            '<div style="font-size: 0.58rem; color: #64748b;">Median Return</div>' +
            '<div style="font-size: 0.78rem; font-weight: 700; color: ' + (mc.medianReturn >= 0 ? '#4ade80' : '#f87171') + '; font-family: \'JetBrains Mono\', monospace;">' + (mc.medianReturn >= 0 ? '+' : '') + mc.medianReturn + '%</div>' +
            '</div>' +
            '<div style="text-align: center; padding: 8px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.04); border-radius: 6px;">' +
            '<div style="font-size: 0.58rem; color: #64748b;">5th Pctl</div>' +
            '<div style="font-size: 0.78rem; font-weight: 700; color: ' + (mc.p5Return >= 0 ? '#4ade80' : '#f87171') + '; font-family: \'JetBrains Mono\', monospace;">' + (mc.p5Return >= 0 ? '+' : '') + mc.p5Return + '%</div>' +
            '</div>' +
            '</div>';

        // ── Rejection Reasons ──
        if (gateResult.rejectionReasons.length > 0) {
            html += '<div style="font-size: 0.62rem; color: #475569; text-transform: uppercase; letter-spacing: 0.08em; margin-top: 16px; margin-bottom: 8px;">REJECTION REASONS</div>';
            gateResult.rejectionReasons.forEach(function (reason) {
                html += '<div style="padding: 7px 12px; margin-bottom: 3px; border-radius: 5px;' +
                    'background: rgba(239,68,68,0.06); border: 1px solid rgba(239,68,68,0.12);' +
                    'font-size: 0.64rem; color: #f87171; line-height: 1.4;">⚠ ' + reason + '</div>';
            });
        }

        html += '</div>'; // close body

        panel.innerHTML = html;
        panel.style.display = 'block';

        // Close handler
        panel.querySelector('#crg-panel-close').addEventListener('click', function () {
            panel.style.display = 'none';
        });
    }

    // ── SELF TEST ──
    function selfTestGate() {
        console.log('=== Capital Readiness Gate — Self Test ===');
        let pass = 0, fail = 0;

        function assert(label, condition) {
            if (condition) { pass++; console.log('  ✅ ' + label); }
            else { fail++; console.error('  ❌ ' + label); }
        }

        // Test 1: Walk-Forward with synthetic equity
        var eq = [];
        for (var i = 0; i < 100; i++) eq.push(100000 + i * 100);
        var wf = runWalkForwardOOS(eq, 5);
        assert('WF: 5 windows created', wf.totalWindows === 5);
        assert('WF: all windows profitable', wf.profitableWindows === 5);
        assert('WF: score > 0', wf.score > 0);

        // Test 2: Walk-Forward with declining equity
        var eqDown = [];
        for (var j = 0; j < 100; j++) eqDown.push(100000 - j * 500);
        var wfDown = runWalkForwardOOS(eqDown, 5);
        assert('WF declining: 0 profitable windows', wfDown.profitableWindows === 0);

        // Test 3: Monte Carlo with all winning trades
        var winTrades = [];
        for (var k = 0; k < 50; k++) winTrades.push({ pnl: 100 });
        var mcWin = runMonteCarlo(winTrades, 500, 100000);
        assert('MC all wins: probOfLoss = 0', mcWin.probOfLoss === 0);
        assert('MC all wins: medianReturn > 0', mcWin.medianReturn > 0);

        // Test 4: Monte Carlo with all losing trades
        var loseTrades = [];
        for (var l = 0; l < 50; l++) loseTrades.push({ pnl: -100 });
        var mcLose = runMonteCarlo(loseTrades, 500, 100000);
        assert('MC all losses: probOfLoss = 1', mcLose.probOfLoss === 1);

        // Test 5: Gate evaluation — good report
        var goodReport = {
            metrics: { maxDrawdown: '-15.00', profitFactor: '1.80', sharpe: '1.20', winRate: '55.0', expectancy: '50' },
            trades: winTrades,
            equityCurve: eq,
            config: { capital: '100000' }
        };
        var gateGood = evaluateCapitalReadiness(goodReport);
        assert('Gate good report: CAPITAL_READY', gateGood.classification === 'CAPITAL_READY');
        assert('Gate good report: 0 rejections', gateGood.rejectionReasons.length === 0);

        // Test 6: Gate evaluation — bad report (too few trades + high DD)
        var badReport = {
            metrics: { maxDrawdown: '-40.00', profitFactor: '0.80', sharpe: '-0.50', winRate: '30.0', expectancy: '-20' },
            trades: [{ pnl: -100 }, { pnl: -50 }, { pnl: 20 }],
            equityCurve: [100000, 99000, 98000],
            config: { capital: '100000' }
        };
        var gateBad = evaluateCapitalReadiness(badReport);
        assert('Gate bad report: RESEARCH_ONLY', gateBad.classification === 'RESEARCH_ONLY');
        assert('Gate bad report: has rejections', gateBad.rejectionReasons.length > 0);

        // Test 7: Determinism — same inputs produce same output
        var gate2 = evaluateCapitalReadiness(goodReport);
        assert('Gate deterministic: same classification', gateGood.classification === gate2.classification);
        assert('Gate deterministic: same MC probOfLoss', gateGood.monteCarlo.probOfLoss === gate2.monteCarlo.probOfLoss);

        console.log('=== Self Test Complete: ' + pass + ' passed, ' + fail + ' failed ===');
        return { pass: pass, fail: fail };
    }

    // ====================================================================
    // EXPOSE PUBLIC API
    // ====================================================================
    window.CapitalReadiness = {
        computeCRS,
        getTier,
        openReadinessPanel,
        renderAllTierBadges,
        // Capital Readiness Gate v1
        evaluateCapitalReadiness,
        runWalkForwardOOS,
        runMonteCarlo,
        renderGateBadge,
        renderGateWarningBanner,
        renderGatePanel,
        selfTestGate,
        GATE_THRESHOLDS
    };

    console.log('CapitalReadiness: CRS v1 + Gate v1 loaded.');

})();
