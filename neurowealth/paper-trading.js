/* ========================================================================
   PAPER TRADING — Deployment Watchlist (Paper Mode Simulation)
   Simulates live operation using real candle polling + BacktestEngine signals.
   NO REAL ORDERS. NO BROKER APIS. NO REAL MONEY.
   ======================================================================== */

(function () {
    'use strict';

    // ====================================================================
    // CONSTANTS
    // ====================================================================
    const STORAGE_KEY = 'pp_paper_sessions_v1';
    const MAX_BUFFER = 2000;
    const POLL_INTERVAL = 45000; // 45s poll interval for better responsiveness
    const BACKOFF_INITIAL = 1000;
    const BACKOFF_MAX = 16000;

    // Timeframe → ms mapping
    const TF_MS = {
        '1m': 60000, '5m': 300000, '15m': 900000,
        '1h': 3600000, '4h': 14400000, '1d': 86400000, '1w': 604800000
    };

    // ====================================================================
    // STATE
    // ====================================================================
    let paperState = null;
    let pollTimer = null;
    let backoffMs = BACKOFF_INITIAL;
    let candleBuffer = [];
    let chartInstance = null;
    let _maxDrawdown = 0; // transient UI-only tracker, not persisted

    // Safety gate state (UI-only, not persisted to engine)
    let safetyConfig = { ddLimitPct: 25, maxLossStreak: 10, maxTradesPerDay: 10, armedAt: null };
    let safetyStatus = 'IDLE'; // IDLE | ARMED | RUNNING | PAUSED | AUTO_PAUSED
    let breachReason = null;

    // ====================================================================
    // HELPERS
    // ====================================================================
    function genId() {
        return 'pw_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
    }

    function fmtMoney(v) {
        return '$' + v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function fmtPct(v) {
        return (v >= 0 ? '+' : '') + v.toFixed(2) + '%';
    }

    function fmtTime(d) {
        if (!d) return '—';
        const dt = new Date(d);
        let h = dt.getHours();
        const m = String(dt.getMinutes()).padStart(2, '0');
        const ampm = h >= 12 ? 'PM' : 'AM';
        h = h % 12 || 12;
        return `${String(h).padStart(2, '0')}:${m} ${ampm}`;
    }

    function addLog(msg, type = 'info') {
        if (!paperState) return;
        const entry = { time: new Date().toISOString(), msg, type };
        paperState.logs.push(entry);
        if (paperState.logs.length > 500) paperState.logs.shift();
        renderLogs();
    }

    // ====================================================================
    // CANDIDATE LOADING
    // ====================================================================
    function loadCandidates() {
        const candidates = [];

        // Strategy Versions
        try {
            const vRaw = localStorage.getItem('pp_backtest_versions_v1');
            if (vRaw) {
                const versions = JSON.parse(vRaw);
                if (Array.isArray(versions)) {
                    versions.forEach(v => {
                        if (v && v.id && v.config) {
                            candidates.push({
                                id: v.id,
                                label: `[Version] ${v.name}`,
                                type: 'version',
                                config: v.config
                            });
                        }
                    });
                }
            }
        } catch (e) { console.warn('Paper: failed to load versions', e); }

        // Run Snapshots
        try {
            const rRaw = localStorage.getItem('pp_backtest_runs_v1');
            if (rRaw) {
                const runs = JSON.parse(rRaw);
                if (Array.isArray(runs)) {
                    runs.forEach(r => {
                        if (r && r.id && r.config) {
                            candidates.push({
                                id: r.id,
                                label: `[Run] ${r.name}`,
                                type: 'run',
                                config: r.config
                            });
                        }
                    });
                }
            }
        } catch (e) { console.warn('Paper: failed to load runs', e); }

        return candidates;
    }

    function extractConfig(candidateConfig) {
        const c = candidateConfig;
        return {
            asset: c.asset || 'BTC-USD',
            timeframe: c.timeframe || '1d',
            startingCapital: parseFloat(c.startingCapital || c.capital || 10000),
            riskPercent: parseFloat(c.riskPercent || (c.positionSize ? c.positionSize / 100 : 0.02)),
            stopPercent: parseFloat(c.stopPercent || (c.stopLoss ? c.stopLoss / 100 : 0.02)),
            slippagePct: parseFloat(c.slippagePct || (c.slippage ? c.slippage / 100 : 0.001)),
            feeRate: parseFloat(c.feeRate || (c.fees ? c.fees / 100 : 0.001))
        };
    }

    // ====================================================================
    // PAPER STATE MANAGEMENT
    // ====================================================================
    function createPaperState(candidateId, config) {
        // Capture preset identity (Versioning v1)
        let presetIdentity = null;
        try {
            if (window.PresetVersioning) {
                presetIdentity = window.PresetVersioning.snapshotIdentity();
            }
        } catch (e) { console.warn('Paper: PresetVersioning snapshot failed:', e); }

        return {
            id: genId(),
            candidateId: candidateId,
            config: config,
            isRunning: false,
            status: 'OFF', // OFF | RUNNING | ERROR
            startCapital: config.startingCapital,
            capital: config.startingCapital,
            inPosition: false,
            entryPrice: 0,
            entryTime: null,
            shares: 0,
            stopPrice: 0,
            riskAmount: 0,
            openPnl: 0,
            realizedPnl: 0,
            peakEquity: config.startingCapital,
            currentDrawdown: 0,
            tradeLog: [],
            equityCurve: [{ time: new Date().toISOString(), value: config.startingCapital }],
            logs: [],
            lastUpdated: null,
            lastSignal: null,
            lastSignalTime: null,
            pendingEntry: false,
            pendingExit: false,
            createdAt: new Date().toISOString(),
            // Preset Versioning v1
            preset_identity: presetIdentity
        };
    }

    function savePaperState() {
        if (!paperState) return;
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(paperState));
        } catch (e) {
            console.warn('Paper: localStorage save failed', e);
        }
    }

    function loadPaperState() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && parsed.id) return parsed;
            }
        } catch (e) { console.warn('Paper: localStorage load failed', e); }
        return null;
    }

    function clearPaperState() {
        paperState = null;
        candleBuffer = [];
        localStorage.removeItem(STORAGE_KEY);
    }

    // ====================================================================
    // DATA FEED — POLLING
    // ====================================================================
    async function fetchLatestCandles() {
        if (!paperState || !paperState.config) return null;

        const cfg = paperState.config;
        const tfMs = TF_MS[cfg.timeframe] || 86400000;
        const now = Date.now();
        // Fetch last 500 candles worth of data
        const startMs = now - (500 * tfMs);

        const symbolMap = {
            'BTC-USD': 'BTCUSDT', 'BTC-USDT': 'BTCUSDT',
            'ETH-USD': 'ETHUSDT', 'ETH-USDT': 'ETHUSDT',
            'SOL-USD': 'SOLUSDT', 'SOL-USDT': 'SOLUSDT'
        };

        const symbol = symbolMap[cfg.asset];
        if (!symbol) {
            throw new Error(`Unsupported asset for paper trading: ${cfg.asset}`);
        }

        const tfMap = {
            '1m': '1m', '5m': '5m', '15m': '15m',
            '1h': '1h', '4h': '4h', '1d': '1d', '1w': '1w'
        };
        const interval = tfMap[cfg.timeframe];
        if (!interval) throw new Error(`Unsupported timeframe: ${cfg.timeframe}`);

        const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&startTime=${startMs}&endTime=${now}&limit=500`;
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();

        return data.map(k => ({
            date: new Date(k[0]),
            open: parseFloat(k[1]),
            high: parseFloat(k[2]),
            low: parseFloat(k[3]),
            close: parseFloat(k[4]),
            volume: parseFloat(k[5]),
            closeTime: k[6]
        }));
    }

    function mergeCandles(newCandles) {
        if (!newCandles || newCandles.length === 0) return 0;

        const existingTimes = new Set(candleBuffer.map(c => c.date.getTime()));
        let added = 0;

        for (const candle of newCandles) {
            const t = candle.date.getTime();
            if (!existingTimes.has(t)) {
                candleBuffer.push(candle);
                existingTimes.add(t);
                added++;
            } else {
                // Update the last candle in case it's still open
                const idx = candleBuffer.findIndex(c => c.date.getTime() === t);
                if (idx >= 0) {
                    candleBuffer[idx] = candle;
                }
            }
        }

        // Sort by time
        candleBuffer.sort((a, b) => a.date.getTime() - b.date.getTime());

        // Cap buffer
        if (candleBuffer.length > MAX_BUFFER) {
            candleBuffer = candleBuffer.slice(candleBuffer.length - MAX_BUFFER);
        }

        return added;
    }

    // ====================================================================
    // SIGNAL GENERATION + PAPER EXECUTION
    // ====================================================================
    function processSignals() {
        if (!paperState || candleBuffer.length < 60) return;

        // --- GUARDRAIL: Block execution if not RUNNING ---
        if (window.PaperExecution && !window.PaperExecution.isExecutionAllowed()) {
            return; // No signal processing in PAUSED or EMERGENCY_STOP
        }

        const cfg = paperState.config;
        const n = candleBuffer.length;

        // --- Execute pending entry on current bar's open ---
        if (paperState.pendingEntry && !paperState.inPosition) {
            const currentCandle = candleBuffer[n - 1];
            const rawPrice = currentCandle.open;
            const execPrice = rawPrice * (1.0 + cfg.slippagePct);

            const stopPrice = execPrice * (1.0 - cfg.stopPercent);
            const stopDistance = execPrice - stopPrice;
            const riskAmount = paperState.capital * cfg.riskPercent;
            let shares = riskAmount / stopDistance;

            const maxShares = (paperState.capital * (1.0 - cfg.feeRate)) / execPrice;
            if (shares > maxShares) shares = maxShares;

            if (shares > 0 && execPrice > 0) {
                const cost = shares * execPrice;
                const fee = cost * cfg.feeRate / (1.0 - cfg.feeRate);
                paperState.capital -= cost + fee;
                paperState.entryPrice = execPrice;
                paperState.entryTime = currentCandle.date.toISOString();
                paperState.shares = shares;
                paperState.stopPrice = stopPrice;
                paperState.riskAmount = riskAmount;
                paperState.inPosition = true;
                paperState.pendingEntry = false;

                addLog(`ENTRY EXECUTED @ ${fmtMoney(execPrice)} | ${shares.toFixed(6)} shares | Stop: ${fmtMoney(stopPrice)}`, 'trade');
                if (window.PaperExecution) {
                    window.PaperExecution.captureEvent('STRATEGY', paperState.config.asset, 'ENTRY', {
                        price: execPrice,
                        shares: shares,
                        stopPrice: stopPrice
                    });
                }
                paperState.tradeLog.push({
                    type: 'ENTRY',
                    time: currentCandle.date.toISOString(),
                    price: execPrice,
                    shares: shares,
                    stopPrice: stopPrice
                });
            }
        }

        // --- Execute pending exit on current bar's open ---
        if (paperState.pendingExit && paperState.inPosition) {
            const currentCandle = candleBuffer[n - 1];
            const rawPrice = currentCandle.open;
            const execPrice = rawPrice * (1.0 - cfg.slippagePct);

            const grossValue = paperState.shares * execPrice;
            const netValue = grossValue * (1.0 - cfg.feeRate);
            const costBasis = paperState.shares * paperState.entryPrice;
            const entryFee = costBasis * cfg.feeRate / (1.0 - cfg.feeRate);
            const totalCost = costBasis + entryFee;
            const pnl = netValue - totalCost;
            const returnPct = ((netValue - totalCost) / totalCost) * 100;

            paperState.capital += netValue;
            paperState.realizedPnl += pnl;

            addLog(`EXIT EXECUTED @ ${fmtMoney(execPrice)} | PnL: ${fmtMoney(pnl)} (${fmtPct(returnPct)}) | Reason: SIGNAL`, 'trade');
            if (window.PaperExecution) {
                window.PaperExecution.captureEvent('STRATEGY', paperState.config.asset, 'EXIT', {
                    price: execPrice,
                    pnl: pnl,
                    returnPct: returnPct,
                    reason: 'SIGNAL'
                });
            }
            paperState.tradeLog.push({
                type: 'EXIT',
                time: currentCandle.date.toISOString(),
                price: execPrice,
                pnl: pnl,
                returnPct: returnPct,
                reason: 'SIGNAL',
                entryPrice: paperState.entryPrice,
                entryTime: paperState.entryTime,
                shares: paperState.shares
            });

            paperState.shares = 0;
            paperState.inPosition = false;
            paperState.entryPrice = 0;
            paperState.entryTime = null;
            paperState.stopPrice = 0;
            paperState.pendingExit = false;
        }

        // --- Check stop-loss on latest candle ---
        if (paperState.inPosition) {
            const latestCandle = candleBuffer[n - 1];
            if (latestCandle.low <= paperState.stopPrice) {
                const execPrice = paperState.stopPrice * (1.0 - cfg.slippagePct);
                const grossValue = paperState.shares * execPrice;
                const netValue = grossValue * (1.0 - cfg.feeRate);
                const costBasis = paperState.shares * paperState.entryPrice;
                const entryFee = costBasis * cfg.feeRate / (1.0 - cfg.feeRate);
                const totalCost = costBasis + entryFee;
                const pnl = netValue - totalCost;
                const returnPct = ((netValue - totalCost) / totalCost) * 100;

                paperState.capital += netValue;
                paperState.realizedPnl += pnl;

                addLog(`STOP-LOSS HIT @ ${fmtMoney(execPrice)} | PnL: ${fmtMoney(pnl)} (${fmtPct(returnPct)})`, 'trade');
                if (window.PaperExecution) {
                    window.PaperExecution.captureEvent('STRATEGY', paperState.config.asset, 'STOP', {
                        price: execPrice,
                        pnl: pnl,
                        returnPct: returnPct,
                        reason: 'STOP_LOSS'
                    });
                }
                paperState.tradeLog.push({
                    type: 'EXIT',
                    time: latestCandle.date.toISOString(),
                    price: execPrice,
                    pnl: pnl,
                    returnPct: returnPct,
                    reason: 'STOP',
                    entryPrice: paperState.entryPrice,
                    entryTime: paperState.entryTime,
                    shares: paperState.shares
                });

                paperState.shares = 0;
                paperState.inPosition = false;
                paperState.entryPrice = 0;
                paperState.entryTime = null;
                paperState.stopPrice = 0;
            }
        }

        // --- Generate signal on last CLOSED candle (second-to-last) ---
        const signalIdx = n - 2; // closed candle
        if (signalIdx >= 55) {
            const signal = BacktestEngine.generateSignalVolBreakout(candleBuffer, signalIdx, paperState.inPosition);

            if (signal.enter && !paperState.inPosition && !paperState.pendingEntry) {
                paperState.pendingEntry = true;
                paperState.lastSignal = 'ENTRY';
                paperState.lastSignalTime = candleBuffer[signalIdx].date.toISOString();
                addLog(`ENTRY SIGNAL detected on closed candle @ ${fmtTime(candleBuffer[signalIdx].date)} — will execute on next bar open`, 'signal');

                if (window.PaperExecution) {
                    window.PaperExecution.captureEvent('STRATEGY', paperState.config.asset, 'SIGNAL', {
                        type: 'ENTRY',
                        reason: 'Volume Breakout'
                    });
                }
            }
            if (signal.exit && paperState.inPosition && !paperState.pendingExit) {
                paperState.pendingExit = true;
                paperState.lastSignal = 'EXIT';
                paperState.lastSignalTime = candleBuffer[signalIdx].date.toISOString();
                addLog(`EXIT SIGNAL detected on closed candle @ ${fmtTime(candleBuffer[signalIdx].date)} — will execute on next bar open`, 'signal');

                if (window.PaperExecution) {
                    window.PaperExecution.captureEvent('STRATEGY', paperState.config.asset, 'SIGNAL', {
                        type: 'EXIT',
                        reason: 'Exit Condition Met'
                    });
                }
            }
        }

        // --- Update equity ---
        let currentEquity = paperState.capital;
        if (paperState.inPosition && candleBuffer.length > 0) {
            const lastClose = candleBuffer[n - 1].close;
            currentEquity += paperState.shares * lastClose;
            paperState.openPnl = paperState.shares * (lastClose - paperState.entryPrice);
        } else {
            paperState.openPnl = 0;
        }

        // Peak / drawdown
        if (currentEquity > paperState.peakEquity) {
            paperState.peakEquity = currentEquity;
        }
        paperState.currentDrawdown = paperState.peakEquity > 0
            ? ((paperState.peakEquity - currentEquity) / paperState.peakEquity) * 100
            : 0;

        // Equity curve point
        paperState.equityCurve.push({
            time: new Date().toISOString(),
            value: currentEquity
        });
        // Cap equity curve
        if (paperState.equityCurve.length > 5000) {
            paperState.equityCurve = paperState.equityCurve.slice(-5000);
        }

        // ── LIVE STABILITY SIGNAL WIRING (v1.1) ──
        if (window.PaperExecution) {
            const trades = paperState.tradeLog.filter(t => t.type === 'EXIT');

            // Compute rolling loss streak
            let lossStreak = 0;
            for (let i = trades.length - 1; i >= 0; i--) {
                if (trades[i].pnl < 0) lossStreak++;
                else break;
            }

            // Compute last slippage deviation (%)
            // Deviation = (Actual Slippage / Modeled Slippage) * 100 - 100
            // Here we just use a simplified "Slippage Spike" if it's > 2x modeled.
            let lastSlippageDev = 0;
            if (trades.length > 0) {
                const lastTrade = trades[trades.length - 1];
                // In this sim, slippage is static. To "simulate" a spike, we'd need to inject it.
                // For now, we report the state.
                lastSlippageDev = 0;
            }

            // Compute equity drift vs backtest (simplified: vs mean return)
            const btMeanReturnPct = 0.5; // Placeholder for backtest mean return per trade
            const actualReturnPct = paperState.startCapital > 0 ? (paperState.realizedPnl / paperState.startCapital) * 100 : 0;
            const expectedReturnPct = trades.length * btMeanReturnPct;
            const drift = actualReturnPct - expectedReturnPct;

            window.PaperExecution.updateStabilityMetrics({
                rollingDrawdown: paperState.currentDrawdown,
                rollingLossStreak: lossStreak,
                rollingEquityDrift: drift,
                liveSlippageDeviation: lastSlippageDev
            });
        }
    }

    // ====================================================================
    // SEED EQUITY CHART FROM HISTORICAL CANDLES
    // ====================================================================
    function seedEquityCurveFromCandles() {
        if (!paperState || candleBuffer.length < 10) return;

        // Robust capital lookup with fallbacks
        const startCap = paperState.startCapital
            || (paperState.config && paperState.config.startingCapital)
            || paperState.capital
            || 10000;

        // Use the last ~100 candles to build a historical equity view
        const candles = candleBuffer.slice(-100);
        const basePrice = candles[0].close;

        if (!basePrice || basePrice <= 0) return;

        // Build equity curve: simulate price-relative equity from first candle
        const seeded = candles.map(c => ({
            time: c.date.toISOString(),
            value: startCap * (c.close / basePrice)
        }));

        // Replace existing curve with seeded data
        paperState.equityCurve = seeded;
        console.log('Paper: Seeded equity curve with', seeded.length, 'points, startCap:', startCap);
    }

    // ====================================================================
    // POLL LOOP
    // ====================================================================
    let isFirstPoll = true;

    async function pollOnce() {
        if (!paperState || !paperState.isRunning) return;

        // --- Console Operator Safety Hook ---
        if (window.PaperExecution) {
            if (window.PaperExecution.isKilled()) {
                addLog('\u2620\uFE0F EMERGENCY_STOP: Polling halted permanently.', 'error');
                stopPolling('EMERGENCY_STOP');
                return;
            }
            if (window.PaperExecution.isPaused()) {
                // Re-schedule lightly without fetching or executing
                pollTimer = setTimeout(pollOnce, 5000);
                return;
            }
        }

        try {
            addLog('Polling latest candles...', 'poll');
            const newCandles = await fetchLatestCandles();
            const added = mergeCandles(newCandles);
            paperState.lastUpdated = new Date().toISOString();

            // On first poll, seed the equity chart from historical candles
            if (isFirstPoll && candleBuffer.length >= 10) {
                seedEquityCurveFromCandles();
                isFirstPoll = false;
                addLog(`Fetched initial dataset (${newCandles ? newCandles.length : 0} candles)`, 'poll');
                addLog('Waiting for new closed candle...', 'system');
            } else {
                addLog(`Poll complete — ${added} new candles`, 'poll');
            }

            // Process signals
            processSignals();

            // Reset backoff on success
            backoffMs = BACKOFF_INITIAL;

            // Save & render
            savePaperState();
            renderDashboard();

            // Check safety breaches after processing
            checkSafetyBreaches();

        } catch (e) {
            addLog(`Poll error: ${e.message} (retry in ${backoffMs / 1000}s)`, 'error');
            paperState.status = 'ERROR';
            renderStatusBadge();

            // Exponential backoff
            backoffMs = Math.min(backoffMs * 2, BACKOFF_MAX);
        }

        // Schedule next poll
        if (paperState && paperState.isRunning) {
            // Constant poll interval (45s) gives much better visual feedback
            const interval = POLL_INTERVAL;
            pollTimer = setTimeout(pollOnce, paperState.status === 'ERROR' ? backoffMs : interval);
        }
    }

    function startPolling() {
        if (!paperState) return;
        // --- GUARDRAIL: Cannot start while EMERGENCY_STOP is active ---
        if (window.PaperExecution && window.PaperExecution.isKilled()) {
            addLog('\u2620\uFE0F Cannot start: EMERGENCY_STOP active. Reset state first.', 'error');
            return;
        }
        if (paperState.isRunning && pollTimer) {
            console.log('Paper: Polling already active');
            return;
        }
        isFirstPoll = true;
        paperState.isRunning = true;
        paperState.status = 'RUNNING';
        safetyStatus = 'RUNNING';
        backoffMs = BACKOFF_INITIAL;
        addLog('Session initialized', 'system');
        addLog('Waiting for new closed candle...', 'system');
        savePaperState();
        renderDashboard();
        pollOnce();
    }

    function stopPolling(newStatus) {
        if (pollTimer) {
            clearTimeout(pollTimer);
            pollTimer = null;
        }
        if (paperState) {
            paperState.isRunning = false;
            paperState.status = newStatus || 'OFF';
            paperState.pendingEntry = false;
            paperState.pendingExit = false;
            addLog('Paper Watch stopped', 'system');
            savePaperState();
            // ---- Strategy Health Memory: auto-record completed paper session ----
            if (window.StrategyHealth && paperState.tradeLog && paperState.tradeLog.length > 0) {
                try {
                    paperState._safetyStatus = safetyStatus;
                    paperState._breachReason = breachReason;
                    window.StrategyHealth.recordPaperSession(paperState);
                } catch (e) { console.warn('StrategyHealth paper record failed:', e); }
            }
        }
        safetyStatus = (newStatus === 'PAUSED' || newStatus === 'AUTO_PAUSED') ? newStatus : 'IDLE';
        renderDashboard();
    }

    // ====================================================================
    // UI RENDERING
    // ====================================================================
    function renderStatusBadge() {
        const badge = document.getElementById('pw-status-badge');
        if (!badge) return;
        const status = safetyStatus || 'IDLE';
        const colors = {
            'IDLE': { bg: 'rgba(100,116,139,0.15)', color: '#94a3b8', dot: '#64748b' },
            'ARMED': { bg: 'rgba(99,102,241,0.15)', color: '#a5b4fc', dot: '#6366f1' },
            'RUNNING': { bg: 'rgba(34,197,94,0.15)', color: '#4ade80', dot: '#22c55e' },
            'PAUSED': { bg: 'rgba(251,191,36,0.15)', color: '#fbbf24', dot: '#f59e0b' },
            'AUTO_PAUSED': { bg: 'rgba(239,68,68,0.15)', color: '#f87171', dot: '#ef4444' },
            'ERROR': { bg: 'rgba(239,68,68,0.15)', color: '#f87171', dot: '#ef4444' }
        };
        const c = colors[status] || colors['IDLE'];
        const pulseStates = ['RUNNING', 'ARMED'];
        const displayLabel = status === 'AUTO_PAUSED' ? 'AUTO-PAUSED' : status;
        badge.innerHTML = `<span style="width:8px;height:8px;border-radius:50%;background:${c.dot};display:inline-block;margin-right:6px;${pulseStates.includes(status) ? 'animation:bt-pulse 2s ease-in-out infinite;' : ''}"></span>${displayLabel}`;
        badge.style.background = c.bg;
        badge.style.color = c.color;

        // Preset Versioning v1 — show version in a small badge next to status
        try {
            if (paperState && paperState.preset_identity && paperState.preset_identity.preset_version) {
                const pvBadge = document.getElementById('pw-pv-badge');
                if (pvBadge) {
                    pvBadge.textContent = 'v' + paperState.preset_identity.preset_version;
                    pvBadge.style.display = 'inline-flex';
                } else {
                    const newBadge = document.createElement('span');
                    newBadge.id = 'pw-pv-badge';
                    newBadge.className = 'pv-paper-badge';
                    newBadge.textContent = 'v' + paperState.preset_identity.preset_version;
                    newBadge.style.marginLeft = '6px';
                    badge.parentNode.insertBefore(newBadge, badge.nextSibling);
                }
            }
        } catch (e) { /* non-fatal */ }
    }

    function renderDashboard() {
        renderStatusBadge();
        renderLiveReadiness();
        renderSafetyStatus();
        renderPositionStats();
        renderStateTimeline();
        computeAndRenderHealthWarnings();
        renderAnomalyFlags();
        renderTradeLog();
        renderEquityChart();
        renderLastUpdated();
        updateButtonStates();
    }

    function updateButtonStates() {
        const idleCtrl = document.getElementById('pw-controls-idle');
        const runCtrl = document.getElementById('pw-controls-running');
        const pauseCtrl = document.getElementById('pw-controls-paused');
        const armPanel = document.getElementById('pw-arming-panel');
        const safetyPanel = document.getElementById('pw-safety-panel');
        const breachBanner = document.getElementById('pw-breach-banner');
        const sel = document.getElementById('pw-candidate-select');

        // Hide all control groups first
        if (idleCtrl) idleCtrl.style.display = 'none';
        if (runCtrl) runCtrl.style.display = 'none';
        if (pauseCtrl) pauseCtrl.style.display = 'none';

        // Show correct controls based on safetyStatus
        switch (safetyStatus) {
            case 'RUNNING':
                if (runCtrl) runCtrl.style.display = 'flex';
                if (safetyPanel) safetyPanel.style.display = 'block';
                if (breachBanner) breachBanner.style.display = 'none';
                break;
            case 'PAUSED':
                if (pauseCtrl) pauseCtrl.style.display = 'flex';
                if (safetyPanel) safetyPanel.style.display = 'block';
                if (breachBanner) breachBanner.style.display = 'none';
                break;
            case 'AUTO_PAUSED':
                if (pauseCtrl) pauseCtrl.style.display = 'flex';
                if (safetyPanel) safetyPanel.style.display = 'block';
                if (breachBanner) {
                    breachBanner.style.display = 'flex';
                    const txt = document.getElementById('pw-breach-text');
                    if (txt) txt.textContent = 'Auto-paused: Safety limit breached (' + (breachReason || 'Unknown') + ').';
                }
                break;
            case 'ARMED':
                // Arming panel is shown separately
                if (safetyPanel) safetyPanel.style.display = 'none';
                if (breachBanner) breachBanner.style.display = 'none';
                break;
            default: // IDLE
                if (idleCtrl) idleCtrl.style.display = 'block';
                if (safetyPanel) safetyPanel.style.display = 'none';
                if (breachBanner) breachBanner.style.display = 'none';
                break;
        }

        // Disable candidate select when running/paused
        if (sel) {
            const locked = safetyStatus === 'RUNNING' || safetyStatus === 'PAUSED' || safetyStatus === 'AUTO_PAUSED';
            sel.disabled = locked;
            sel.style.opacity = locked ? '0.7' : '1';
        }
    }

    function renderLastUpdated() {
        const el = document.getElementById('pw-last-updated');
        if (!el) return;
        el.textContent = paperState && paperState.lastUpdated
            ? 'Last updated: ' + fmtTime(paperState.lastUpdated)
            : 'Last updated: —';
    }

    function renderPositionStats() {
        if (!paperState) return;

        const currentEquity = paperState.inPosition
            ? paperState.capital + (paperState.shares * (candleBuffer.length > 0 ? candleBuffer[candleBuffer.length - 1].close : paperState.entryPrice))
            : paperState.capital;

        const positionStatus = paperState.inPosition ? 'LONG' : 'FLAT';
        const posClass = paperState.inPosition ? 'pw-pos-long' : 'pw-pos-flat';
        const equityColor = currentEquity >= paperState.startCapital ? '#4ade80' : '#f87171';
        const ddColor = paperState.currentDrawdown > 0 ? '#f87171' : '#4ade80';
        const ddText = paperState.currentDrawdown > 0 ? '-' + paperState.currentDrawdown.toFixed(2) + '%' : '0.00%';
        const tradeCount = paperState.tradeLog.filter(t => t.type === 'EXIT').length;
        const lastSignalText = paperState.lastSignal || '\u2014';
        const lastSignalTime = paperState.lastSignalTime ? fmtTime(paperState.lastSignalTime) : '\u2014';

        // Update individual stat cells by class within the container
        const container = document.getElementById('pw-position-stats');
        if (!container) return;

        const cells = container.querySelectorAll('.pw-stat-cell');
        if (cells.length >= 6) {
            // Cell 0: Position
            cells[0].querySelector('.pw-stat-value').className = 'pw-stat-value ' + posClass;
            cells[0].querySelector('.pw-stat-value').textContent = positionStatus;
            // Cell 1: Paper Equity
            cells[1].querySelector('.pw-stat-value').style.color = equityColor;
            cells[1].querySelector('.pw-stat-value').textContent = fmtMoney(currentEquity);
            // Cell 2: Drawdown
            cells[2].querySelector('.pw-stat-value').style.color = ddColor;
            cells[2].querySelector('.pw-stat-value').textContent = ddText;
            // Cell 3: Last Signal (type)
            cells[3].querySelector('.pw-stat-value').textContent = lastSignalText;
            // Cell 4: Last Signal (time)
            cells[4].querySelector('.pw-stat-value').textContent = lastSignalTime;
            // Cell 5: Trades
            cells[5].querySelector('.pw-stat-value').textContent = tradeCount;
        }
    }

    function renderTradeLog() {
        const container = document.getElementById('pw-trade-log');
        if (!container || !paperState) return;

        const exits = paperState.tradeLog.filter(t => t.type === 'EXIT').reverse().slice(0, 20);

        if (exits.length === 0) {
            container.innerHTML = '<div class="pw-tradelog-empty">No trades yet.</div>';
            return;
        }

        let html = '';
        exits.forEach(t => {
            const pnlColor = t.pnl >= 0 ? '#4ade80' : '#f87171';
            const reasonBadge = `<span class="pw-reason-badge pw-reason-${t.reason.toLowerCase()}">${t.reason}</span>`;
            html += `<div class="pw-trade-row">
                <span>${fmtTime(t.time)}</span>
                <span>${reasonBadge}</span>
                <span>${fmtMoney(t.entryPrice)}</span>
                <span>${fmtMoney(t.price)}</span>
                <span style="color:${pnlColor}">${fmtMoney(t.pnl)}</span>
            </div>`;
        });

        container.innerHTML = html;
    }

    function renderEquityChart() {
        const canvas = document.getElementById('pw-equity-canvas');
        if (!canvas || !paperState || paperState.equityCurve.length < 2) return;

        const ctx = canvas.getContext('2d');
        const parent = canvas.parentElement;
        const dpr = window.devicePixelRatio || 1;
        canvas.width = parent.clientWidth * dpr;
        canvas.height = parent.clientHeight * dpr;
        ctx.scale(dpr, dpr);
        const W = parent.clientWidth;
        const H = parent.clientHeight;

        ctx.clearRect(0, 0, W, H);

        const curve = paperState.equityCurve;
        const values = curve.map(p => p.value);
        const minV = Math.min(...values) * 0.995;
        const maxV = Math.max(...values) * 1.005;
        const range = maxV - minV || 1;

        const padL = 60, padR = 10, padT = 10, padB = 28;
        const chartW = W - padL - padR;
        const chartH = H - padT - padB;

        // Grid lines
        ctx.strokeStyle = 'rgba(255,255,255,0.04)';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 4; i++) {
            const y = padT + (chartH * i / 4);
            ctx.beginPath();
            ctx.moveTo(padL, y);
            ctx.lineTo(W - padR, y);
            ctx.stroke();

            const val = maxV - (range * i / 4);
            ctx.fillStyle = '#64748b';
            ctx.font = '10px Inter, sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText(fmtMoney(val), padL - 6, y + 3);
        }

        // Equity line
        const isProfit = values[values.length - 1] >= values[0];
        const lineColor = isProfit ? '#4ade80' : '#f87171';

        ctx.beginPath();
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = 2;

        for (let i = 0; i < values.length; i++) {
            const x = padL + (i / (values.length - 1)) * chartW;
            const y = padT + ((maxV - values[i]) / range) * chartH;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();

        // Fill under line
        const lastX = padL + chartW;
        ctx.lineTo(lastX, padT + chartH);
        ctx.lineTo(padL, padT + chartH);
        ctx.closePath();
        const grad = ctx.createLinearGradient(0, padT, 0, padT + chartH);
        grad.addColorStop(0, isProfit ? 'rgba(74, 222, 128, 0.15)' : 'rgba(248, 113, 113, 0.15)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.fill();

        // X-axis time labels
        ctx.fillStyle = '#64748b';
        ctx.font = '10px Inter, sans-serif';
        ctx.textAlign = 'center';
        const labelCount = Math.min(5, curve.length);
        for (let i = 0; i < labelCount; i++) {
            const idx = Math.floor(i * (curve.length - 1) / (labelCount - 1));
            const x = padL + (idx / (curve.length - 1)) * chartW;
            const dt = new Date(curve[idx].time);
            let h = dt.getHours();
            const ampm = h >= 12 ? 'PM' : 'AM';
            h = h % 12 || 12;
            ctx.fillText(`${h} ${ampm}`, x, padT + chartH + 14);
        }
    }

    function renderLogs() {
        const container = document.getElementById('pw-logs-body');
        if (!container || !paperState) return;

        const recentLogs = paperState.logs.slice(-100).reverse();
        let html = '';
        recentLogs.forEach(l => {
            html += `<div class="pw-log-entry">
                <span class="pw-log-time">${fmtTime(l.time)}</span>
                <span class="pw-log-msg">\u2014 ${l.msg}</span>
            </div>`;
        });
        container.innerHTML = html || '<div style="color:#64748b;font-style:italic;padding:8px;">No logs yet.</div>';
    }

    // ====================================================================
    // LIVE-READINESS BADGE
    // ====================================================================
    function renderLiveReadiness() {
        const modeEl = document.getElementById('pw-ready-mode');
        const signalsEl = document.getElementById('pw-ready-signals');
        const ddEl = document.getElementById('pw-ready-dd');
        if (!modeEl || !signalsEl || !ddEl) return;

        if (!paperState) {
            modeEl.innerHTML = 'PAPER ONLY';
            signalsEl.textContent = '\u2014';
            signalsEl.className = 'pw-readiness-value';
            ddEl.textContent = '\u2014 / \u2014';
            return;
        }

        // Mode line
        const sel = document.getElementById('pw-candidate-select');
        let candidateLabel = '';
        let strategyKey = 'CUSTOM';
        if (sel && sel.selectedIndex >= 0) {
            candidateLabel = sel.options[sel.selectedIndex].textContent || '';
            strategyKey = sel.value || 'CUSTOM';
        }
        const isProd = /production/i.test(candidateLabel);

        let modeHtml = 'PAPER ONLY';
        if (isProd) modeHtml += ' <span class="pw-preset-badge">PRESET: PARITY-VERIFIED</span>';

        // Add Live Tier if CapitalReadiness is available
        if (window.CapitalReadiness && window.CapitalReadiness.getTier) {
            const tier = window.CapitalReadiness.getTier(strategyKey);
            modeHtml += ` <span class="pw-readiness-tier-badge" style="margin-left:8px; opacity:0.8; font-size:10px; border:1px solid rgba(255,255,255,0.2); padding:2px 6px; border-radius:4px;">${tier}</span>`;
        }

        modeEl.innerHTML = modeHtml;

        // Signal frequency
        const tradeCount = paperState.tradeLog.filter(t => t.type === 'EXIT').length;
        const sessionMs = paperState.createdAt ? (Date.now() - new Date(paperState.createdAt).getTime()) : 0;
        const sessionHours = sessionMs / 3600000;
        const isRunning = paperState.isRunning;

        if (!isRunning) {
            signalsEl.textContent = '\u2014';
            signalsEl.className = 'pw-readiness-value';
        } else if (tradeCount === 0 && sessionHours > 2) {
            signalsEl.textContent = 'None';
            signalsEl.className = 'pw-readiness-value pw-signal-none';
        } else if (tradeCount < 2 && sessionHours > 1) {
            signalsEl.textContent = 'Low';
            signalsEl.className = 'pw-readiness-value pw-signal-low';
        } else {
            signalsEl.textContent = 'Healthy';
            signalsEl.className = 'pw-readiness-value pw-signal-healthy';
        }

        // DD vs MaxDD
        const curDD = paperState.currentDrawdown || 0;
        if (curDD > _maxDrawdown) _maxDrawdown = curDD;
        ddEl.textContent = curDD.toFixed(1) + '% / ' + _maxDrawdown.toFixed(1) + '%';
        ddEl.style.color = curDD > 10 ? '#f87171' : (curDD > 0 ? '#fbbf24' : '#4ade80');
    }

    // ====================================================================
    // TRADE-STATE TIMELINE
    // ====================================================================
    function renderStateTimeline() {
        const container = document.getElementById('pw-state-timeline');
        if (!container) return;

        let activeState = 'flat'; // default

        if (paperState && paperState.isRunning) {
            if (paperState.inPosition) {
                activeState = 'intrade';
            } else if (paperState.pendingEntry) {
                activeState = 'armed';
            } else if (paperState.lastSignal) {
                activeState = 'armed';
            } else {
                activeState = 'waiting';
            }
        }

        const steps = container.querySelectorAll('.pw-state-step');
        steps.forEach(step => {
            if (step.dataset.state === activeState) {
                step.classList.add('active');
            } else {
                step.classList.remove('active');
            }
        });
    }

    // ====================================================================
    // HEALTH WARNINGS
    // ====================================================================
    function computeAndRenderHealthWarnings() {
        const area = document.getElementById('pw-health-area');
        if (!area) return;

        const warnings = [];
        const warnIcon = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

        if (paperState && paperState.isRunning) {
            const tradeCount = paperState.tradeLog.filter(t => t.type === 'EXIT').length;
            const sessionMs = paperState.createdAt ? (Date.now() - new Date(paperState.createdAt).getTime()) : 0;
            const sessionHours = sessionMs / 3600000;

            // A) No signals detected
            if (tradeCount === 0 && sessionHours > 2) {
                warnings.push('No signals detected in this session');
            }

            // B) Low trade frequency
            if (tradeCount > 0 && tradeCount < 2 && sessionHours > 6) {
                warnings.push('Low trade frequency \u2014 forward test needs more time');
            }

            // C) Prolonged drawdown
            const curDD = paperState.currentDrawdown || 0;
            if (curDD > 10) {
                warnings.push('Prolonged drawdown \u2014 strategy underwater');
            }

            // D) Data delays
            if (paperState.lastUpdated) {
                const staleSec = (Date.now() - new Date(paperState.lastUpdated).getTime()) / 1000;
                if (staleSec > 120) {
                    warnings.push('Data delays detected');
                }
            }
        }

        // Render max 2 warnings
        const toShow = warnings.slice(0, 2);
        area.innerHTML = toShow.map(w =>
            `<div class="pw-health-pill">${warnIcon} ${w}</div>`
        ).join('');
    }

    // ====================================================================
    // ARMING FLOW
    // ====================================================================
    function showArmingPanel() {
        const panel = document.getElementById('pw-arming-panel');
        if (panel) {
            panel.style.display = 'block';
            document.querySelectorAll('.pw-arm-cb').forEach(cb => cb.checked = false);
            const armBtn = document.getElementById('pw-btn-arm');
            if (armBtn) armBtn.disabled = true;
            safetyStatus = 'ARMED';
            renderStatusBadge();
            updateButtonStates();
        }
    }

    function hideArmingPanel() {
        const panel = document.getElementById('pw-arming-panel');
        if (panel) panel.style.display = 'none';
        safetyStatus = 'IDLE';
        renderStatusBadge();
        updateButtonStates();
    }

    function updateArmButton() {
        const cbs = document.querySelectorAll('.pw-arm-cb');
        const allChecked = Array.from(cbs).every(cb => cb.checked);
        const armBtn = document.getElementById('pw-btn-arm');
        if (armBtn) armBtn.disabled = !allChecked;
    }

    function handleArmAndStart() {
        const ddInput = document.getElementById('pw-arm-dd');
        const streakInput = document.getElementById('pw-arm-streak');
        const tpdInput = document.getElementById('pw-arm-tpd');
        safetyConfig = {
            ddLimitPct: parseFloat(ddInput ? ddInput.value : 25) || 25,
            maxLossStreak: parseInt(streakInput ? streakInput.value : 10) || 10,
            maxTradesPerDay: parseInt(tpdInput ? tpdInput.value : 10) || 10,
            armedAt: new Date().toISOString()
        };
        breachReason = null;

        const sel = document.getElementById('pw-candidate-select');
        if (!sel || !sel.value) return;
        const opt = sel.options[sel.selectedIndex];
        if (!opt.dataset.config) return;
        const rawConfig = JSON.parse(opt.dataset.config);
        const config = extractConfig(rawConfig);

        if (!paperState || paperState.candidateId !== sel.value) {
            paperState = createPaperState(sel.value, config);
        }

        const panel = document.getElementById('pw-arming-panel');
        if (panel) panel.style.display = 'none';

        safetyStatus = 'RUNNING';
        addLog('\u2705 Deployment armed \u2014 safety limits: DD ' + safetyConfig.ddLimitPct + '%, streak ' + safetyConfig.maxLossStreak + ', trades/day ' + safetyConfig.maxTradesPerDay, 'system');
        startPolling();
    }

    function handleResume() {
        if (safetyStatus === 'AUTO_PAUSED') {
            if (!confirm('Safety limit was breached. Are you sure you want to resume?')) return;
        }
        if (paperState) {
            breachReason = null;
            safetyStatus = 'RUNNING';
            paperState.isRunning = true;
            paperState.status = 'RUNNING';
            addLog('\u25B6\uFE0F Session resumed by operator', 'system');
            savePaperState();
            renderDashboard();
            pollOnce();
        }
    }

    // ====================================================================
    // SAFETY BREACH DETECTION
    // ====================================================================
    function computeLossStreak() {
        if (!paperState || !paperState.tradeLog) return 0;
        const exits = paperState.tradeLog.filter(t => t.type === 'EXIT');
        let streak = 0;
        for (let i = exits.length - 1; i >= 0; i--) {
            if ((exits[i].pnl || 0) < 0) streak++;
            else break;
        }
        return streak;
    }

    function computeTradesToday() {
        if (!paperState || !paperState.tradeLog) return 0;
        const today = new Date().toISOString().slice(0, 10);
        return paperState.tradeLog.filter(t => t.type === 'EXIT' && t.time && t.time.slice(0, 10) === today).length;
    }

    function checkSafetyBreaches() {
        if (safetyStatus !== 'RUNNING' || !paperState) return;
        const curDD = paperState.currentDrawdown || 0;
        const lossStreak = computeLossStreak();
        const tradesToday = computeTradesToday();
        let reason = null;
        if (curDD >= safetyConfig.ddLimitPct) {
            reason = 'Drawdown ' + curDD.toFixed(1) + '% >= ' + safetyConfig.ddLimitPct + '% limit';
        } else if (lossStreak >= safetyConfig.maxLossStreak) {
            reason = 'Loss streak ' + lossStreak + ' >= ' + safetyConfig.maxLossStreak + ' limit';
        } else if (tradesToday >= safetyConfig.maxTradesPerDay) {
            reason = 'Trades today ' + tradesToday + ' >= ' + safetyConfig.maxTradesPerDay + ' limit';
        }
        if (reason) {
            breachReason = reason;
            addLog('\u26D4 AUTO-PAUSED: ' + reason, 'system');
            stopPolling('AUTO_PAUSED');
        }
    }

    // ====================================================================
    // SAFETY STATUS PANEL
    // ====================================================================
    function renderSafetyStatus() {
        const panel = document.getElementById('pw-safety-panel');
        if (!panel) return;
        if (safetyStatus !== 'RUNNING' && safetyStatus !== 'PAUSED' && safetyStatus !== 'AUTO_PAUSED') return;
        const curDD = (paperState ? paperState.currentDrawdown : 0) || 0;
        const lossStreak = computeLossStreak();
        const tradesToday = computeTradesToday();
        updateSafetyRow('pw-safety-dd', curDD, safetyConfig.ddLimitPct, curDD.toFixed(1) + '% / ' + safetyConfig.ddLimitPct + '%');
        updateSafetyRow('pw-safety-streak', lossStreak, safetyConfig.maxLossStreak, lossStreak + ' / ' + safetyConfig.maxLossStreak);
        updateSafetyRow('pw-safety-tpd', tradesToday, safetyConfig.maxTradesPerDay, tradesToday + ' / ' + safetyConfig.maxTradesPerDay);
    }

    function updateSafetyRow(rowId, current, limit, label) {
        const row = document.getElementById(rowId);
        if (!row) return;
        const pct = limit > 0 ? Math.min((current / limit) * 100, 100) : 0;
        const fill = row.querySelector('.pw-safety-fill');
        const val = row.querySelector('.pw-safety-value');
        if (fill) {
            fill.style.width = pct + '%';
            fill.className = 'pw-safety-fill' + (pct >= 100 ? ' red' : pct >= 80 ? ' amber' : '');
        }
        if (val) val.textContent = label;
    }

    // ====================================================================
    // ANOMALY FLAGS
    // ====================================================================
    function renderAnomalyFlags() {
        const area = document.getElementById('pw-anomaly-area');
        if (!area) return;
        if (!paperState || safetyStatus === 'IDLE') { area.innerHTML = ''; return; }
        const flags = [];
        if (paperState.lastUpdated) {
            const staleSec = (Date.now() - new Date(paperState.lastUpdated).getTime()) / 1000;
            if (staleSec > 120) flags.push('DATA STALE');
        }
        if (candleBuffer.length >= 2) {
            const last = candleBuffer[candleBuffer.length - 1];
            const prev = candleBuffer[candleBuffer.length - 2];
            if (last.date && prev.date) {
                const gapMs = new Date(last.date).getTime() - new Date(prev.date).getTime();
                const expectedMs = candleBuffer.length >= 3
                    ? new Date(prev.date).getTime() - new Date(candleBuffer[candleBuffer.length - 3].date).getTime()
                    : gapMs;
                if (expectedMs > 0 && gapMs > expectedMs * 3) flags.push('GAP DETECTED');
            }
        }
        const tradeCount = paperState.tradeLog ? paperState.tradeLog.filter(t => t.type === 'EXIT').length : 0;
        const sessionMs = paperState.createdAt ? (Date.now() - new Date(paperState.createdAt).getTime()) : 0;
        if (tradeCount === 0 && sessionMs > 7200000 && paperState.isRunning) flags.push('NO-SIGNAL STREAK');
        area.innerHTML = flags.map(f => '<div class="pw-anomaly-flag">' + f + '</div>').join('');
    }

    // ====================================================================
    // MODAL & CONTROLS
    // ====================================================================
    function populateCandidateSelect() {
        const sel = document.getElementById('pw-candidate-select');
        if (!sel) return;

        const candidates = loadCandidates();
        sel.innerHTML = '<option value="">— Select a candidate —</option>';
        candidates.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.id;
            opt.textContent = c.label;
            opt.dataset.config = JSON.stringify(c.config);
            sel.appendChild(opt);
        });

        // If we have a saved state, select the matching candidate
        if (paperState && paperState.candidateId) {
            sel.value = paperState.candidateId;
        }
    }

    function updateCandidateInfo() {
        const sel = document.getElementById('pw-candidate-select');
        if (!sel) return;

        const opt = sel.options[sel.selectedIndex];
        if (!opt || !opt.dataset.config) {
            // Reset all info fields
            const ids = ['pw-info-tf', 'pw-info-capital', 'pw-sub-slk', 'pw-sub-fees1', 'pw-sub-sl', 'pw-sub-fees2', 'pw-sub-fees3'];
            ids.forEach(id => { const el = document.getElementById(id); if (el) el.textContent = '\u2014'; });
            return;
        }

        try {
            const raw = JSON.parse(opt.dataset.config);
            const cfg = extractConfig(raw);

            // Populate the settings panel fields
            const tfEl = document.getElementById('pw-info-tf');
            if (tfEl) tfEl.textContent = cfg.asset.replace('-', '/') + '  ' + cfg.timeframe;

            const capEl = document.getElementById('pw-info-capital');
            if (capEl) capEl.textContent = fmtMoney(cfg.startingCapital);

            const slkEl = document.getElementById('pw-sub-slk');
            if (slkEl) slkEl.textContent = (cfg.slippagePct * 100).toFixed(1) + '%';

            const fees1El = document.getElementById('pw-sub-fees1');
            if (fees1El) fees1El.textContent = (cfg.feeRate * 100).toFixed(1) + '%';

            const slEl = document.getElementById('pw-sub-sl');
            if (slEl) slEl.textContent = (cfg.stopPercent * 100).toFixed(1) + '%';

            const fees2El = document.getElementById('pw-sub-fees2');
            if (fees2El) fees2El.textContent = (cfg.feeRate * 100).toFixed(1) + '%';

            const fees3El = document.getElementById('pw-sub-fees3');
            if (fees3El) fees3El.textContent = (cfg.riskPercent * 100).toFixed(1) + '%';

        } catch (e) {
            console.warn('Paper: Error reading config', e);
        }
    }

    function openPaperModal() {
        const overlay = document.getElementById('paper-modal-overlay');
        if (overlay) {
            overlay.classList.add('open');
            document.body.style.overflow = 'hidden';
        }
        populateCandidateSelect();
        if (paperState) {
            renderDashboard();
            renderLogs();
            updateCandidateInfo();
        }
    }

    function closePaperModal() {
        const overlay = document.getElementById('paper-modal-overlay');
        if (overlay) {
            overlay.classList.remove('open');
            document.body.style.overflow = '';
        }
    }

    function handleStart() {
        const sel = document.getElementById('pw-candidate-select');
        if (!sel || !sel.value) {
            alert('Please select a deployment candidate first.');
            return;
        }
        // Show arming panel instead of starting immediately
        showArmingPanel();
    }

    function handleStop() {
        stopPolling('PAUSED');
        addLog('\u26A0\uFE0F Emergency pause activated by operator', 'system');
    }

    function handleReset() {
        if (paperState && paperState.isRunning) {
            stopPolling();
        }
        if (confirm('Reset paper equity and trade log? This cannot be undone.')) {
            clearPaperState();
            _maxDrawdown = 0;
            safetyStatus = 'IDLE';
            breachReason = null;
            safetyConfig = { ddLimitPct: 25, maxLossStreak: 10, maxTradesPerDay: 10, armedAt: null };
            candleBuffer = [];
            const armPanel = document.getElementById('pw-arming-panel');
            if (armPanel) armPanel.style.display = 'none';
            renderDashboard();
            renderLogs();
            const container = document.getElementById('pw-position-stats');
            if (container) {
                const cells = container.querySelectorAll('.pw-stat-cell');
                if (cells.length >= 6) {
                    cells[0].querySelector('.pw-stat-value').className = 'pw-stat-value pw-pos-flat';
                    cells[0].querySelector('.pw-stat-value').textContent = 'FLAT';
                    cells[1].querySelector('.pw-stat-value').style.color = '#4ade80';
                    cells[1].querySelector('.pw-stat-value').textContent = '$10,000';
                    cells[2].querySelector('.pw-stat-value').style.color = '#4ade80';
                    cells[2].querySelector('.pw-stat-value').textContent = '0.00%';
                    cells[3].querySelector('.pw-stat-value').textContent = '\u2014';
                    cells[4].querySelector('.pw-stat-value').textContent = '\u2014';
                    cells[5].querySelector('.pw-stat-value').textContent = '0';
                }
            }
            const tradeEl = document.getElementById('pw-trade-log');
            if (tradeEl) tradeEl.innerHTML = '<div class="pw-tradelog-empty">No trades yet.</div>';
            renderStatusBadge();
            addLog('\uD83D\uDD04 Paper state RESET', 'system');
        }
    }

    // ====================================================================
    // INITIALIZATION
    // ====================================================================
    function initPaperTrading() {
        // Wire up the header button
        const openBtn = document.getElementById('btn-open-paper-trading');
        if (openBtn) {
            openBtn.addEventListener('click', openPaperModal);
        }

        // Wire up modal controls
        const closeBtn = document.getElementById('pw-modal-close');
        if (closeBtn) closeBtn.addEventListener('click', closePaperModal);

        const startBtn = document.getElementById('pw-btn-start');
        if (startBtn) startBtn.addEventListener('click', handleStart);

        const killBtn = document.getElementById('pw-btn-kill');
        if (killBtn) killBtn.addEventListener('click', handleStop);

        const resetBtn = document.getElementById('pw-btn-reset');
        if (resetBtn) resetBtn.addEventListener('click', handleReset);

        const resetPausedBtn = document.getElementById('pw-btn-reset-paused');
        if (resetPausedBtn) resetPausedBtn.addEventListener('click', handleReset);

        const resumeBtn = document.getElementById('pw-btn-resume');
        if (resumeBtn) resumeBtn.addEventListener('click', handleResume);

        // Arming panel controls
        const armCancelBtn = document.getElementById('pw-arming-cancel');
        if (armCancelBtn) armCancelBtn.addEventListener('click', hideArmingPanel);

        const armBtn = document.getElementById('pw-btn-arm');
        if (armBtn) armBtn.addEventListener('click', handleArmAndStart);

        document.querySelectorAll('.pw-arm-cb').forEach(cb => {
            cb.addEventListener('change', updateArmButton);
        });

        // Candidate select change
        const sel = document.getElementById('pw-candidate-select');
        if (sel) sel.addEventListener('change', updateCandidateInfo);

        // Logs toggle
        const logsToggle = document.getElementById('pw-logs-toggle');
        if (logsToggle) {
            // Expand by default for transparency
            const body = document.getElementById('pw-logs-body');
            const arrow = document.getElementById('pw-logs-arrow');
            if (body) {
                body.style.display = 'block';
                if (arrow) arrow.textContent = '▾';
            }

            logsToggle.addEventListener('click', () => {
                const body = document.getElementById('pw-logs-body');
                const arrow = document.getElementById('pw-logs-arrow');
                if (body) {
                    const isOpen = body.style.display !== 'none';
                    body.style.display = isOpen ? 'none' : 'block';
                    if (arrow) arrow.textContent = isOpen ? '▸' : '▾';
                }
            });
        }

        // Close on overlay click
        const overlay = document.getElementById('paper-modal-overlay');
        if (overlay) {
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) closePaperModal();
            });
        }

        // Restore session if exists
        const saved = loadPaperState();
        if (saved) {
            paperState = saved;
            // Restore buffer will happen on next poll
            if (paperState.isRunning) {
                addLog('♻\uFE0F Session restored from storage \u2014 resuming polling', 'system');
                startPolling();
            }
        }

        // --- BRIDGE: Register methods for PaperExecution Console ---
        if (window.PaperExecution && typeof window.PaperExecution.registerEngine === 'function') {
            window.PaperExecution.registerEngine({
                stop: (status) => {
                    stopPolling(status);
                    // Also clear any lingering timer reference
                    if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
                },
                start: () => startPolling(),
                resume: () => handleResume(),
                reset: () => handleReset(),
                getTradeCount: () => (paperState && paperState.tradeLog) ? paperState.tradeLog.length : 0,
                getPollTimer: () => pollTimer
            });
        }

        console.log('\u2705 Paper Trading module initialized');
    }

    // Expose globally
    window.initPaperTrading = initPaperTrading;

})();
