/* ========================================================================
   PAPER EXECUTION v1 — Runtime State + Event Ring Buffer
   Captures real-time state of paper strategies and portfolio events.
   Provides the "Execution" console UI for the Portfolio Modal.
   ======================================================================== */

(function () {
    'use strict';

    const STATE_KEY = 'pp_paper_runtime_v1';
    const EVENT_KEY = 'pp_paper_events_v1';
    const MAX_EVENTS = 500;

    let runtimeStore = {}; // strategy_id -> PerStrategyRuntime
    let eventBuffer = [];

    // Global Execution Store for Console
    let ExecutionStore = {
        feedState: 'DISCONNECTED', // CONNECTED | DELAYED | DISCONNECTED
        engineState: 'STOPPED',    // RUNNING | PAUSED | STOPPED | EMERGENCY_STOP
        lastTickTime: null,
        tickIntervalMs: 45000,     // Default 45s from paper-trading
        latency: 0,
        killSwitched: false,       // Operator emergency stop flag
        tickCountAtKill: null,     // Snapshot for verification
        tradeCountAtKill: null,    // Snapshot for verification
        queueLenAtKill: null,      // Snapshot for verification

        // Hygiene & Stability Signals v1.1
        hygiene: {
            disconnectCount: 0,
            restartCount: 0,
            errorCount: 0,
            staleTickCount: 0
        },
        stability: {
            rollingDrawdown: 0,
            rollingLossStreak: 0,
            rollingEquityDrift: 0,
            liveSlippageDeviation: 0
        }
    };

    // portfolio summary cache
    let currentSummary = {
        equity: 0, openPnl: 0, realizedPnl: 0, currentDrawdown: 0, exposure: 0, activeCount: 0, pendingCount: 0
    };

    let engineInterface = null;
    let _liveAdapter = null; // LiveExecutionAdapter instance (created on Resume)

    // Reset-generation counter: incremented on every hard reset.
    // Auto-refresh closures capture this at creation time and bail if it changes,
    // preventing stale closures from rehydrating old state after a reset.
    let _resetGeneration = 0;

    // ====================================================================
    // CORE API
    // ====================================================================
    const PaperExecution = {
        init() {
            this.load();
            console.log('[PaperExecution] Initialized');
        },

        registerEngine(methods) {
            engineInterface = methods;
            console.log('[PaperExecution] Engine methods registered');
        },

        load() {
            try {
                const rawState = localStorage.getItem(STATE_KEY);
                if (rawState) runtimeStore = JSON.parse(rawState);

                const rawEvents = localStorage.getItem(EVENT_KEY);
                if (rawEvents) eventBuffer = JSON.parse(rawEvents);

                ExecutionStore.killSwitched = localStorage.getItem('pp_kill_switch_v1') === 'true';
            } catch (e) {
                console.warn('[PaperExecution] Load failed', e);
            }
        },

        save() {
            try {
                localStorage.setItem(STATE_KEY, JSON.stringify(runtimeStore));
                localStorage.setItem(EVENT_KEY, JSON.stringify(eventBuffer));
                localStorage.setItem('pp_kill_switch_v1', ExecutionStore.killSwitched);
            } catch (e) {
                console.warn('[PaperExecution] Save failed', e);
            }
        },

        /**
         * Capture a global or strategy-level event.
         */
        captureEvent(scope, label, type, detail) {
            const event = {
                id: 'evt_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
                time: new Date().toISOString(),
                scope: scope || 'PORTFOLIO', // PORTFOLIO | STRATEGY | SYSTEM
                label: label || 'System',
                type: type, // ENTRY | EXIT | STOP | PAUSE | RESUME | ERROR | SYSTEM ...
                detail: detail || {}
            };

            // Track errors
            if (type === 'ERROR' || (detail && detail.severity === 'CRITICAL')) {
                ExecutionStore.hygiene.errorCount++;
            }

            eventBuffer.push(event);
            if (eventBuffer.length > MAX_EVENTS) eventBuffer.shift();
            this.save();

            // Refresh UI if visible
            this.refreshUIIfVisible();
        },

        /**
         * Update the runtime state for a specific strategy slot.
         */
        updateStrategyState(slotId, update) {
            if (!runtimeStore[slotId]) {
                runtimeStore[slotId] = {
                    strategy_id: null,
                    version_id: null,
                    label: 'Unknown',
                    enabled: true,
                    asset: 'Unknown',
                    timeframe: '1d',
                    overlay_state: 'NORMAL',
                    position: { in_position: false, side: 'NONE', entry_time: null, entry_price: 0, size_units: 0, notional: 0, unrealized_pnl: 0, unrealized_pnl_pct: 0 },
                    pending: { has_pending_entry: false, has_pending_exit: false, reason: '', scheduled_time: null },
                    last_action: { type: 'NONE', time: null, price: 0, note: '' }
                };
            }
            // Deep merge position and pending if provided
            if (update.position) Object.assign(runtimeStore[slotId].position, update.position);
            if (update.pending) Object.assign(runtimeStore[slotId].pending, update.pending);
            if (update.last_action) Object.assign(runtimeStore[slotId].last_action, update.last_action);

            // Merge top level fields
            const topLevel = { ...update };
            delete topLevel.position;
            delete topLevel.pending;
            delete topLevel.last_action;
            Object.assign(runtimeStore[slotId], topLevel);

            this.save();
            this.refreshUIIfVisible();
        },

        getEvents() {
            return eventBuffer;
        },

        getRuntimeStore() {
            return runtimeStore;
        },

        // --- Console Control API --- //
        isKilled() {
            return ExecutionStore.killSwitched || ExecutionStore.engineState === 'EMERGENCY_STOP';
        },

        isPaused() {
            return ExecutionStore.engineState === 'PAUSED';
        },

        isExecutionAllowed() {
            return ExecutionStore.engineState === 'RUNNING' && !ExecutionStore.killSwitched;
        },

        /**
         * Get Live Signals for Capital Readiness Gate v1.1
         */
        getLiveSignals() {
            return {
                killSwitched: ExecutionStore.killSwitched,
                hygiene: { ...ExecutionStore.hygiene },
                stability: { ...ExecutionStore.stability }
            };
        },

        /**
         * Update stability metrics from paper-trading engine
         */
        updateStabilityMetrics(metrics) {
            const oldDd = ExecutionStore.stability.rollingDrawdown;
            Object.assign(ExecutionStore.stability, metrics);

            // Detect stability degradation for audit
            if (metrics.rollingDrawdown > oldDd + 5.0) { // > 5% spike in DD
                this.captureEvent('STRATEGY', 'Risk Manager', 'STABILITY_DEGRADE', {
                    reason: 'Drawdown spike detected: ' + metrics.rollingDrawdown.toFixed(2) + '%',
                    severity: 'HIGH',
                    readiness_impact_delta: -30.0
                });
            }

            if (window.CapitalReadiness && window.CapitalReadiness.updateReadinessButton) {
                window.CapitalReadiness.updateReadinessButton();
            }
            this.save();
            this.refreshUIIfVisible();
        },

        // ====================================================================
        // UI RENDERING (Execution Tab)
        // ====================================================================
        renderTab(container) {
            if (!container) return;

            // Sync with current Paper State and Portfolio
            this.syncRealtimeState();
            this.evaluateFeedHealth();

            container.innerHTML = `
                <div class="pe-execution-layout">
                    <!-- Top Status Bar & Operations Panels -->
                    <div class="pe-top-panels">
                        <div class="pe-sys-status-panel">
                            <div class="pe-panel-title">ENGINE SYSTEM STATUS</div>
                            <div class="pe-status-grid">
                                <div class="pe-status-item">
                                    <span class="pe-label">ENGINE STATE</span>
                                    <div class="pe-val-row" id="pe-sc-engine"><span class="pe-sys-dot"></span><span class="pe-sys-txt">UNKNOWN</span></div>
                                </div>
                                <div class="pe-status-item">
                                    <span class="pe-label">DATA FEED</span>
                                    <div class="pe-val-row" id="pe-sc-feed"><span class="pe-sys-dot"></span><span class="pe-sys-txt">UNKNOWN</span></div>
                                </div>
                                <div class="pe-status-item">
                                    <span class="pe-label">LAST TICK</span>
                                    <div class="pe-val-row"><span id="pe-sc-tick" class="pe-value" style="font-family:monospace;">—</span></div>
                                </div>
                                <div class="pe-status-item">
                                    <span class="pe-label">CADENCE</span>
                                    <div class="pe-val-row"><span id="pe-sc-cadence" class="pe-value">—</span></div>
                                </div>
                            </div>
                            <!-- Live Feed Debug Panel -->
                            <div id="pe-live-debug" class="pe-debug-panel">
                                <div class="pe-panel-title" style="margin-top:12px;">LIVE FEED DEBUG</div>
                                <div class="pe-debug-grid">
                                    <span class="pe-debug-key">feedState</span><span class="pe-debug-val" id="ped-feedstate">—</span>
                                    <span class="pe-debug-key">lastClosedISO</span><span class="pe-debug-val" id="ped-lastclosed">—</span>
                                    <span class="pe-debug-key">lastProcessedISO</span><span class="pe-debug-val" id="ped-lastproc">—</span>
                                    <span class="pe-debug-key">tickCount</span><span class="pe-debug-val" id="ped-ticks">0</span>
                                    <span class="pe-debug-key">processedCount</span><span class="pe-debug-val" id="ped-processed">0</span>
                                    <span class="pe-debug-key">ignoredDups</span><span class="pe-debug-val" id="ped-dups">0</span>
                                    <span class="pe-debug-key">queueDepth</span><span class="pe-debug-val" id="ped-queue">0</span>
                                    <span class="pe-debug-key">seriesLen</span><span class="pe-debug-val" id="ped-series">0</span>
                                    <span class="pe-debug-key">killed</span><span class="pe-debug-val" id="ped-killed">false</span>
                                </div>
                            </div>
                        </div>

                        <!-- Operator Controls -->
                        <div class="pe-controls-panel">
                            <div class="pe-panel-title">OPERATOR CONTROLS</div>
                            <div class="pe-btn-group">
                                <button id="pe-btn-pause" onclick="PaperExecution.handleEnginePause()" class="pe-btn pe-btn-warn">Pause</button>
                                <button id="pe-btn-resume" onclick="PaperExecution.handleEngineResume()" class="pe-btn pe-btn-ok">Resume</button>
                                <button id="pe-btn-kill" onclick="PaperExecution.showKillConfirmation()" class="pe-btn pe-btn-danger">KILL SWITCH</button>
                                <button id="pe-btn-reset" onclick="PaperExecution.handleEngineReset()" class="pe-btn pe-btn-outline" style="margin-left:auto;">Reset State</button>
                            </div>
                        </div>
                    </div>

                    <!-- Confirmation Modal (Hidden by default) -->
                    <div id="pe-kill-modal" class="pe-modal-overlay" style="display:none;">
                        <div class="pe-modal-content">
                            <div class="pe-modal-header">CONFIRM EMERGENCY STOP</div>
                            <div class="pe-modal-body">
                                Emergency stop will immediately halt all execution for this session. 
                                This cannot be undone. Confirm?
                            </div>
                            <div class="pe-modal-footer">
                                <button onclick="PaperExecution.hideKillConfirmation()" class="pe-btn pe-btn-outline">Cancel</button>
                                <button onclick="PaperExecution.handleEngineKill()" class="pe-btn pe-btn-danger">Confirm Kill</button>
                            </div>
                        </div>
                    </div>

                    <!-- Safety Banner -->
                    <div id="pe-safety-banner" class="pe-safety-banner" style="display:none;"></div>

                    <!-- Live Portfolio Strip -->
                    <div class="pe-portfolio-strip">
                        <div class="pe-port-item"><div class="pe-port-lbl">PAPER EQUITY</div><div class="pe-port-val" id="ps-eq">—</div></div>
                        <div class="pe-port-item"><div class="pe-port-lbl">OPEN PNL</div><div class="pe-port-val" id="ps-opnl">—</div></div>
                        <div class="pe-port-item"><div class="pe-port-lbl">REALIZED PNL</div><div class="pe-port-val" id="ps-rpnl">—</div></div>
                        <div class="pe-port-item"><div class="pe-port-lbl">CURRENT DD</div><div class="pe-port-val" id="ps-dd">—</div></div>
                        <div class="pe-port-item"><div class="pe-port-lbl">EXPOSURE</div><div class="pe-port-val" id="ps-exp">—</div></div>
                        <div class="pe-port-item"><div class="pe-port-lbl">ACTIVE POS</div><div class="pe-port-val" id="ps-apos">—</div></div>
                        <div class="pe-port-item"><div class="pe-port-lbl">PENDING</div><div class="pe-port-val" id="ps-pend">—</div></div>
                    </div>

                    <!-- Positions Table -->
                    <div class="pe-section">
                        <div class="pe-section-header">ACTIVE POSITIONS</div>
                        <div class="pe-table-wrap">
                            <table class="pe-table">
                               <thead>
                                   <tr>
                                       <th>Strategy</th>
                                       <th>State</th>
                                       <th>Position</th>
                                       <th>Entry</th>
                                       <th>Size / Notional</th>
                                       <th>Unrealized PnL</th>
                                       <th>Action</th>
                                   </tr>
                               </thead>
                               <tbody id="pe-positions-tbody">
                                   <!-- Injected via refreshPositions -->
                               </tbody>
                            </table>
                        </div>
                    </div>

                    <div class="pe-grid">
                        <!-- Execution Queue -->
                        <div class="pe-section">
                            <div class="pe-section-header" style="display:flex; justify-content:space-between; align-items:center;">
                                <span>EXECUTION QUEUE</span>
                                <div id="pe-paused-badge" class="pe-paused-badge" style="display:none;">PAUSED — execution frozen, data feed may still update</div>
                            </div>
                            <div id="pe-queue-wrapper" class="pe-table-wrap">
                                <table class="pe-table">
                                    <thead>
                                        <tr>
                                            <th>Strategy Name</th>
                                            <th>Asset / Timeframe</th>
                                            <th>Signal Type</th>
                                            <th>Trigger Price</th>
                                            <th>Expected Exec</th>
                                            <th>Status</th>
                                        </tr>
                                    </thead>
                                    <tbody id="pe-queue-tbody">
                                        <!-- Injected via refreshQueue -->
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <!-- Forensic Event Timeline -->
                        <div class="pe-section">
                            <div class="pe-section-header" style="display:flex; justify-content:space-between;">
                                <span>EVENT TIMELINE (AUDIT)</span>
                                <button onclick="PaperExecution.exportAuditLog()" class="pe-btn-mini pe-btn-outline">Export JSON</button>
                            </div>
                            <div id="pe-timeline" class="pe-timeline">
                                <!-- Injected via refreshTimeline -->
                            </div>
                        </div>
                    </div>
                </div>
            `;

            this.refreshUI();
            this.startAutoRefresh();
        },

        startAutoRefresh() {
            if (this._refreshTimer) clearInterval(this._refreshTimer);
            this._refreshTimer = null;
            const gen = _resetGeneration; // snapshot — used to detect stale closures post-reset
            this._refreshTimer = setInterval(() => {
                // If a reset happened since this closure was created, kill ourselves immediately.
                if (_resetGeneration !== gen) {
                    clearInterval(this._refreshTimer);
                    this._refreshTimer = null;
                    return;
                }
                if (document.getElementById('pe-sc-engine')) {
                    this.syncRealtimeState();
                    this.evaluateFeedHealth();
                    this.refreshUI();
                } else {
                    // Tab was destroyed — clean up
                    clearInterval(this._refreshTimer);
                    this._refreshTimer = null;
                }
            }, 3000); // 3s UI poll
        },

        evaluateFeedHealth() {
            // When the engine is deliberately idle (IDLE or STOPPED), the feed has not
            // been started — this is NOT a network error. Report IDLE, not DISCONNECTED.
            const isEngineIdle = ExecutionStore.engineState === 'IDLE' ||
                ExecutionStore.engineState === 'STOPPED';
            if (isEngineIdle) {
                ExecutionStore.feedState = 'IDLE';
                return;
            }

            // From here the engine is RUNNING, PAUSED, or EMERGENCY_STOP.
            if (!ExecutionStore.lastTickTime) {
                if (ExecutionStore.engineState === 'RUNNING') ExecutionStore.feedState = 'DELAYED';
                return;
            }
            const delay = Date.now() - new Date(ExecutionStore.lastTickTime).getTime();
            const oldState = ExecutionStore.feedState;

            if (ExecutionStore.engineState !== 'RUNNING' && ExecutionStore.engineState !== 'PAUSED') {
                // Engine is in EMERGENCY_STOP — treat as feed halted, not a network drop
                ExecutionStore.feedState = 'IDLE';
            } else if (delay > ExecutionStore.tickIntervalMs * 5) {
                ExecutionStore.feedState = 'DISCONNECTED';
            } else if (delay > ExecutionStore.tickIntervalMs * 2.5) {
                ExecutionStore.feedState = 'DELAYED';
            } else {
                ExecutionStore.feedState = 'CONNECTED';
            }

            // Track disconnects
            if (oldState !== 'DISCONNECTED' && ExecutionStore.feedState === 'DISCONNECTED') {
                ExecutionStore.hygiene.disconnectCount++;
                this.captureEvent('SYSTEM', 'Data Feed', 'FEED_DROP', {
                    reason: 'Heartbeat lost (> 5x interval)',
                    severity: 'HIGH',
                    readiness_impact_delta: -50.0
                });
            }

            // Track stale ticks (> 2.x expected cadence)
            if (ExecutionStore.engineState === 'RUNNING' && delay > ExecutionStore.tickIntervalMs * 2.0) {
                // This is a subtle degradation, we log it once per period if it stays stale
                if (!this._lastStaleTime || Date.now() - this._lastStaleTime > ExecutionStore.tickIntervalMs * 5) {
                    ExecutionStore.hygiene.staleTickCount++;
                    this._lastStaleTime = Date.now();
                    this.captureEvent('SYSTEM', 'Data Feed', 'STALE_TICK', {
                        delayMs: delay,
                        severity: 'MEDIUM',
                        readiness_impact_delta: -20.0
                    });
                    if (window.CapitalReadiness && window.CapitalReadiness.updateReadinessButton) {
                        window.CapitalReadiness.updateReadinessButton();
                    }
                }
            }

            if (oldState !== ExecutionStore.feedState) {
                if (window.CapitalReadiness && window.CapitalReadiness.updateReadinessButton) {
                    window.CapitalReadiness.updateReadinessButton();
                }
            }
        },

        syncRealtimeState() {
            // If the engine has been hard-reset to IDLE, do NOT re-populate runtimeStore
            // from localStorage paper sessions — that would rehydrate stale state.
            if (ExecutionStore.engineState === 'IDLE') return;

            const PM = window.PortfolioManager;
            const RO = window.PortfolioRiskOverlay;
            if (!PM) return;

            const portfolio = PM.getPortfolio();
            if (!portfolio) return;

            const paperSessionsRaw = localStorage.getItem('pp_paper_sessions_v1');
            let paperSessions = [];
            try {
                const parsed = JSON.parse(paperSessionsRaw);
                paperSessions = Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);
            } catch (e) { }

            const overlayMode = RO ? RO.getOverlayMode() : 'NORMAL';

            // Global derived state
            let anyRunning = false;
            let totalCap = 0;
            let totalOpnl = 0;
            let totalRpnl = 0;
            let totalMaxCap = portfolio.starting_capital || 10000;
            let maxDd = 0;
            let expoCount = 0;
            let pendingCount = 0;
            let activeCount = 0;

            // Grab the last updated tick across active sessions
            let latestGlobalTick = null;

            portfolio.holdings.forEach(slot => {
                const session = paperSessions.find(s =>
                    s.candidateId === slot.strategy_id ||
                    s.id === slot.strategy_id ||
                    (s.config && s.config.asset === (slot.label || '').split('-')[0])
                ) || paperSessions[0];

                const slotState = RO ? RO.getSlotOverlayState(slot.slot_id) : null;
                const status = slotState ? slotState.status : (slot.enabled ? 'ENABLED' : 'DISABLED');

                const runtime = {
                    strategy_id: slot.strategy_id,
                    version_id: slot.version_id,
                    label: slot.label,
                    asset: session && session.config ? session.config.asset : 'Unknown',
                    timeframe: session && session.config ? session.config.timeframe : '1d',
                    enabled: slot.enabled,
                    overlay_state: overlayMode,
                    status: status
                };

                if (session && session.id) {
                    if (session.isRunning) anyRunning = true;
                    if (session.lastUpdated && (!latestGlobalTick || new Date(session.lastUpdated) > new Date(latestGlobalTick))) {
                        latestGlobalTick = session.lastUpdated;
                    }

                    totalCap += session.capital || 0;
                    totalOpnl += session.openPnl || 0;
                    totalRpnl += session.realizedPnl || 0;
                    if (session.currentDrawdown > maxDd) maxDd = session.currentDrawdown;
                    if (session.inPosition) activeCount++;

                    if (session.inPosition) {
                        const notional = (session.shares || 0) * (session.entryPrice || 0);
                        expoCount += notional;
                    }

                    runtime.position = {
                        in_position: session.inPosition,
                        side: session.inPosition ? 'LONG' : 'NONE',
                        entry_time: session.entryTime,
                        entry_price: session.entryPrice,
                        size_units: session.shares || 0,
                        notional: (session.shares || 0) * (session.entryPrice || 0),
                        unrealized_pnl: session.openPnl || 0,
                        unrealized_pnl_pct: session.entryPrice ? ((session.openPnl / ((session.shares || 1) * session.entryPrice)) * 100) : 0
                    };
                    runtime.pending = {
                        has_pending_entry: session.pendingEntry || false,
                        has_pending_exit: session.pendingExit || false,
                        reason: session.lastSignal || '',
                        scheduled_time: session.lastSignalTime ? new Date(new Date(session.lastSignalTime).getTime() + 3600000).toISOString() : null,
                        trigger_price: session.lastSignalPrice || null
                    };

                    if (session.pendingEntry || session.pendingExit) pendingCount++;
                }

                this.updateStrategyState(slot.slot_id, runtime);
            });

            // Update derived summary and system state
            currentSummary = {
                equity: totalCap + totalOpnl || portfolio.starting_capital || 10000,
                openPnl: totalOpnl,
                realizedPnl: totalRpnl,
                currentDrawdown: maxDd,
                exposure: (expoCount / (totalCap || 1)) * 100,
                activeCount: activeCount,
                pendingCount: pendingCount
            };

            if (latestGlobalTick) ExecutionStore.lastTickTime = latestGlobalTick;

            // EMERGENCY_STOP is sticky — syncRealtimeState must never override it
            if (ExecutionStore.killSwitched || ExecutionStore.engineState === 'EMERGENCY_STOP') {
                ExecutionStore.engineState = 'EMERGENCY_STOP';
            } else if (anyRunning && ExecutionStore.engineState !== 'PAUSED') {
                ExecutionStore.engineState = 'RUNNING';
            } else if (!anyRunning && ExecutionStore.engineState !== 'PAUSED') {
                ExecutionStore.engineState = 'STOPPED';
            }
        },

        refreshUI() {
            this.refreshStatusBar();
            this.refreshSummaryStrip();
            this.refreshPositions();
            this.refreshQueue();
            this.refreshTimeline();
            this.updateSafetyBanners();
            this.updateControlButtons();
            this.updatePausedVisuals();
        },

        updatePausedVisuals() {
            const isPaused = ExecutionStore.engineState === 'PAUSED';
            const isKilled = ExecutionStore.engineState === 'EMERGENCY_STOP';
            const badge = document.getElementById('pe-paused-badge');
            const wrapper = document.getElementById('pe-queue-wrapper');

            if (badge) badge.style.display = (isPaused || isKilled) ? 'block' : 'none';
            if (badge && isKilled) badge.textContent = 'EMERGENCY STOP \u2014 execution frozen, queue locked';
            if (badge && isPaused) badge.textContent = 'PAUSED \u2014 execution frozen, data feed may still update';
            if (wrapper) {
                if (isPaused || isKilled) {
                    wrapper.classList.add('pe-paused-dim');
                } else {
                    wrapper.classList.remove('pe-paused-dim');
                }
            }
        },

        refreshStatusBar() {
            const getDotHtml = (sysState) => {
                if (sysState === 'RUNNING' || sysState === 'CONNECTED') return '<span class="pe-sys-dot pe-sd-green"></span>';
                if (sysState === 'PAUSED' || sysState === 'DELAYED') return '<span class="pe-sys-dot pe-sd-yellow"></span>';
                // IDLE is a neutral, intentional state — use grey dot, not red
                if (sysState === 'IDLE') return '<span class="pe-sys-dot" style="background:#64748b;"></span>';
                return '<span class="pe-sys-dot pe-sd-red"></span>';
            };

            const engEl = document.getElementById('pe-sc-engine');
            const isEmStop = ExecutionStore.engineState === 'EMERGENCY_STOP';
            if (engEl) engEl.innerHTML = getDotHtml(ExecutionStore.engineState) + `<span class="pe-sys-txt" style="color:${isEmStop ? '#f87171' : 'inherit'}">${ExecutionStore.engineState}</span>`;

            const feedEl = document.getElementById('pe-sc-feed');
            // IDLE is intentional — show in muted colour, not red
            const feedIsError = ExecutionStore.feedState === 'DISCONNECTED';
            const feedColor = feedIsError ? '#f87171' : (ExecutionStore.feedState === 'IDLE' ? '#94a3b8' : 'inherit');
            if (feedEl) feedEl.innerHTML = getDotHtml(ExecutionStore.feedState) + `<span class="pe-sys-txt" style="color:${feedColor}">${ExecutionStore.feedState}</span>`;

            const tickEl = document.getElementById('pe-sc-tick');
            if (tickEl) {
                tickEl.textContent = ExecutionStore.lastTickTime
                    ? new Date(ExecutionStore.lastTickTime).toLocaleTimeString()
                    : '\u2014'; // em dash when engine is idle / no ticks yet
            }

            const cadEl = document.getElementById('pe-sc-cadence');
            if (cadEl) {
                cadEl.textContent = `${(ExecutionStore.tickIntervalMs / 1000).toFixed(0)}s interval`;
            }

            // ── Live Feed Debug Panel ────────────────────────────────────────
            const snap = window.PaperExecutionEngine ? window.PaperExecutionEngine.getSnapshot() : null;
            const feedLastClosed = ExecutionStore.lastTickTime;  // updated by DataFeed onCandle

            const setDebug = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
            setDebug('ped-feedstate', ExecutionStore.feedState);
            setDebug('ped-lastclosed', feedLastClosed ? new Date(feedLastClosed).toISOString().replace('T', ' ').slice(0, 19) + 'Z' : '—');
            setDebug('ped-lastproc', snap && snap.lastProcessedCandleTs ? new Date(snap.lastProcessedCandleTs).toISOString().replace('T', ' ').slice(0, 19) + 'Z' : '—');
            setDebug('ped-ticks', snap ? snap.tickCount : '0');
            setDebug('ped-processed', snap ? snap.processedCount : '0');
            setDebug('ped-dups', snap ? snap.ignoredDuplicateCount : '0');
            const queueDepth = Object.values(runtimeStore).filter(rt => rt.pending && (rt.pending.has_pending_entry || rt.pending.has_pending_exit)).length;
            setDebug('ped-queue', queueDepth);
            setDebug('ped-series', snap ? snap.seriesLen : '0');
            setDebug('ped-killed', snap ? snap.killed : 'false');
        },

        refreshSummaryStrip() {
            const fmtMoney = v => (v >= 0 ? '$' : '-$') + Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            const fmtPct = v => (v >= 0 ? '+' : '') + v.toFixed(2) + '%';

            const eqEl = document.getElementById('ps-eq');
            if (eqEl) { eqEl.textContent = fmtMoney(currentSummary.equity); eqEl.style.color = currentSummary.equity >= 100000 ? '#4ade80' : '#f87171'; }

            const opnlEl = document.getElementById('ps-opnl');
            if (opnlEl) { opnlEl.textContent = fmtMoney(currentSummary.openPnl); opnlEl.className = 'pe-port-val ' + (currentSummary.openPnl > 0 ? 'pe-positive' : (currentSummary.openPnl < 0 ? 'pe-negative' : '')); }

            const rpnlEl = document.getElementById('ps-rpnl');
            if (rpnlEl) { rpnlEl.textContent = fmtMoney(currentSummary.realizedPnl); rpnlEl.className = 'pe-port-val ' + (currentSummary.realizedPnl > 0 ? 'pe-positive' : (currentSummary.realizedPnl < 0 ? 'pe-negative' : '')); }

            const ddEl = document.getElementById('ps-dd');
            if (ddEl) { ddEl.textContent = currentSummary.currentDrawdown.toFixed(2) + '%'; ddEl.className = 'pe-port-val ' + (currentSummary.currentDrawdown > 0 ? 'pe-negative' : ''); }

            const expEl = document.getElementById('ps-exp');
            if (expEl) expEl.textContent = currentSummary.exposure.toFixed(1) + '%';

            const aposEl = document.getElementById('ps-apos');
            if (aposEl) aposEl.textContent = currentSummary.activeCount;

            const pendEl = document.getElementById('ps-pend');
            if (pendEl) pendEl.textContent = currentSummary.pendingCount;
        },

        refreshPositions() {
            const tbody = document.getElementById('pe-positions-tbody');
            if (!tbody) return;

            const PM = window.PortfolioManager;
            const portfolio = PM ? PM.getPortfolio() : null;
            if (!portfolio) {
                tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;">No portfolio loaded.</td></tr>';
                return;
            }

            let html = '';
            portfolio.holdings.forEach(slot => {
                const rt = runtimeStore[slot.slot_id] || { label: slot.label, status: slot.enabled ? 'ENABLED' : 'DISABLED', position: {}, last_action: {} };
                const pos = rt.position || {};
                const pnl = pos.unrealized_pnl || 0;
                const pnlColor = pnl >= 0 ? '#4ade80' : '#f87171';

                const statusColor = rt.status?.includes('DISABLED') || rt.status?.includes('PAUSED') ? '#f87171' : '#4ade80';

                html += `
                    <tr>
                        <td>
                            <div class="pe-strat-name">${rt.label}</div>
                            <div class="pe-strat-id">${slot.strategy_id.substring(0, 8)}...</div>
                        </td>
                        <td>
                            <span style="color:${statusColor};font-weight:600;font-size:0.7rem;">${rt.status || 'ENABLED'}</span>
                        </td>
                        <td>
                            <span class="pe-pos-badge pe-pos-${(pos.side || 'NONE').toLowerCase()}">${pos.side || 'NONE'}</span>
                        </td>
                        <td>
                            <div class="pe-value-main">${pos.entry_price ? '$' + pos.entry_price.toLocaleString() : '—'}</div>
                            <div class="pe-value-sub">${pos.entry_time ? new Date(pos.entry_time).toLocaleTimeString() : ''}</div>
                        </td>
                        <td>
                            <div class="pe-value-main">${pos.size_units ? pos.size_units.toFixed(4) : '—'}</div>
                            <div class="pe-value-sub">${pos.notional ? '$' + pos.notional.toLocaleString() : ''}</div>
                        </td>
                        <td>
                            <div class="pe-value-main" style="color:${pnlColor}">${pnl ? (pnl >= 0 ? '+' : '') + '$' + pnl.toLocaleString() : '$0.00'}</div>
                            <div class="pe-value-sub" style="color:${pnlColor}">${pos.unrealized_pnl_pct ? (pos.unrealized_pnl_pct >= 0 ? '+' : '') + pos.unrealized_pnl_pct.toFixed(2) + '%' : '0.00%'}</div>
                        </td>
                        <td>
                            <div class="pe-actions">
                                ${slot.enabled
                        ? `<button onclick="PaperExecution.handleToggleSlot('${slot.slot_id}', false)" class="pe-btn-mini pe-btn-disable">Disable</button>`
                        : `<button onclick="PaperExecution.handleToggleSlot('${slot.slot_id}', true)" class="pe-btn-mini pe-btn-enable">Enable</button>`
                    }
                            </div>
                        </td>
                    </tr>
                `;
            });

            if (portfolio.holdings.length === 0) {
                html = '<tr><td colspan="7" style="text-align:center;padding:20px;color:#64748b;">No strategies in portfolio.</td></tr>';
            }

            tbody.innerHTML = html;
        },

        refreshQueue() {
            const tbody = document.getElementById('pe-queue-tbody');
            if (!tbody) return;

            let html = '';
            let hasAny = false;

            Object.values(runtimeStore).forEach(rt => {
                if (rt.pending && (rt.pending.has_pending_entry || rt.pending.has_pending_exit)) {
                    hasAny = true;
                    const isEntry = rt.pending.has_pending_entry;
                    const type = isEntry ? 'ENTER' : 'EXIT'; // Match requested terms
                    const qStatus = ExecutionStore.engineState === 'PAUSED' ? 'BLOCKED' : 'QUEUED';
                    const statusClass = qStatus.toLowerCase();

                    html += `
                        <tr>
                            <td><div class="pe-strat-name">${rt.label}</div></td>
                            <td>${rt.asset} \u2022 ${rt.timeframe}</td>
                            <td><span class="pe-q-type ${isEntry ? 'long' : 'short'}">${type}</span></td>
                            <td><div class="pe-value-main">${rt.pending.trigger_price ? '$' + rt.pending.trigger_price.toLocaleString() : 'Market/Open'}</div></td>
                            <td><div class="pe-value-sub">${rt.pending.scheduled_time ? new Date(rt.pending.scheduled_time).toLocaleTimeString() : 'Next Check'}</div></td>
                            <td>
                                <div class="pe-q-status-chip pe-status-${statusClass}">${qStatus}</div>
                            </td>
                        </tr>
                    `;
                }
            });

            if (!hasAny) {
                tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:32px;color:#64748b;font-style:italic;">No pending signals. System is monitoring live data.</td></tr>';
            } else {
                tbody.innerHTML = html;
            }
        },

        refreshTimeline() {
            const container = document.getElementById('pe-timeline');
            if (!container) return;

            const events = [...eventBuffer].reverse();
            if (events.length === 0) {
                container.innerHTML = '<div class="pe-empty-state" style="padding:20px;text-align:center;color:#64748b;font-style:italic;">No events logged yet. System actions will appear here.</div>';
                return;
            }

            let html = '';
            events.forEach((e, idx) => {
                const time = new Date(e.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                const dotClass = `pe-dot-${(e.type || 'info').toLowerCase()}`;

                // Construct details JSON output
                const detailsJson = JSON.stringify(e.detail, null, 2);

                html += `
                    <div class="pe-timeline-item">
                        <div class="pe-timeline-time">${time}</div>
                        <div class="pe-timeline-dot ${dotClass}"></div>
                        <div class="pe-timeline-content">
                            <div style="display:flex; justify-content:space-between; width:100%; align-items:center;">
                                <div onclick="document.getElementById('pe-tl-det-${e.id}').classList.toggle('open')" style="cursor:pointer; flex:1;">
                                    <span class="pe-timeline-label">${e.label}</span>
                                    <span class="pe-timeline-type">${e.type}</span>
                                    <span class="pe-timeline-detail">${this.formatEventDetail(e)}</span>
                                </div>
                                <div style="display:flex; gap:8px;">
                                    <button class="pe-btn-mini pe-btn-outline" style="font-size:0.6rem; padding:2px 6px;" onclick="PaperExecution.copyEvent('${e.id}')">Copy</button>
                                    <button class="pe-btn-icon" onclick="document.getElementById('pe-tl-det-${e.id}').classList.toggle('open')">▾</button>
                                </div>
                            </div>
                            <div id="pe-tl-det-${e.id}" class="pe-timeline-drawer">
                                <pre style="background:rgba(0,0,0,0.3); padding:10px; border-radius:6px; font-size:0.7rem; margin-top:8px; overflow-x:auto;">${detailsJson}</pre>
                            </div>
                        </div>
                    </div>
                `;
            });

            container.innerHTML = html;
        },

        updateSafetyBanners() {
            const banner = document.getElementById('pe-safety-banner');
            if (!banner) return;

            if (ExecutionStore.killSwitched || ExecutionStore.engineState === 'EMERGENCY_STOP') {
                banner.className = 'pe-safety-banner pe-sb-danger';
                banner.innerHTML = '\u2620\uFE0F EMERGENCY STOP \u2014 All execution halted. Timers cleared. No trades will execute. Only Reset State or Start Paper Watch can restart.';
                banner.style.display = 'block';
            } else if (ExecutionStore.feedState === 'DISCONNECTED') {
                // True network error — only shown when feed was actually attempted and lost
                banner.className = 'pe-safety-banner pe-sb-warn';
                banner.innerHTML = '\u26A0\uFE0F Data Feed Disconnected. Queue halted to prevent stale execution.';
                banner.style.display = 'block';
            } else if (ExecutionStore.feedState === 'DELAYED') {
                banner.className = 'pe-safety-banner pe-sb-warn';
                banner.innerHTML = '\u26A0\uFE0F Data Feed Delayed. Engine monitoring closely.';
                banner.style.display = 'block';
            } else if (ExecutionStore.feedState === 'IDLE' &&
                (ExecutionStore.engineState === 'IDLE' || ExecutionStore.engineState === 'STOPPED')) {
                // After reset or before first start — show a calm ready indicator, not an error
                banner.className = 'pe-safety-banner pe-sb-info';
                banner.innerHTML = '\u2139\uFE0F Ready \u2014 press Start / Resume to begin data feed and execution.';
                banner.style.display = 'block';
            } else {
                banner.style.display = 'none';
            }
        },

        updateControlButtons() {
            const pb = document.getElementById('pe-btn-pause');
            const rb = document.getElementById('pe-btn-resume');
            const kb = document.getElementById('pe-btn-kill');
            const resetBtn = document.getElementById('pe-btn-reset');

            const state = ExecutionStore.engineState;
            const isEmStop = state === 'EMERGENCY_STOP';
            const isPaused = state === 'PAUSED';
            const isRunning = state === 'RUNNING';
            const isLocked = isEmStop || ExecutionStore.killSwitched;
            // States where "Start/Resume" action is valid
            const canResume = state === 'PAUSED' || state === 'STOPPED' || state === 'IDLE';

            // Pause: only while RUNNING
            if (pb) pb.disabled = !isRunning;
            // Resume: enabled in PAUSED, STOPPED, IDLE; disabled in LOCKED or RUNNING
            if (rb) rb.disabled = isLocked || !canResume;
            // Kill: disabled if already locked
            if (kb) kb.disabled = isLocked;
            // Reset: always the escape hatch — never disabled
            if (resetBtn) resetBtn.disabled = false;

            // Disable position slot toggle buttons when locked or paused
            const posActions = document.querySelectorAll('.pe-actions button');
            posActions.forEach(btn => btn.disabled = isLocked || isPaused);
        },

        showKillConfirmation() {
            const modal = document.getElementById('pe-kill-modal');
            if (modal) modal.style.display = 'flex';
        },

        hideKillConfirmation() {
            const modal = document.getElementById('pe-kill-modal');
            if (modal) modal.style.display = 'none';
        },

        copyEvent(eventId) {
            const event = eventBuffer.find(e => e.id === eventId);
            if (event) {
                const text = JSON.stringify(event, null, 2);
                navigator.clipboard.writeText(text).then(() => {
                    // Subtle feedback could be added here
                    console.log('Event copied to clipboard');
                });
            }
        },

        formatEventDetail(e) {
            if (typeof e.detail === 'string') return e.detail;
            if (e.detail.reason) return e.detail.reason;
            if (e.detail.pnl) return `PnL: $${e.detail.pnl.toLocaleString()} (${e.detail.returnPct?.toFixed(2)}%)`;
            if (e.detail.price) return `Price: $${e.detail.price.toLocaleString()}`;
            return '';
        },

        // --- Console Control Mutators --- //
        handleEnginePause() {
            if (ExecutionStore.engineState === 'RUNNING') {
                ExecutionStore.engineState = 'PAUSED';
                if (engineInterface && engineInterface.stop) {
                    engineInterface.stop('PAUSED');
                }
                // Pause LiveExecutionAdapter (keeps state, stops feed)
                if (_liveAdapter) { _liveAdapter.pause(); }
                this.captureEvent('SYSTEM', 'Execution Queue', 'PAUSE', { reason: 'Operator manual pause' });
                this.refreshUI();
            }
        },

        handleEngineResume() {
            // EMERGENCY_STOP cannot be exited by Resume — only Reset or Start Paper Watch
            if (ExecutionStore.killSwitched || ExecutionStore.engineState === 'EMERGENCY_STOP') {
                alert('Cannot resume from EMERGENCY_STOP. Use Reset State to clear.');
                return;
            }
            if (ExecutionStore.feedState === 'DISCONNECTED') {
                alert('Cannot resume without safe data feed connection.');
                return;
            }
            const state = ExecutionStore.engineState;
            if (state === 'PAUSED' || state === 'STOPPED' || state === 'IDLE') {
                const wasStopped = state === 'STOPPED' || state === 'IDLE';
                ExecutionStore.engineState = 'RUNNING';
                if (engineInterface && engineInterface.resume) {
                    engineInterface.resume();
                } else if (engineInterface && engineInterface.start) {
                    engineInterface.start();
                }

                // ── START LIVE FEED ──────────────────────────────────────────────
                // Determine active symbol + timeframe from portfolio or fall back
                // to the BTC 4H production preset.
                if (window.DataFeed) {
                    const PM = window.PortfolioManager;
                    const portfolio = PM && PM.getPortfolio ? PM.getPortfolio() : null;
                    const firstSlot = portfolio && portfolio.holdings && portfolio.holdings[0];
                    // Prefer asset from the first active session, default to BTC-USD / 4h
                    const paperSessions = (() => {
                        try { return JSON.parse(localStorage.getItem('pp_paper_sessions_v1') || '[]'); } catch (e) { return []; }
                    })();
                    const firstSession = Array.isArray(paperSessions) ? paperSessions[0] : paperSessions;
                    const feedSymbol = (firstSession && firstSession.config && firstSession.config.asset) || 'BTC-USD';
                    const feedTf = (firstSession && firstSession.config && firstSession.config.timeframe) || '4h';

                    // ── INIT PaperExecutionEngine ────────────────────────────────
                    if (window.PaperExecutionEngine) {
                        const peConfig = {
                            startingCapital: (portfolio && portfolio.starting_capital) || 10000,
                            riskPercent: (firstSession && firstSession.config && firstSession.config.riskPercent) || 0.02,
                            stopPercent: (firstSession && firstSession.config && firstSession.config.stopPercent) || 0.02,
                            slippagePct: (firstSession && firstSession.config && firstSession.config.slippagePct) || 0.001,
                            feeRate: (firstSession && firstSession.config && firstSession.config.feeRate) || 0.001
                        };
                        // Only re-init if we are starting fresh (STOPPED/IDLE), not resuming from PAUSED
                        if (wasStopped) {
                            window.PaperExecutionEngine.init(peConfig);
                            console.log('[PaperExecution] PaperExecutionEngine initialised with config:', peConfig);
                        }
                    }

                    // ── INIT LiveExecutionAdapter ────────────────────────────────
                    if (window.LiveExecutionAdapter && wasStopped) {
                        const adapterParams = {
                            startingCapital: (portfolio && portfolio.starting_capital) || 10000,
                            riskPercent: (firstSession && firstSession.config && firstSession.config.riskPercent) || 0.02,
                            stopPercent: (firstSession && firstSession.config && firstSession.config.stopPercent) || 0.02,
                            slippagePct: (firstSession && firstSession.config && firstSession.config.slippagePct) || 0.001,
                            feeRate: (firstSession && firstSession.config && firstSession.config.feeRate) || 0.001,
                            symbol: feedSymbol,
                            timeframe: feedTf,
                            cadenceMs: ExecutionStore.tickIntervalMs
                        };
                        const adapterSelf = this;
                        _liveAdapter = window.LiveExecutionAdapter.createLiveExecutionAdapter({
                            dataFeed: null, // DataFeed driven by onCandle below
                            params: adapterParams,
                            uiHooks: {
                                onUpdate(snap) {
                                    if (snap && snap.equityCurve && snap.equityCurve.length) {
                                        currentSummary.equity = snap.equityCurve[snap.equityCurve.length - 1];
                                    }
                                    if (snap) {
                                        currentSummary.activeCount = snap.inPosition ? 1 : 0;
                                        currentSummary.pendingCount = (snap.pendingEntry || snap.pendingExit) ? 1 : 0;
                                    }
                                    adapterSelf.save();
                                },
                                onFeedStatus() { /* handled by DataFeed.startLiveFeed onStatus */ }
                            }
                        });
                        _liveAdapter.start();
                        console.log('[PaperExecution] LiveExecutionAdapter started.');
                    }

                    const self = this;
                    this.captureEvent('SYSTEM', 'Data Feed', 'FEED_CONNECTING', {
                        symbol: feedSymbol, timeframe: feedTf, cadenceMs: ExecutionStore.tickIntervalMs
                    });

                    window.DataFeed.startLiveFeed({
                        symbol: feedSymbol,
                        timeframe: feedTf,
                        cadenceMs: ExecutionStore.tickIntervalMs,

                        onCandle(candle) {
                            // Guard: do nothing if engine was killed/reset since feed started
                            if (ExecutionStore.killSwitched || ExecutionStore.engineState === 'EMERGENCY_STOP' || ExecutionStore.engineState === 'IDLE') return;
                            // Guard: do nothing if paused
                            if (ExecutionStore.engineState === 'PAUSED') return;

                            ExecutionStore.lastTickTime = candle.time;
                            self.captureEvent('SYSTEM', 'Data Feed', 'TICK_RECEIVED', {
                                candleTime: candle.time,
                                close: candle.close,
                                symbol: feedSymbol,
                                timeframe: feedTf
                            });

                            // ── Route into PaperExecutionEngine ─────────────────
                            if (window.PaperExecutionEngine && !window.PaperExecutionEngine.getSnapshot().killed) {
                                window.PaperExecutionEngine.onCandle(candle);

                                // Sync engine snapshot back into ExecutionStore / currentSummary
                                const snap = window.PaperExecutionEngine.getSnapshot();
                                currentSummary.equity = snap.equityCurve[snap.equityCurve.length - 1] || currentSummary.equity;
                                currentSummary.realizedPnl = snap.tradeLog.reduce((s, t) => s + t.pnl, 0);
                                currentSummary.openPnl = snap.inPosition
                                    ? (candle.close - snap.entryPrice) * snap.shares
                                    : 0;
                                currentSummary.activeCount = snap.inPosition ? 1 : 0;
                                currentSummary.pendingCount = (snap.pendingEntry || snap.pendingExit) ? 1 : 0;

                                // Stability metrics from equity curve
                                if (snap.equityCurve.length > 1) {
                                    const peak = Math.max(...snap.equityCurve);
                                    const cur = snap.equityCurve[snap.equityCurve.length - 1];
                                    const rollingDd = peak > 0 ? ((peak - cur) / peak) * 100 : 0;
                                    self.updateStabilityMetrics({ rollingDrawdown: rollingDd });
                                }
                            }

                            self.save();
                        },

                        onStatus(status) {
                            // Guard: don't overwrite IDLE if engine was reset
                            if (ExecutionStore.engineState === 'IDLE') return;

                            // Map DataFeed status → ExecutionStore.feedState
                            // CONNECTING → CONNECTING (shown as DELAYED in status bar)
                            // CONNECTED  → CONNECTED
                            // STALE      → STALE (shown as DELAYED)
                            // DISCONNECTED → DISCONNECTED
                            const prevFeed = ExecutionStore.feedState;

                            if (status === 'CONNECTING') {
                                ExecutionStore.feedState = 'DELAYED'; // closest existing UI state
                            } else if (status === 'CONNECTED') {
                                ExecutionStore.feedState = 'CONNECTED';
                                if (prevFeed !== 'CONNECTED') {
                                    self.captureEvent('SYSTEM', 'Data Feed', 'FEED_CONNECTED', { symbol: feedSymbol, timeframe: feedTf });
                                    // ── LIVE PAPER EXECUTION READY event ─────────────
                                    const peeSnap = window.PaperExecutionEngine ? window.PaperExecutionEngine.getSnapshot() : {};
                                    self.captureEvent('SYSTEM', 'PaperExecutionEngine', 'LIVE PAPER EXECUTION READY', {
                                        feedState: ExecutionStore.feedState,
                                        lastClosedISO: ExecutionStore.lastTickTime || '—',
                                        lastProcessedISO: peeSnap.lastProcessedCandleTs || '—',
                                        processedCount: peeSnap.processedCount || 0,
                                        ignoredDuplicates: peeSnap.ignoredDuplicateCount || 0,
                                        killed: peeSnap.killed || false
                                    });
                                }
                            } else if (status === 'STALE') {
                                ExecutionStore.feedState = 'DELAYED';
                                ExecutionStore.hygiene.staleTickCount++;
                                self.captureEvent('SYSTEM', 'Data Feed', 'FEED_STALE', {
                                    severity: 'MEDIUM', readiness_impact_delta: -20.0
                                });
                                if (window.CapitalReadiness && window.CapitalReadiness.updateReadinessButton) {
                                    window.CapitalReadiness.updateReadinessButton();
                                }
                            } else if (status === 'DISCONNECTED') {
                                ExecutionStore.feedState = 'DISCONNECTED';
                                ExecutionStore.hygiene.disconnectCount++;
                                self.captureEvent('SYSTEM', 'Data Feed', 'FEED_DISCONNECTED', {
                                    reason: 'Network error — poll failed after retries',
                                    severity: 'HIGH', readiness_impact_delta: -50.0
                                });
                                if (window.CapitalReadiness && window.CapitalReadiness.updateReadinessButton) {
                                    window.CapitalReadiness.updateReadinessButton();
                                }
                            }
                        }
                    });
                }
                // ── END LIVE FEED ────────────────────────────────────────────────

                if (!wasStopped) {
                    ExecutionStore.hygiene.restartCount++;
                    this.captureEvent('SYSTEM', 'Execution Queue', 'RESUME', {
                        reason: 'Operator manual resume',
                        severity: 'LOW',
                        readiness_impact_delta: -30.0
                    });
                } else {
                    this.captureEvent('SYSTEM', 'Execution Queue', 'RESUME', { reason: 'Operator manual start' });
                }
                if (window.CapitalReadiness && window.CapitalReadiness.updateReadinessButton) {
                    window.CapitalReadiness.updateReadinessButton();
                }
                this.refreshUI();
            }
        },

        handleEngineKill() {
            this.hideKillConfirmation();

            // --- Kill LiveExecutionAdapter FIRST ---
            if (_liveAdapter) { _liveAdapter.kill(); _liveAdapter = null; }

            // --- HARD STOP: Kill PaperExecutionEngine FIRST so onCandle logs HARD_BLOCK ---
            if (window.PaperExecutionEngine) {
                window.PaperExecutionEngine.kill();
            }

            // --- HARD STOP: Set state FIRST ---
            ExecutionStore.killSwitched = true;
            ExecutionStore.engineState = 'EMERGENCY_STOP';

            // Snapshot for verification tests
            ExecutionStore.tickCountAtKill = ExecutionStore.lastTickTime;
            const paperRaw = localStorage.getItem('pp_paper_sessions_v1');
            try {
                const parsed = JSON.parse(paperRaw);
                const sessions = Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);
                ExecutionStore.tradeCountAtKill = sessions.reduce((s, p) => s + (p.tradeLog ? p.tradeLog.length : 0), 0);
            } catch (e) { ExecutionStore.tradeCountAtKill = 0; }
            ExecutionStore.queueLenAtKill = Object.values(runtimeStore).filter(
                rt => rt.pending && (rt.pending.has_pending_entry || rt.pending.has_pending_exit)
            ).length;

            // --- HARD STOP: Stop live data feed before clearing engine timers ---
            if (window.DataFeed) window.DataFeed.stopLiveFeed();

            // --- HARD STOP: Kill engine timers immediately ---
            if (engineInterface && engineInterface.stop) {
                engineInterface.stop('EMERGENCY_STOP');
            }

            // --- HARD STOP: Also clear our own auto-refresh (it is harmless, but be thorough) ---
            if (this._refreshTimer) {
                clearInterval(this._refreshTimer);
                this._refreshTimer = null;
            }

            // Persist & log
            this.captureEvent('SYSTEM', 'Execution Engine', 'KILL_SWITCH', {
                reason: 'KILL SWITCH ACTIVATED \u2014 execution halted (EMERGENCY_STOP)',
                severity: 'CRITICAL',
                readiness_impact_delta: -100.0,
                tickSnapshot: ExecutionStore.tickCountAtKill,
                tradeSnapshot: ExecutionStore.tradeCountAtKill,
                queueSnapshot: ExecutionStore.queueLenAtKill
            });
            this.save();
            this.refreshUI();

            console.warn('[PaperExecution] \u2620\uFE0F EMERGENCY_STOP: All timers cleared, execution locked.');
        },

        // Show a brief non-blocking toast inside the execution panel.
        showResetToast() {
            const layout = document.querySelector('.pe-execution-layout');
            if (!layout) return;
            // Remove any existing toast
            const old = document.getElementById('pe-reset-toast');
            if (old) old.remove();
            const toast = document.createElement('div');
            toast.id = 'pe-reset-toast';
            toast.style.cssText = [
                'position:absolute', 'top:12px', 'right:16px',
                'background:#22c55e', 'color:#fff',
                'padding:7px 16px', 'border-radius:8px',
                'font-size:0.75rem', 'font-weight:600',
                'z-index:9999', 'opacity:1',
                'transition:opacity 0.5s ease'
            ].join(';');
            toast.textContent = '\u2713 State reset \u2014 session cleared. Press Start to begin.';
            layout.style.position = 'relative'; // ensure absolute positioning works
            layout.prepend(toast);
            setTimeout(() => { toast.style.opacity = '0'; }, 2500);
            setTimeout(() => { if (toast.parentNode) toast.remove(); }, 3100);
        },

        handleEngineReset() {
            // Snapshot previous state for telemetry before anything is cleared
            const prevEngineState = ExecutionStore.engineState;
            const prevFeedState = ExecutionStore.feedState;

            // ── STEP 1: IMMEDIATE SAFETY STOP ───────────────────────────────────
            // Stop live data feed FIRST so no in-flight candle tick can write
            // state during the reset sequence.
            if (window.DataFeed) window.DataFeed.stopLiveFeed();

            // Kill our own auto-refresh interval, so no 3s tick fires during reset.
            if (this._refreshTimer) {
                clearInterval(this._refreshTimer);
                this._refreshTimer = null;
            }

            // Stop the underlying paper-trading engine if it is running
            if (engineInterface && engineInterface.stop) {
                try { engineInterface.stop('RESET'); } catch (e) { /* no-op */ }
            }

            // ── STEP 2: INVALIDATE ALL STALE CLOSURES ───────────────────────────
            // Incrementing _resetGeneration causes any closure that was already
            // scheduled (e.g., a 3s setInterval tick) to detect it is stale and
            // exit immediately when it eventually fires.
            _resetGeneration++;

            // ── STEP 3: FULL ExecutionStore RESET ───────────────────────────────
            ExecutionStore.engineState = 'IDLE';
            // feedState = 'IDLE' (NOT DISCONNECTED) — the feed was not lost, the
            // operator reset the session. DISCONNECTED is reserved for true network drops.
            ExecutionStore.feedState = 'IDLE';
            ExecutionStore.killSwitched = false;
            ExecutionStore.lastTickTime = null;
            ExecutionStore.tickIntervalMs = 45000; // restore default cadence
            ExecutionStore.latency = 0;
            ExecutionStore.tickCountAtKill = null;
            ExecutionStore.tradeCountAtKill = null;
            ExecutionStore.queueLenAtKill = null;
            ExecutionStore.hygiene = { disconnectCount: 0, restartCount: 0, errorCount: 0, staleTickCount: 0 };
            ExecutionStore.stability = { rollingDrawdown: 0, rollingLossStreak: 0, rollingEquityDrift: 0, liveSlippageDeviation: 0 };
            this._lastStaleTime = null; // clear stale-tick detection window

            // ── STEP 4: CLEAR ALL RUNTIME BUCKETS ───────────────────────────────
            runtimeStore = {};
            eventBuffer = [];

            // Determine starting capital from portfolio for equity baseline
            const PM = window.PortfolioManager;
            const startingCapital = (PM && PM.getPortfolio && PM.getPortfolio())
                ? (PM.getPortfolio().starting_capital || 10000)
                : 10000;

            currentSummary = {
                equity: startingCapital,
                openPnl: 0,
                realizedPnl: 0,
                currentDrawdown: 0,
                exposure: 0,
                activeCount: 0,
                pendingCount: 0
            };

            // ── STEP 5: PERSIST CLEARED STATE ───────────────────────────────────
            try {
                localStorage.removeItem(STATE_KEY);
                localStorage.removeItem(EVENT_KEY);
                localStorage.setItem('pp_kill_switch_v1', 'false');
            } catch (e) { /* storage not available */ }

            // ── STEP 5a: RESET LiveExecutionAdapter ───────────────────────────
            if (_liveAdapter) { try { _liveAdapter.reset(); } catch (e) { /* no-op */ } _liveAdapter = null; }

            // ── STEP 5b: RESET PaperExecutionEngine ──────────────────────────────
            if (window.PaperExecutionEngine) {
                window.PaperExecutionEngine.reset();
            }

            // ── STEP 5b: RESET TELEMETRY EVENT ──────────────────────────────────
            // Write the first event into the now-empty buffer so the audit log
            // has a clear session boundary.
            const resetEvent = {
                id: 'evt_reset_' + Date.now(),
                time: new Date().toISOString(),
                scope: 'SYSTEM',
                label: 'Execution Engine',
                type: 'RESET',
                detail: {
                    message: 'Reset state executed',
                    previousEngineState: prevEngineState,
                    previousFeedState: prevFeedState,
                    newEngineState: 'IDLE',
                    newFeedState: 'IDLE',
                    startingCapital: startingCapital
                }
            };
            eventBuffer.push(resetEvent);
            try { localStorage.setItem(EVENT_KEY, JSON.stringify(eventBuffer)); } catch (e) { /* no-op */ }

            // ── STEP 6: REFRESH UI TO CLEAN STATE ───────────────────────────────
            this.refreshUI();
            this.showResetToast();

            // ── STEP 7: RESTART AUTO-REFRESH WITH NEW GENERATION ────────────────
            // startAutoRefresh now captures the NEW _resetGeneration, so only
            // the fresh timer can mutate state going forward.
            this.startAutoRefresh();

            console.log('[PaperExecution] Hard reset complete. Generation:', _resetGeneration,
                '| prev:', prevEngineState, '/', prevFeedState, '→ IDLE / IDLE');
        },

        handleToggleSlot(slotId, enabled) {
            const PM = window.PortfolioManager;
            if (!PM) return;

            PM.updateSlot(slotId, { enabled: enabled });

            const slot = runtimeStore[slotId];
            this.captureEvent('STRATEGY', slot ? slot.label : slotId, enabled ? 'ENABLED' : 'DISABLED', { reason: 'Manual operator action' });

            this.syncRealtimeState();
            this.refreshUI();
        },

        exportAuditLog() {
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(eventBuffer, null, 2));
            const downloadAnchorNode = document.createElement('a');
            downloadAnchorNode.setAttribute("href", dataStr);
            downloadAnchorNode.setAttribute("download", "pp_audit_log_" + Date.now() + ".json");
            document.body.appendChild(downloadAnchorNode); // required for firefox
            downloadAnchorNode.click();
            downloadAnchorNode.remove();
            this.captureEvent('SYSTEM', 'Operator', 'EXPORT_AUDIT_LOG', { count: eventBuffer.length });
        },

        refreshUIIfVisible() {
            if (document.getElementById('pe-sc-engine')) {
                this.refreshUI();
            }
        },

        injectStyles() {
            if (document.getElementById('pe-styles')) return;
            const style = document.createElement('style');
            style.id = 'pe-styles';
            style.textContent = `
                .pe-execution-layout { display:flex; flex-direction:column; gap:20px; color:#e2e8f0; font-family:'Inter', sans-serif; }
                
                /* Top Panels */
                .pe-top-panels { display:flex; gap:20px; }
                .pe-sys-status-panel, .pe-controls-panel { background:rgba(15,23,42,0.4); border:1px solid rgba(255,255,255,0.05); border-radius:12px; padding:16px; flex:1; }
                .pe-panel-title { font-size:0.65rem; font-weight:800; color:#64748b; text-transform:uppercase; letter-spacing:1px; margin-bottom:12px; }
                
                .pe-status-grid { display:flex; gap:24px; }
                .pe-status-item { display:flex; flex-direction:column; gap:6px; }
                .pe-label { font-size:0.6rem; font-weight:700; color:#94a3b8; text-transform:uppercase; letter-spacing:0.5px; }
                .pe-val-row { display:flex; align-items:center; gap:6px; font-size:0.8rem; font-weight:600; color:#cbd5e1; }
                .pe-sys-dot { width:8px; height:8px; border-radius:50%; }
                .pe-sd-green { background:#4ade80; box-shadow:0 0 8px rgba(74,222,128,0.4); }
                .pe-sd-yellow { background:#fbbf24; box-shadow:0 0 8px rgba(251,191,36,0.4); }
                .pe-sd-red { background:#f87171; box-shadow:0 0 8px rgba(248,113,113,0.4); }
                
                .pe-btn-group { display:flex; gap:8px; align-items:center; height:32px; }
                .pe-btn { border:none; border-radius:6px; padding:0 14px; font-size:0.75rem; font-weight:700; cursor:pointer; transition:all 0.2s; height:100%; display:flex; align-items:center; }
                .pe-btn:disabled { opacity:0.4; cursor:not-allowed; }
                .pe-btn-ok { background:#0f172a; border:1px solid #4ade80; color:#4ade80; }
                .pe-btn-ok:not(:disabled):hover { background:rgba(74,222,128,0.1); }
                .pe-btn-warn { background:#0f172a; border:1px solid #fbbf24; color:#fbbf24; }
                .pe-btn-warn:hover { background:rgba(251,191,36,0.1); }
                .pe-btn-danger { background:#7f1d1d; color:#fca5a5; border:1px solid #f87171; letter-spacing:0.5px; }
                .pe-btn-danger:hover { background:#991b1b; }
                .pe-btn-outline { background:transparent; border:1px solid rgba(255,255,255,0.1); color:#94a3b8; }
                .pe-btn-outline:hover { background:rgba(255,255,255,0.05); color:#f1f5f9; }

                /* Banners */
                .pe-safety-banner { padding:12px 16px; border-radius:8px; font-size:0.8rem; font-weight:600; }
                .pe-sb-warn { background:rgba(251,191,36,0.1); border:1px solid rgba(251,191,36,0.2); color:#fbbf24; }
        .pe-sb-danger { background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.2); color:#f87171; }
        .pe-sb-info { background:rgba(100,116,139,0.12); border:1px solid rgba(100,116,139,0.2); color:#94a3b8; }

                /* Portfolio Strip */
                .pe-portfolio-strip { display:flex; justify-content:space-between; background:rgba(30,41,59,0.5); padding:16px 20px; border-radius:12px; border:1px solid rgba(255,255,255,0.05); }
                .pe-port-item { display:flex; flex-direction:column; gap:4px; }
                .pe-port-lbl { font-size:0.6rem; color:#64748b; font-weight:800; text-transform:uppercase; letter-spacing:0.5px; }
                .pe-port-val { font-size:1rem; font-weight:700; color:#e2e8f0; font-family:'JetBrains Mono', monospace; }
                .pe-positive { color:#4ade80; }
                .pe-negative { color:#f87171; }

                .pe-section { display:flex; flex-direction:column; gap:12px; }
                .pe-section-header { font-size:0.75rem; font-weight:700; color:#94a3b8; letter-spacing:1px; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:8px; }
                
                .pe-table-wrap { background:rgba(15,23,42,0.3); border-radius:12px; border:1px solid rgba(255,255,255,0.05); overflow:hidden; }
                .pe-table { width:100%; border-collapse:collapse; font-size:0.8rem; }
                .pe-table th { text-align:left; padding:12px 16px; color:#64748b; font-size:0.65rem; text-transform:uppercase; border-bottom:1px solid rgba(255,255,255,0.05); }
                .pe-table td { padding:12px 16px; border-bottom:1px solid rgba(255,255,255,0.03); vertical-align:middle; }
                .pe-table tr:last-child td { border-bottom:none; }
                
                .pe-strat-name { font-weight:600; color:#f1f5f9; }
                .pe-strat-id { font-size:0.65rem; color:#475569; font-family:'JetBrains Mono', monospace; }
                .pe-pos-badge { padding:2px 8px; border-radius:4px; font-size:0.65rem; font-weight:800; }
                .pe-pos-long { background:rgba(34,197,94,0.15); color:#4ade80; }
                .pe-pos-none { background:rgba(100,116,139,0.1); color:#94a3b8; }
                
                .pe-value-main { font-weight:600; color:#e2e8f0; font-family:'JetBrains Mono', monospace; }
                .pe-value-sub { font-size:0.65rem; color:#64748b; margin-top:2px; font-family:'JetBrains Mono', monospace; }
                
                .pe-actions { display:flex; gap:6px; }
                .pe-btn-mini { border:none; border-radius:4px; padding:4px 8px; font-size:0.65rem; font-weight:700; cursor:pointer; transition:opacity 0.2s; }
                .pe-btn-mini:hover { opacity:0.8; }
                .pe-btn-disable { background:rgba(239,68,68,0.1); color:#f87171; }
                .pe-btn-enable { background:rgba(34,197,94,0.1); color:#4ade80; }

                .pe-grid { display:grid; grid-template-columns:1fr 1fr; gap:20px; }
                
                /* Execution Queue & Status Chips */
                .pe-paused-dim { opacity: 0.4; pointer-events: none; filter: grayscale(0.5); }
                .pe-paused-badge { background:rgba(251,191,36,0.15); color:#fbbf24; border:1px solid rgba(251,191,36,0.3); padding:4px 12px; border-radius:20px; font-size:0.65rem; font-weight:700; letter-spacing:0.5px; }

                .pe-q-status-chip { font-size:0.6rem; font-weight:800; text-transform:uppercase; letter-spacing:0.5px; padding:3px 8px; border-radius:4px; display:inline-block; }
                .pe-status-queued { color:#818cf8; background:rgba(99,102,241,0.1); border:1px solid rgba(99,102,241,0.2); }
                .pe-status-blocked { color:#f87171; background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.2); }

                /* Modals */
                .pe-modal-overlay { position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); backdrop-filter:blur(4px); display:flex; align-items:center; justify-content:center; z-index:10000; }
                .pe-modal-content { background:#0f172a; border:1px solid rgba(255,255,255,0.1); border-radius:12px; width:400px; padding:24px; box-shadow:0 20px 25px -5px rgba(0,0,0,0.5); display:flex; flex-direction:column; gap:16px; }
                .pe-modal-header { font-size:0.8rem; font-weight:800; color:#f87171; letter-spacing:1px; }
                .pe-modal-body { font-size:0.9rem; color:#cbd5e1; line-height:1.5; }
                .pe-modal-footer { display:flex; justify-content:flex-end; gap:12px; margin-top:8px; }

                /* Timeline */
                .pe-timeline { background:rgba(15,23,42,0.2); border-radius:12px; border:1px solid rgba(255,255,255,0.05); padding:16px; max-height:400px; overflow-y:auto; }
                .pe-timeline-item { display:flex; gap:12px; margin-bottom:12px; position:relative; }
                .pe-timeline-time { font-size:0.65rem; color:#475569; width:60px; flex-shrink:0; text-align:right; font-family:'JetBrains Mono', monospace; }
                .pe-timeline-dot { width:8px; height:8px; border-radius:50%; margin-top:4px; flex-shrink:0; background:#64748b; z-index:1; }
                .pe-dot-entry { background:#4ade80; box-shadow:0 0 8px rgba(74,222,128,0.4); }
                .pe-dot-exit, .pe-dot-stop, .pe-dot-error { background:#f87171; box-shadow:0 0 8px rgba(248,113,113,0.4); }
                .pe-dot-pause { background:#fbbf24; }
                .pe-dot-resume { background:#818cf8; }
                .pe-dot-system { background:#38bdf8; }
                
                .pe-timeline-content { flex:1; display:flex; flex-direction:column; gap:4px; font-size:0.75rem; background:rgba(255,255,255,0.02); padding:8px 12px; border-radius:6px; }
                .pe-timeline-label { font-weight:700; color:#cbd5e1; margin-right:6px; }
                .pe-timeline-type { font-weight:800; font-size:0.65rem; color:#64748b; background:rgba(255,255,255,0.05); padding:1px 6px; border-radius:4px; margin-right:6px;}
                .pe-timeline-detail { color:#94a3b8; font-size:0.7rem; }
                .pe-btn-icon { background:transparent; border:none; color:#64748b; cursor:pointer; }
                .pe-btn-icon:hover { color:#f1f5f9; }
                .pe-timeline-drawer { display:none; margin-top:6px; padding:8px; background:rgba(0,0,0,0.2); border-radius:4px; font-family:'JetBrains Mono', monospace; font-size:0.65rem; color:#818cf8; overflow-x:auto;}
                .pe-timeline-drawer.open { display:block; }
                
                .pe-dot-kill_switch { background:#f87171; box-shadow:0 0 12px rgba(248,113,113,0.6); }
                .pe-dot-emergency_stop { background:#f87171; box-shadow:0 0 12px rgba(248,113,113,0.6); }
                .pe-dot-tick_processed { background:#22d3ee; }
                .pe-dot-live\ paper\ execution\ ready { background:#4ade80; box-shadow:0 0 10px rgba(74,222,128,0.5); }
                .pe-dot-entry { background:#4ade80; box-shadow:0 0 8px rgba(74,222,128,0.4); }
                .pe-dot-exit { background:#f87171; }
                .pe-dot-hard_block { background:#f87171; box-shadow:0 0 10px rgba(248,113,113,0.6); }
                
                .pe-empty-state { padding:30px; text-align:center; color:#475569; font-size:0.8rem; font-style:italic; }

                /* Live Feed Debug Panel */
                .pe-debug-panel { margin-top:4px; padding-top:8px; border-top:1px solid rgba(255,255,255,0.04); }
                .pe-debug-grid { display:grid; grid-template-columns:auto 1fr; gap:3px 16px; font-size:0.62rem; font-family:'JetBrains Mono', monospace; }
                .pe-debug-key { color:#475569; font-weight:500; }
                .pe-debug-val { color:#94a3b8; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
            `;
            document.head.appendChild(style);
        },

        // ====================================================================
        // VERIFICATION TESTS (console-runnable)
        // ====================================================================
        /**
         * Run all 3 kill switch acceptance tests from the browser console:
         *   PaperExecution.selfTestKillSwitch()
         *
         * TEST A: After kill, ticks must stop increasing
         * TEST B: After kill, trade count must not change
         * TEST C: After kill, queue length must stay constant
         */
        selfTestKillSwitch() {
            console.group('[PaperExecution] Kill Switch Verification Tests');

            // --- Snapshot BEFORE kill ---
            const preTickTime = ExecutionStore.lastTickTime;
            const preTradeCount = engineInterface && engineInterface.getTradeCount
                ? engineInterface.getTradeCount()
                : -1;
            const preQueueLen = Object.values(runtimeStore).filter(
                rt => rt.pending && (rt.pending.has_pending_entry || rt.pending.has_pending_exit)
            ).length;

            console.log('Pre-kill snapshot:', { preTickTime, preTradeCount, preQueueLen });
            console.log('Engine state:', ExecutionStore.engineState);
            console.log('Kill switched:', ExecutionStore.killSwitched);

            // If not already killed, engage kill now
            if (!this.isKilled()) {
                console.log('Engaging kill switch for test...');
                // Directly set (bypass confirmation modal for test)
                ExecutionStore.killSwitched = true;
                ExecutionStore.engineState = 'EMERGENCY_STOP';
                if (engineInterface && engineInterface.stop) engineInterface.stop('EMERGENCY_STOP');
                if (this._refreshTimer) { clearInterval(this._refreshTimer); this._refreshTimer = null; }
                this.save();
            }

            // Wait 10 seconds then verify
            console.log('Waiting 10 seconds to verify no execution occurs...');
            setTimeout(() => {
                const postTickTime = ExecutionStore.lastTickTime;
                const postTradeCount = engineInterface && engineInterface.getTradeCount
                    ? engineInterface.getTradeCount()
                    : -1;
                const postQueueLen = Object.values(runtimeStore).filter(
                    rt => rt.pending && (rt.pending.has_pending_entry || rt.pending.has_pending_exit)
                ).length;

                const pollTimerRef = engineInterface && engineInterface.getPollTimer ? engineInterface.getPollTimer() : 'N/A';

                console.log('Post-kill snapshot (after 10s):', { postTickTime, postTradeCount, postQueueLen, pollTimerRef });

                // --- TEST A: Ticks stop ---
                const testA = postTickTime === preTickTime;
                console.log(`TEST A (ticks stop): ${testA ? '✅ PASS' : '❌ FAIL'} — tick before=${preTickTime} after=${postTickTime}`);

                // --- TEST B: Trade count unchanged ---
                const testB = postTradeCount === preTradeCount;
                console.log(`TEST B (trades frozen): ${testB ? '✅ PASS' : '❌ FAIL'} — trades before=${preTradeCount} after=${postTradeCount}`);

                // --- TEST C: Queue length unchanged ---
                const testC = postQueueLen === preQueueLen;
                console.log(`TEST C (queue frozen): ${testC ? '✅ PASS' : '❌ FAIL'} — queue before=${preQueueLen} after=${postQueueLen}`);

                // --- Summary ---
                const allPass = testA && testB && testC;
                console.log(`\nOVERALL: ${allPass ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
                console.log('Poll timer reference (should be null):', pollTimerRef);
                console.groupEnd();
            }, 10000);
        }
    };

    window.PaperExecution = PaperExecution;
    PaperExecution.injectStyles();
    PaperExecution.init();

})();
