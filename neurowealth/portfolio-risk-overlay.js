/* ========================================================================
   PORTFOLIO RISK OVERLAY v1 — Safety Autopilot for Paper Portfolios
   Monitors portfolio drawdown, exposure, and strategy health.
   Automatically de-risks / pauses paper deployment when safety limits
   are breached. Works on top of PortfolioManager v1.

   PAPER ONLY. No live trading. No engine changes.
   ======================================================================== */

(function () {
    'use strict';

    const LOG = '[RiskOverlay]';
    const POLICY_KEY = 'pp_portfolio_risk_policy_v1';
    const AUDIT_KEY = 'pp_portfolio_risk_audit_v1';
    const MAX_AUDIT_EVENTS = 200;

    // ====================================================================
    // HELPERS
    // ====================================================================
    function safeParseJSON(str, fallback) {
        try { const v = JSON.parse(str); return v != null ? v : fallback; } catch { return fallback; }
    }
    function isoNow() { return new Date().toISOString(); }
    function fmtPct(v, digits = 1) {
        if (v == null || isNaN(v)) return '0.0%';
        return Number(v).toFixed(digits) + '%';
    }

    // ====================================================================
    // RISK POLICY MODEL
    // ====================================================================
    function createDefaultPolicy(portfolioId) {
        return {
            portfolio_id: portfolioId || '',
            enabled: false,

            dd_limits: {
                warn_dd_pct: 12,
                soft_dd_pct: 18,
                hard_dd_pct: 25
            },

            exposure_limits: {
                max_single_weight_pct: 0.40,
                max_total_enabled_weight: 1.0
            },

            health_limits: {
                min_crs_to_stay_enabled: 30,
                max_auto_pauses_last_n: 2,
                drift_kill_switch: false
            },

            cooldown: {
                pause_minutes: 240,
                reenable_requires_manual: true
            },

            audit_log_enabled: true
        };
    }

    let policy = null;
    let overlayMode = 'NORMAL'; // NORMAL | WARN | DERISK | PAUSED
    let cooldownStartTime = null; // ISO string when PAUSED started
    let slotOverlayState = {};   // slotId -> { disabled_reason, overlay_weight_scale }

    function loadPolicy() {
        const raw = localStorage.getItem(POLICY_KEY);
        policy = safeParseJSON(raw, null);
        if (policy && typeof policy === 'object') {
            // Ensure all fields exist (safe recovery)
            const defaults = createDefaultPolicy();
            policy.dd_limits = Object.assign({}, defaults.dd_limits, policy.dd_limits || {});
            policy.exposure_limits = Object.assign({}, defaults.exposure_limits, policy.exposure_limits || {});
            policy.health_limits = Object.assign({}, defaults.health_limits, policy.health_limits || {});
            policy.cooldown = Object.assign({}, defaults.cooldown, policy.cooldown || {});
            if (typeof policy.enabled !== 'boolean') policy.enabled = false;
            if (typeof policy.audit_log_enabled !== 'boolean') policy.audit_log_enabled = true;
            console.log(LOG, 'Policy loaded, enabled:', policy.enabled);
        } else {
            policy = null;
        }
        return policy;
    }

    function savePolicy() {
        if (!policy) return;
        try {
            localStorage.setItem(POLICY_KEY, JSON.stringify(policy));
        } catch (e) {
            console.error(LOG, 'Policy save failed:', e);
        }
    }

    function getPolicy() { return policy; }

    function ensurePolicy(portfolioId) {
        if (!policy) {
            policy = createDefaultPolicy(portfolioId);
            savePolicy();
        }
        return policy;
    }

    // ====================================================================
    // AUDIT LOG
    // ====================================================================
    let auditLog = [];

    function loadAuditLog() {
        const raw = localStorage.getItem(AUDIT_KEY);
        auditLog = safeParseJSON(raw, []);
        if (!Array.isArray(auditLog)) auditLog = [];
        return auditLog;
    }

    function saveAuditLog() {
        try {
            // Trim to max
            if (auditLog.length > MAX_AUDIT_EVENTS) {
                auditLog = auditLog.slice(auditLog.length - MAX_AUDIT_EVENTS);
            }
            localStorage.setItem(AUDIT_KEY, JSON.stringify(auditLog));
        } catch (e) {
            console.error(LOG, 'Audit log save failed:', e);
        }
    }

    function logEvent(eventType, reason) {
        if (!policy || !policy.audit_log_enabled) return;
        const entry = {
            timestamp: isoNow(),
            event_type: eventType,
            reason: reason || {}
        };
        auditLog.push(entry);
        saveAuditLog();
        console.log(LOG, `AUDIT: ${eventType}`, reason);

        // Capture in Execution View
        if (window.PaperExecution) {
            window.PaperExecution.captureEvent('PORTFOLIO', 'RiskOverlay', eventType, reason);
        }
    }

    function getAuditLog(limit = 20) {
        return auditLog.slice(-limit).reverse();
    }

    // ====================================================================
    // OVERLAY STATE ENGINE — DETERMINISTIC
    // ====================================================================
    function getOverlayMode() { return overlayMode; }
    function getSlotOverlayState(slotId) { return slotOverlayState[slotId] || null; }
    function getCooldownStartTime() { return cooldownStartTime; }

    /**
     * Core overlay tick — evaluate all conditions and update state.
     * Called whenever portfolio data changes.
     * Returns { mode, slotStates, actions[] }
     */
    function evaluateOverlay() {
        const PM = window.PortfolioManager;
        if (!PM || !policy || !policy.enabled) {
            overlayMode = 'NORMAL';
            slotOverlayState = {};
            return { mode: 'NORMAL', slotStates: {}, actions: [] };
        }

        const portfolio = PM.getPortfolio();
        if (!portfolio) {
            overlayMode = 'NORMAL';
            slotOverlayState = {};
            return { mode: 'NORMAL', slotStates: {}, actions: [] };
        }

        const eq = PM.getPortfolioEquity();
        const portfolioDDPct = (eq.portfolioDD || 0) * 100;
        const prevMode = overlayMode;
        const actions = [];

        // Reset slot overlay state
        const newSlotState = {};
        portfolio.holdings.forEach(slot => {
            newSlotState[slot.slot_id] = {
                overlay_weight_scale: 1.0,
                disabled_reason: null,
                status: slot.enabled ? 'ENABLED' : 'DISABLED (manual)'
            };
        });

        // --- Check cooldown expiry ---
        if (overlayMode === 'PAUSED' && cooldownStartTime) {
            const elapsed = (Date.now() - new Date(cooldownStartTime).getTime()) / 60000;
            if (elapsed >= policy.cooldown.pause_minutes && !policy.cooldown.reenable_requires_manual) {
                // Auto-resume after cooldown
                overlayMode = 'NORMAL';
                cooldownStartTime = null;
                actions.push('AUTO_RESUME');
                logEvent('RESUME', { reason: 'cooldown_expired', elapsed_minutes: elapsed.toFixed(1) });
            }
        }

        // --- DD-based overlay (only if not in manual-resume PAUSED state) ---
        if (overlayMode === 'PAUSED' && policy.cooldown.reenable_requires_manual) {
            // Stay paused until manual resume — mark all slots
            portfolio.holdings.forEach(slot => {
                if (slot.enabled) {
                    newSlotState[slot.slot_id].overlay_weight_scale = 0;
                    newSlotState[slot.slot_id].status = 'PAUSED (cooldown)';
                    newSlotState[slot.slot_id].disabled_reason = 'hard_dd_pause';
                }
            });
        } else if (overlayMode !== 'PAUSED') {
            // Evaluate DD thresholds
            if (portfolioDDPct >= policy.dd_limits.hard_dd_pct) {
                // HARD PAUSE
                if (prevMode !== 'PAUSED') {
                    overlayMode = 'PAUSED';
                    cooldownStartTime = isoNow();
                    actions.push('PAUSE_ALL');
                    logEvent('PAUSE_ALL', {
                        dd_pct: portfolioDDPct.toFixed(2),
                        threshold: policy.dd_limits.hard_dd_pct
                    });
                }
                portfolio.holdings.forEach(slot => {
                    if (slot.enabled) {
                        newSlotState[slot.slot_id].overlay_weight_scale = 0;
                        newSlotState[slot.slot_id].status = 'PAUSED (cooldown)';
                        newSlotState[slot.slot_id].disabled_reason = 'hard_dd_pause';
                    }
                });
            } else if (portfolioDDPct >= policy.dd_limits.soft_dd_pct) {
                // DERISK — scale weights to maxTotalEnabled (default 0.50)
                if (prevMode !== 'DERISK') {
                    actions.push('DERISK_ON');
                    logEvent('DERISK_ON', {
                        dd_pct: portfolioDDPct.toFixed(2),
                        threshold: policy.dd_limits.soft_dd_pct,
                        scale_target: 0.50
                    });
                }
                overlayMode = 'DERISK';
                const targetTotal = 0.50;
                const enabledSlots = portfolio.holdings.filter(s => s.enabled && s.target_weight > 0);
                const currentTotal = enabledSlots.reduce((s, sl) => s + sl.target_weight, 0);
                const scaleFactor = currentTotal > 0 ? Math.min(1, targetTotal / currentTotal) : 1;

                portfolio.holdings.forEach(slot => {
                    if (slot.enabled && slot.target_weight > 0) {
                        newSlotState[slot.slot_id].overlay_weight_scale = scaleFactor;
                        newSlotState[slot.slot_id].status = 'ENABLED';
                    }
                });
            } else if (portfolioDDPct >= policy.dd_limits.warn_dd_pct) {
                // WARN — banner only
                if (prevMode !== 'WARN') {
                    actions.push('WARN');
                    logEvent('WARN', {
                        dd_pct: portfolioDDPct.toFixed(2),
                        threshold: policy.dd_limits.warn_dd_pct
                    });
                }
                overlayMode = 'WARN';
            } else {
                // NORMAL
                if (prevMode === 'DERISK') {
                    actions.push('DERISK_OFF');
                    logEvent('DERISK_OFF', {
                        dd_pct: portfolioDDPct.toFixed(2),
                        reason: 'dd_recovered'
                    });
                }
                overlayMode = 'NORMAL';
            }
        }

        // --- Health-based slot disabling ---
        if (overlayMode !== 'PAUSED') {
            portfolio.holdings.forEach(slot => {
                if (!slot.enabled) return;

                // CRS check
                if (slot.crs_snapshot < policy.health_limits.min_crs_to_stay_enabled) {
                    newSlotState[slot.slot_id].disabled_reason = 'low_crs';
                    newSlotState[slot.slot_id].overlay_weight_scale = 0;
                    newSlotState[slot.slot_id].status = 'DISABLED (policy)';
                    if (!slotOverlayState[slot.slot_id] || slotOverlayState[slot.slot_id].disabled_reason !== 'low_crs') {
                        actions.push('SLOT_DISABLED');
                        logEvent('SLOT_DISABLED', {
                            slot_id: slot.slot_id,
                            label: slot.label,
                            reason: 'crs_below_min',
                            crs: slot.crs_snapshot,
                            threshold: policy.health_limits.min_crs_to_stay_enabled
                        });
                    }
                }

                // Auto-pause count check (using audit log)
                const slotPauseEvents = auditLog.filter(e =>
                    e.event_type === 'SLOT_DISABLED' &&
                    e.reason && e.reason.slot_id === slot.slot_id
                );
                const recentPauses = slotPauseEvents.slice(-10);
                if (recentPauses.length >= policy.health_limits.max_auto_pauses_last_n &&
                    newSlotState[slot.slot_id].disabled_reason === null) {
                    newSlotState[slot.slot_id].disabled_reason = 'excessive_auto_pauses';
                    newSlotState[slot.slot_id].overlay_weight_scale = 0;
                    newSlotState[slot.slot_id].status = 'DISABLED (policy)';
                    if (!slotOverlayState[slot.slot_id] || slotOverlayState[slot.slot_id].disabled_reason !== 'excessive_auto_pauses') {
                        actions.push('SLOT_DISABLED');
                        logEvent('SLOT_DISABLED', {
                            slot_id: slot.slot_id,
                            label: slot.label,
                            reason: 'excessive_auto_pauses',
                            pause_count: recentPauses.length,
                            threshold: policy.health_limits.max_auto_pauses_last_n
                        });
                    }
                }

                // Drift kill switch (check alignment drift from strategy health data)
                if (policy.health_limits.drift_kill_switch && newSlotState[slot.slot_id].disabled_reason === null) {
                    const SH = window.StrategyHealth;
                    if (SH && typeof SH.getHealthClassification === 'function') {
                        try {
                            const health = SH.getHealthClassification(slot.strategy_id);
                            if (health && health.status === 'UNSTABLE') {
                                newSlotState[slot.slot_id].disabled_reason = 'drift_kill_switch';
                                newSlotState[slot.slot_id].overlay_weight_scale = 0;
                                newSlotState[slot.slot_id].status = 'DISABLED (policy)';
                                if (!slotOverlayState[slot.slot_id] || slotOverlayState[slot.slot_id].disabled_reason !== 'drift_kill_switch') {
                                    actions.push('SLOT_DISABLED');
                                    logEvent('SLOT_DISABLED', {
                                        slot_id: slot.slot_id,
                                        label: slot.label,
                                        reason: 'drift_kill_switch',
                                        health_status: 'UNSTABLE'
                                    });
                                }
                            }
                        } catch (e) { /* StrategyHealth not available — skip */ }
                    }
                }
            });
        }

        // --- Exposure limit enforcement ---
        if (overlayMode !== 'PAUSED') {
            portfolio.holdings.forEach(slot => {
                if (!slot.enabled) return;
                const state = newSlotState[slot.slot_id];
                if (state.disabled_reason) return; // already disabled
                const effectiveWeight = slot.target_weight * state.overlay_weight_scale;
                if (effectiveWeight > policy.exposure_limits.max_single_weight_pct) {
                    state.overlay_weight_scale = policy.exposure_limits.max_single_weight_pct / slot.target_weight;
                }
            });
        }

        slotOverlayState = newSlotState;
        return { mode: overlayMode, slotStates: newSlotState, actions };
    }

    /**
     * Get effective weight for a slot (base weight × overlay scale).
     */
    function getEffectiveWeight(slot) {
        if (!policy || !policy.enabled) return slot.target_weight;
        const state = slotOverlayState[slot.slot_id];
        if (!state) return slot.target_weight;
        return slot.target_weight * state.overlay_weight_scale;
    }

    /**
     * Manual resume from PAUSED state.
     */
    function manualResume() {
        if (overlayMode !== 'PAUSED') return false;
        overlayMode = 'NORMAL';
        cooldownStartTime = null;
        slotOverlayState = {};
        logEvent('RESUME', { reason: 'manual_resume' });
        return true;
    }

    // ====================================================================
    // UI — RISK OVERLAY PANEL (injected into Portfolio Modal)
    // ====================================================================
    let uiInjected = false;
    let uiRefreshInterval = null;

    function getOverlayModeColor(mode) {
        switch (mode) {
            case 'NORMAL': return { color: '#4ade80', bg: 'rgba(74, 222, 128, 0.1)', border: 'rgba(74, 222, 128, 0.3)' };
            case 'WARN': return { color: '#fbbf24', bg: 'rgba(251, 191, 36, 0.1)', border: 'rgba(251, 191, 36, 0.3)' };
            case 'DERISK': return { color: '#f97316', bg: 'rgba(249, 115, 22, 0.1)', border: 'rgba(249, 115, 22, 0.3)' };
            case 'PAUSED': return { color: '#f87171', bg: 'rgba(248, 113, 113, 0.1)', border: 'rgba(248, 113, 113, 0.3)' };
            default: return { color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.1)', border: 'rgba(148, 163, 184, 0.3)' };
        }
    }

    function getSlotStatusColor(status) {
        if (status.startsWith('ENABLED')) return '#4ade80';
        if (status.startsWith('DISABLED (policy)')) return '#f97316';
        if (status.startsWith('DISABLED (manual)')) return '#94a3b8';
        if (status.startsWith('PAUSED')) return '#f87171';
        return '#94a3b8';
    }

    function buildOverlayPanelHTML() {
        return `
<div class="pf-section" id="pf-risk-overlay-section" style="border-top: 1px solid rgba(99,102,241,0.15); margin-top: 8px;">
  <div class="pf-section-header" style="display:flex;justify-content:space-between;align-items:center;">
    <span class="pf-section-title" style="display:flex;align-items:center;gap:8px;">
      🛡️ RISK OVERLAY
      <span id="pro-mode-badge" style="display:inline-block;padding:2px 10px;border-radius:99px;font-size:0.7rem;font-weight:700;letter-spacing:0.5px;"></span>
    </span>
    <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:0.8rem;color:#cbd5e1;">
      <input type="checkbox" id="pro-enabled-toggle" style="accent-color:#818cf8;" />
      Enabled
    </label>
  </div>

  <!-- Overlay Content (hidden when disabled) -->
  <div id="pro-content" style="display:none;">

    <!-- Alert Banner -->
    <div id="pro-alert-banner" style="display:none;padding:10px 14px;border-radius:8px;font-size:0.8rem;font-weight:600;margin-bottom:12px;display:flex;align-items:center;gap:8px;"></div>

    <!-- Thresholds Grid -->
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px;">
      <div class="pro-field">
        <label class="pro-field-label">Warn DD %</label>
        <input type="number" id="pro-warn-dd" class="pro-field-input" min="1" max="100" step="1" />
      </div>
      <div class="pro-field">
        <label class="pro-field-label">Soft DD % (De-risk)</label>
        <input type="number" id="pro-soft-dd" class="pro-field-input" min="1" max="100" step="1" />
      </div>
      <div class="pro-field">
        <label class="pro-field-label">Hard DD % (Pause)</label>
        <input type="number" id="pro-hard-dd" class="pro-field-input" min="1" max="100" step="1" />
      </div>
    </div>

    <!-- Health & Cooldown -->
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px;">
      <div class="pro-field">
        <label class="pro-field-label">Min CRS Floor</label>
        <input type="number" id="pro-min-crs" class="pro-field-input" min="0" max="100" step="5" />
      </div>
      <div class="pro-field">
        <label class="pro-field-label">Cooldown (min)</label>
        <input type="number" id="pro-cooldown-min" class="pro-field-input" min="1" max="10080" step="10" />
      </div>
      <div class="pro-field">
        <label class="pro-field-label" style="font-size:0.65rem;">Manual Resume?</label>
        <label style="display:flex;align-items:center;gap:4px;font-size:0.75rem;color:#cbd5e1;margin-top:4px;">
          <input type="checkbox" id="pro-manual-resume" style="accent-color:#818cf8;" /> Yes
        </label>
      </div>
    </div>

    <!-- Manual Resume Button -->
    <div id="pro-resume-area" style="display:none;margin-bottom:12px;">
      <button id="pro-btn-resume" class="pf-btn pf-btn-primary" style="width:100%;background:linear-gradient(135deg,#f97316,#f87171);border:none;">
        ⏯ Manual Resume — Exit Pause Mode
      </button>
      <div id="pro-cooldown-info" style="font-size:0.72rem;color:#94a3b8;margin-top:6px;text-align:center;"></div>
    </div>

    <!-- Per-Slot Status Badges -->
    <div style="margin-bottom:14px;">
      <div style="font-size:0.72rem;text-transform:uppercase;color:#64748b;font-weight:600;margin-bottom:6px;letter-spacing:0.5px;">SLOT OVERLAY STATUS</div>
      <div id="pro-slot-badges" style="display:flex;flex-wrap:wrap;gap:6px;"></div>
    </div>

    <!-- Audit Log -->
    <div>
      <div style="font-size:0.72rem;text-transform:uppercase;color:#64748b;font-weight:600;margin-bottom:6px;letter-spacing:0.5px;">AUDIT LOG (LAST 20)</div>
      <div id="pro-audit-list" style="max-height:180px;overflow-y:auto;font-size:0.72rem;font-family:'JetBrains Mono',monospace;color:#94a3b8;border:1px solid rgba(226,232,240,0.06);border-radius:6px;background:rgba(15,23,42,0.3);"></div>
    </div>

  </div>
</div>`;
    }

    function injectStyles() {
        if (document.getElementById('pro-styles')) return;
        const style = document.createElement('style');
        style.id = 'pro-styles';
        style.textContent = `
.pro-field { display:flex; flex-direction:column; gap:3px; }
.pro-field-label { font-size:0.68rem; text-transform:uppercase; color:#64748b; font-weight:600; letter-spacing:0.3px; }
.pro-field-input {
  background:rgba(15,23,42,0.6); border:1px solid rgba(226,232,240,0.1);
  border-radius:6px; padding:6px 8px; color:#e2e8f0; font-size:0.82rem;
  font-family:'Inter',sans-serif; outline:none; transition:border-color 0.2s;
}
.pro-field-input:focus { border-color:rgba(99,102,241,0.5); }
.pro-slot-badge {
  display:inline-flex; align-items:center; gap:4px; padding:3px 10px;
  border-radius:99px; font-size:0.68rem; font-weight:600; letter-spacing:0.3px;
  border:1px solid rgba(226,232,240,0.1);
}
.pro-audit-entry {
  padding:5px 10px; border-bottom:1px solid rgba(226,232,240,0.04);
  display:flex; justify-content:space-between; gap:8px;
}
.pro-audit-entry:last-child { border-bottom:none; }
.pro-audit-type { font-weight:700; flex-shrink:0; }
.pro-audit-time { color:#475569; flex-shrink:0; }
.pro-audit-detail { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
`;
        document.head.appendChild(style);
    }

    function injectOverlayPanel() {
        if (uiInjected) return;

        const PM = window.PortfolioManager;
        if (!PM) return;

        injectStyles();

        // Wait for portfolio modal to exist
        const waitForModal = () => {
            const overviewPanel = document.getElementById('pf-overview-panel');
            if (!overviewPanel) {
                setTimeout(waitForModal, 300);
                return;
            }

            // Insert after the contributions section (last pf-section in overview)
            const sections = overviewPanel.querySelectorAll('.pf-section');
            const lastSection = sections[sections.length - 1];
            if (!lastSection || document.getElementById('pf-risk-overlay-section')) {
                uiInjected = true;
                return;
            }

            const wrapper = document.createElement('div');
            wrapper.innerHTML = buildOverlayPanelHTML();
            const panel = wrapper.firstElementChild;
            lastSection.parentNode.insertBefore(panel, lastSection.nextSibling);

            attachOverlayListeners();
            uiInjected = true;
            refreshOverlayUI();
            console.log(LOG, 'UI panel injected');
        };

        waitForModal();
    }

    function attachOverlayListeners() {
        const toggle = document.getElementById('pro-enabled-toggle');
        if (toggle) {
            toggle.addEventListener('change', (e) => {
                const PM = window.PortfolioManager;
                const portfolio = PM ? PM.getPortfolio() : null;
                if (!portfolio) return;
                ensurePolicy(portfolio.portfolio_id);
                policy.enabled = e.target.checked;
                savePolicy();
                if (policy.enabled) {
                    evaluateOverlay();
                } else {
                    overlayMode = 'NORMAL';
                    slotOverlayState = {};
                }
                refreshOverlayUI();
            });
        }

        // Threshold inputs
        ['pro-warn-dd', 'pro-soft-dd', 'pro-hard-dd', 'pro-min-crs', 'pro-cooldown-min'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('change', () => {
                    if (!policy) return;
                    policy.dd_limits.warn_dd_pct = parseFloat(document.getElementById('pro-warn-dd').value) || 12;
                    policy.dd_limits.soft_dd_pct = parseFloat(document.getElementById('pro-soft-dd').value) || 18;
                    policy.dd_limits.hard_dd_pct = parseFloat(document.getElementById('pro-hard-dd').value) || 25;
                    policy.health_limits.min_crs_to_stay_enabled = parseFloat(document.getElementById('pro-min-crs').value) || 30;
                    policy.cooldown.pause_minutes = parseFloat(document.getElementById('pro-cooldown-min').value) || 240;
                    savePolicy();
                    evaluateOverlay();
                    refreshOverlayUI();
                });
            }
        });

        const manualCb = document.getElementById('pro-manual-resume');
        if (manualCb) {
            manualCb.addEventListener('change', (e) => {
                if (!policy) return;
                policy.cooldown.reenable_requires_manual = e.target.checked;
                savePolicy();
            });
        }

        const resumeBtn = document.getElementById('pro-btn-resume');
        if (resumeBtn) {
            resumeBtn.addEventListener('click', () => {
                manualResume();
                evaluateOverlay();
                refreshOverlayUI();
            });
        }
    }

    function refreshOverlayUI() {
        const PM = window.PortfolioManager;
        const portfolio = PM ? PM.getPortfolio() : null;

        const toggle = document.getElementById('pro-enabled-toggle');
        const content = document.getElementById('pro-content');
        const modeBadge = document.getElementById('pro-mode-badge');

        if (!toggle || !content || !modeBadge) return;

        if (!portfolio) {
            content.style.display = 'none';
            return;
        }

        ensurePolicy(portfolio.portfolio_id);
        toggle.checked = policy.enabled;

        if (!policy.enabled) {
            content.style.display = 'none';
            modeBadge.textContent = 'OFF';
            modeBadge.style.cssText = 'display:inline-block;padding:2px 10px;border-radius:99px;font-size:0.7rem;font-weight:700;letter-spacing:0.5px;color:#94a3b8;background:rgba(148,163,184,0.1);border:1px solid rgba(148,163,184,0.2);';
            return;
        }

        content.style.display = 'block';

        // Mode badge
        const mc = getOverlayModeColor(overlayMode);
        modeBadge.textContent = overlayMode;
        modeBadge.style.cssText = `display:inline-block;padding:2px 10px;border-radius:99px;font-size:0.7rem;font-weight:700;letter-spacing:0.5px;color:${mc.color};background:${mc.bg};border:1px solid ${mc.border};`;

        // Populate inputs
        document.getElementById('pro-warn-dd').value = policy.dd_limits.warn_dd_pct;
        document.getElementById('pro-soft-dd').value = policy.dd_limits.soft_dd_pct;
        document.getElementById('pro-hard-dd').value = policy.dd_limits.hard_dd_pct;
        document.getElementById('pro-min-crs').value = policy.health_limits.min_crs_to_stay_enabled;
        document.getElementById('pro-cooldown-min').value = policy.cooldown.pause_minutes;
        document.getElementById('pro-manual-resume').checked = policy.cooldown.reenable_requires_manual;

        // Alert banner
        const banner = document.getElementById('pro-alert-banner');
        if (overlayMode === 'WARN') {
            const eq = PM.getPortfolioEquity();
            banner.style.display = 'flex';
            banner.style.background = 'rgba(251, 191, 36, 0.1)';
            banner.style.border = '1px solid rgba(251, 191, 36, 0.3)';
            banner.style.color = '#fbbf24';
            banner.innerHTML = `⚠ Portfolio DD at ${fmtPct((eq.portfolioDD || 0) * 100)} — approaching de-risk threshold (${policy.dd_limits.soft_dd_pct}%)`;
        } else if (overlayMode === 'DERISK') {
            banner.style.display = 'flex';
            banner.style.background = 'rgba(249, 115, 22, 0.1)';
            banner.style.border = '1px solid rgba(249, 115, 22, 0.3)';
            banner.style.color = '#f97316';
            banner.innerHTML = `🔻 DE-RISK ACTIVE — Weights scaled to 50%. Threshold: ${policy.dd_limits.soft_dd_pct}%`;
        } else if (overlayMode === 'PAUSED') {
            banner.style.display = 'flex';
            banner.style.background = 'rgba(248, 113, 113, 0.1)';
            banner.style.border = '1px solid rgba(248, 113, 113, 0.3)';
            banner.style.color = '#f87171';
            banner.innerHTML = `⛔ ALL PAUSED — Hard DD limit breached (${policy.dd_limits.hard_dd_pct}%). ${policy.cooldown.reenable_requires_manual ? 'Manual resume required.' : 'Auto-resume after cooldown.'}`;
        } else {
            banner.style.display = 'none';
        }

        // Resume area
        const resumeArea = document.getElementById('pro-resume-area');
        if (overlayMode === 'PAUSED') {
            resumeArea.style.display = 'block';
            if (cooldownStartTime) {
                const elapsed = ((Date.now() - new Date(cooldownStartTime).getTime()) / 60000).toFixed(0);
                document.getElementById('pro-cooldown-info').textContent =
                    `Paused for ${elapsed} min / ${policy.cooldown.pause_minutes} min cooldown`;
            }
        } else {
            resumeArea.style.display = 'none';
        }

        // Slot badges
        const badgesContainer = document.getElementById('pro-slot-badges');
        if (badgesContainer) {
            let badgesHTML = '';
            portfolio.holdings.forEach(slot => {
                const state = slotOverlayState[slot.slot_id];
                const status = state ? state.status : (slot.enabled ? 'ENABLED' : 'DISABLED (manual)');
                const statusColor = getSlotStatusColor(status);
                const label = slot.label || slot.strategy_id || slot.slot_id.substring(0, 8);
                badgesHTML += `<span class="pro-slot-badge" style="color:${statusColor};border-color:${statusColor}30;background:${statusColor}10;">
                    <span style="width:6px;height:6px;border-radius:50%;background:${statusColor};"></span>
                    ${escHtml(label)}: ${status}
                </span>`;
            });
            badgesContainer.innerHTML = badgesHTML;
        }

        // Audit log
        const auditList = document.getElementById('pro-audit-list');
        if (auditList) {
            const events = getAuditLog(20);
            if (events.length === 0) {
                auditList.innerHTML = '<div style="padding:12px;text-align:center;color:#475569;">No audit events yet.</div>';
            } else {
                let eventsHTML = '';
                events.forEach(e => {
                    const time = new Date(e.timestamp).toLocaleString();
                    const typeColor = getAuditTypeColor(e.event_type);
                    const detail = formatAuditDetail(e.reason);
                    eventsHTML += `<div class="pro-audit-entry">
                        <span class="pro-audit-type" style="color:${typeColor};">${e.event_type}</span>
                        <span class="pro-audit-detail">${escHtml(detail)}</span>
                        <span class="pro-audit-time">${time}</span>
                    </div>`;
                });
                auditList.innerHTML = eventsHTML;
            }
        }
    }

    function getAuditTypeColor(type) {
        switch (type) {
            case 'WARN': return '#fbbf24';
            case 'DERISK_ON': return '#f97316';
            case 'DERISK_OFF': return '#4ade80';
            case 'PAUSE_ALL': return '#f87171';
            case 'SLOT_DISABLED': return '#fb923c';
            case 'RESUME': return '#34d399';
            default: return '#94a3b8';
        }
    }

    function formatAuditDetail(reason) {
        if (!reason || typeof reason !== 'object') return '';
        const parts = [];
        if (reason.dd_pct) parts.push(`DD: ${reason.dd_pct}%`);
        if (reason.threshold) parts.push(`Threshold: ${reason.threshold}%`);
        if (reason.label) parts.push(reason.label);
        if (reason.reason) parts.push(reason.reason);
        if (reason.crs != null) parts.push(`CRS: ${reason.crs}`);
        return parts.join(' | ');
    }

    function escHtml(s) {
        const d = document.createElement('div');
        d.textContent = s || '';
        return d.innerHTML;
    }

    // ====================================================================
    // INTEGRATION — Observe Portfolio Modal visibility
    // ====================================================================
    // ====================================================================
    // INTEGRATION — Observe Portfolio Modal visibility
    // ====================================================================
    function watchPortfolioModal() {
        // Use MutationObserver on document.body to detect when the portfolio
        // modal overlay is first added to the DOM.
        const setupVisibilityObserver = (overlay) => {
            const observer = new MutationObserver(() => {
                const isVisible = overlay.style.display === 'flex';
                if (isVisible) {
                    // Modal just became visible — inject our panel if needed
                    setTimeout(() => {
                        if (!document.getElementById('pf-risk-overlay-section')) {
                            uiInjected = false; // force re-inject
                        }
                        injectOverlayPanel();
                        if (policy && policy.enabled) {
                            evaluateOverlay();
                        }
                        refreshOverlayUI();
                    }, 50); // Small delay to let modal internal setup finish
                }
            });

            observer.observe(overlay, { attributes: true, attributeFilter: ['style'] });
            console.log(LOG, 'Attached visibility observer to modal overlay');

            // If it's already visible (rare but possible during init), trigger once
            if (overlay.style.display === 'flex') {
                injectOverlayPanel();
                refreshOverlayUI();
            }
        };

        const initialOverlay = document.getElementById('pf-modal-overlay');
        if (initialOverlay) {
            setupVisibilityObserver(initialOverlay);
        }

        // Also watch for when it gets added to the body
        const bodyObserver = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (node.id === 'pf-modal-overlay') {
                        setupVisibilityObserver(node);
                        // bodyObserver.disconnect(); // Keep watching in case it's removed/re-added
                    }
                }
            }
        });

        bodyObserver.observe(document.body, { childList: true, subtree: false });
        console.log(LOG, 'Watching body for portfolio modal addition');
    }

    // ====================================================================
    // SELF-TEST
    // ====================================================================
    function selfTest() {
        console.log('=== PORTFOLIO RISK OVERLAY v1 — SELF-TEST ===');
        let pass = 0, fail = 0;
        const assert = (cond, msg) => {
            if (cond) { console.log('✅ PASS:', msg); pass++; }
            else { console.error('❌ FAIL:', msg); fail++; }
        };

        // Backup state
        const backupPolicy = policy ? JSON.parse(JSON.stringify(policy)) : null;
        const backupMode = overlayMode;
        const backupCooldown = cooldownStartTime;
        const backupSlotState = JSON.parse(JSON.stringify(slotOverlayState));
        const backupAudit = [...auditLog];
        const backupPolicyStorage = localStorage.getItem(POLICY_KEY);
        const backupAuditStorage = localStorage.getItem(AUDIT_KEY);

        try {
            // 1. Default policy creation
            const p = createDefaultPolicy('test-pf-1');
            assert(p.portfolio_id === 'test-pf-1', '1. Default policy has correct portfolio_id');
            assert(p.enabled === false, '1b. Default policy disabled');
            assert(p.dd_limits.warn_dd_pct === 12, '1c. Default warn DD = 12%');
            assert(p.dd_limits.soft_dd_pct === 18, '1d. Default soft DD = 18%');
            assert(p.dd_limits.hard_dd_pct === 25, '1e. Default hard DD = 25%');

            // 2. Policy persistence round-trip
            policy = createDefaultPolicy('test-pf-2');
            policy.enabled = true;
            policy.dd_limits.warn_dd_pct = 15;
            savePolicy();
            const stored = safeParseJSON(localStorage.getItem(POLICY_KEY), null);
            assert(stored && stored.dd_limits.warn_dd_pct === 15, '2. Policy persisted and retrieved');

            // 3. Overlay modes — NORMAL (no portfolio manager available for DD)
            policy = createDefaultPolicy('test-pf-3');
            policy.enabled = true;
            overlayMode = 'NORMAL';
            slotOverlayState = {};
            auditLog = [];
            // Cannot fully test evaluateOverlay without mocking PortfolioManager,
            // but we test the mode logic directly
            assert(overlayMode === 'NORMAL', '3. Initial mode is NORMAL');

            // 4. Manual resume
            overlayMode = 'PAUSED';
            cooldownStartTime = isoNow();
            const resumed = manualResume();
            assert(resumed === true, '4a. Manual resume returns true when PAUSED');
            assert(overlayMode === 'NORMAL', '4b. Mode returns to NORMAL after resume');
            assert(cooldownStartTime === null, '4c. Cooldown cleared after resume');

            // 5. Manual resume when not paused
            overlayMode = 'WARN';
            const notResumed = manualResume();
            assert(notResumed === false, '5. Manual resume returns false when not PAUSED');

            // 6. Audit log recording
            policy.audit_log_enabled = true;
            auditLog = [];
            logEvent('WARN', { dd_pct: '14.5', threshold: 12 });
            logEvent('DERISK_ON', { dd_pct: '19.2', threshold: 18 });
            assert(auditLog.length === 2, '6a. Audit log has 2 entries');
            assert(auditLog[0].event_type === 'WARN', '6b. First event is WARN');
            assert(auditLog[1].event_type === 'DERISK_ON', '6c. Second event is DERISK_ON');

            // 7. Audit log retrieval
            const recent = getAuditLog(1);
            assert(recent.length === 1, '7a. getAuditLog(1) returns 1 entry');
            assert(recent[0].event_type === 'DERISK_ON', '7b. Most recent event returned first');

            // 8. Effective weight calculation
            policy.enabled = true;
            slotOverlayState = {
                'slot-a': { overlay_weight_scale: 0.5, disabled_reason: null, status: 'ENABLED' },
                'slot-b': { overlay_weight_scale: 0, disabled_reason: 'low_crs', status: 'DISABLED (policy)' }
            };
            const ewA = getEffectiveWeight({ slot_id: 'slot-a', target_weight: 0.60 });
            assert(Math.abs(ewA - 0.30) < 0.001, '8a. Effective weight = 0.60 × 0.5 = 0.30');
            const ewB = getEffectiveWeight({ slot_id: 'slot-b', target_weight: 0.40 });
            assert(ewB === 0, '8b. Disabled slot effective weight = 0');

            // 9. Effective weight when overlay disabled
            policy.enabled = false;
            const ewC = getEffectiveWeight({ slot_id: 'slot-a', target_weight: 0.60 });
            assert(ewC === 0.60, '9. Overlay disabled returns base weight');

            // 10. Audit log FIFO trimming
            policy.enabled = true;
            policy.audit_log_enabled = true;
            auditLog = [];
            for (let i = 0; i < 210; i++) {
                auditLog.push({ timestamp: isoNow(), event_type: 'TEST', reason: { i } });
            }
            saveAuditLog();
            const trimmed = safeParseJSON(localStorage.getItem(AUDIT_KEY), []);
            assert(trimmed.length <= MAX_AUDIT_EVENTS, '10. Audit log trimmed to max ' + MAX_AUDIT_EVENTS);

            // 11. Safe recovery from corrupt localStorage
            localStorage.setItem(POLICY_KEY, 'NOT VALID JSON {{{');
            const recovered = loadPolicy();
            assert(recovered === null, '11. Corrupt policy returns null (safe recovery)');

            // 12. Safe recovery fills missing fields
            localStorage.setItem(POLICY_KEY, JSON.stringify({ enabled: true }));
            const partial = loadPolicy();
            assert(partial !== null, '12a. Partial policy recovered');
            assert(partial.dd_limits.warn_dd_pct === 12, '12b. Missing dd_limits filled with defaults');
            assert(partial.cooldown.pause_minutes === 240, '12c. Missing cooldown filled with defaults');

        } catch (e) {
            console.error('Test exception:', e);
            fail++;
        }

        // Restore state
        policy = backupPolicy;
        overlayMode = backupMode;
        cooldownStartTime = backupCooldown;
        slotOverlayState = backupSlotState;
        auditLog = backupAudit;
        if (backupPolicyStorage) localStorage.setItem(POLICY_KEY, backupPolicyStorage);
        else localStorage.removeItem(POLICY_KEY);
        if (backupAuditStorage) localStorage.setItem(AUDIT_KEY, backupAuditStorage);
        else localStorage.removeItem(AUDIT_KEY);

        console.log(`=== SELF-TEST COMPLETE: ${pass} PASS / ${fail} FAIL ===`);
        return fail === 0 ? 'ALL PASS' : 'SOME FAILED';
    }

    // ====================================================================
    // INITIALIZATION
    // ====================================================================
    function init() {
        loadPolicy();
        loadAuditLog();
        watchPortfolioModal();

        console.log(LOG, 'v1 loaded', policy ? `— policy for "${policy.portfolio_id}", enabled: ${policy.enabled}` : '— no policy');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // ====================================================================
    // PUBLIC API
    // ====================================================================
    window.PortfolioRiskOverlay = {
        getPolicy,
        ensurePolicy,
        evaluateOverlay,
        getOverlayMode,
        getSlotOverlayState,
        getEffectiveWeight,
        manualResume,
        getAuditLog,
        selfTest
    };

})();
