/* ========================================================================
   PAPER EXECUTION ENGINE v1 — Incremental Live Candle Adapter
   Processes fully-closed OHLC candles one-by-one using the same signal
   logic, slippage, fee, and stop-loss math as BacktestEngine.runBacktest.

   ARCHITECTURE CONTRACT:
   - Does NOT rewrite or modify BacktestEngine.
   - Does NOT modify DataFeed.
   - Maintained as a separate module so backtest remains batch-only.
   - Delegates indicator math to BacktestEngine (computeSMA, computeATR, etc).
   - Delegates signal generation to BacktestEngine.generateSignalVolBreakout.

   PUBLIC API:
     PaperExecutionEngine.init(config)
     PaperExecutionEngine.onCandle(candle)    // called per new closed candle
     PaperExecutionEngine.getSnapshot()       // read-only state for UI
     PaperExecutionEngine.reset()             // full state reset
     PaperExecutionEngine.kill()              // hard stop, blocks processing

   CANDLE SHAPE (input):
     { time: ISO string, open, high, low, close, volume }
   ======================================================================== */

(function () {
    'use strict';

    // ====================================================================
    // CONSTANTS
    // ====================================================================

    // Rolling window size — keeps memory bounded while giving enough history
    // for all VOL_BREAKOUT indicators (max lookback ~50 bars + ATR_AVG ~10).
    const LIVE_SERIES_MAX = 500;

    // Minimum candles needed before generateSignalVolBreakout can fire.
    // VOL_TREND_PERIOD=50, VOL_ATR_PERIOD=14, VOL_ATR_AVG_PERIOD=10,
    // VOL_BREAKOUT_LOOKBACK=20 → min = max(50, 14+10, 20+1) = 50.
    const MIN_BARS_FOR_SIGNAL = 52; // slight buffer beyond 50

    // Audit event ring buffer cap (shared style with PaperExecution)
    const MAX_AUDIT_EVENTS = 200;

    // ====================================================================
    // MODULE STATE
    // ====================================================================

    // Execution config (set by init)
    let _config = {
        startingCapital: 10000,
        riskPercent: 0.02,
        stopPercent: 0.02,
        slippagePct: 0.001,
        feeRate: 0.001
    };

    // Position state
    let _capital = 0;
    let _inPosition = false;
    let _shares = 0;
    let _entryPrice = 0;
    let _stopPrice = 0;
    let _riskAmount = 0;
    let _entryIdx = -1;
    let _pendingEntry = false;
    let _pendingExit = false;

    // Series & curves
    let _liveSeries = [];     // rolling candle window (shape: {time,open,high,low,close,volume})
    let _equityCurve = [];    // equity at each processed close
    let _tradeLog = [];       // completed trades (same shape as BacktestEngine trades)

    // Engine lifecycle
    let _killed = false;
    let _initiated = false;

    // Diagnostics
    let _lastProcessedCandleTs = null;  // ISO string — monotonic gate
    let _tickCount = 0;                 // total onCandle() calls received
    let _processedCount = 0;           // candles actually processed
    let _ignoredDuplicateCount = 0;    // candles skipped due to dedup

    // Internal audit buffer
    let _auditEvents = [];

    // ====================================================================
    // PRIVATE HELPERS
    // ====================================================================

    function _resetState(config) {
        _config = Object.assign({
            startingCapital: 10000,
            riskPercent: 0.02,
            stopPercent: 0.02,
            slippagePct: 0.001,
            feeRate: 0.001
        }, config || {});

        _capital = _config.startingCapital;
        _inPosition = false;
        _shares = 0;
        _entryPrice = 0;
        _stopPrice = 0;
        _riskAmount = 0;
        _entryIdx = -1;
        _pendingEntry = false;
        _pendingExit = false;

        _liveSeries = [];
        _equityCurve = [_config.startingCapital];
        _tradeLog = [];

        _killed = false;
        _initiated = true;

        _lastProcessedCandleTs = null;
        _tickCount = 0;
        _processedCount = 0;
        _ignoredDuplicateCount = 0;

        _auditEvents = [];
    }

    function _addAuditEvent(type, detail) {
        const evt = {
            id: 'pee_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
            time: new Date().toISOString(),
            type: type,
            detail: detail || {}
        };
        _auditEvents.push(evt);
        if (_auditEvents.length > MAX_AUDIT_EVENTS) _auditEvents.shift();

        // Also forward to PaperExecution event timeline if available
        if (window.PaperExecution && typeof window.PaperExecution.captureEvent === 'function') {
            window.PaperExecution.captureEvent('SYSTEM', 'PaperExecutionEngine', type, detail);
        }
    }

    /**
     * candle shape → shape compatible with BacktestEngine indicator functions.
     * BacktestEngine uses candle.close, candle.high, candle.low (same as DataFeed).
     */
    function _appendToSeries(candle) {
        _liveSeries.push(candle);
        if (_liveSeries.length > LIVE_SERIES_MAX) {
            _liveSeries.shift();
            // Adjust _entryIdx since array shifted
            if (_entryIdx > 0) _entryIdx--;
        }
    }

    function _enterPosition(execCandle) {
        const rawPrice = execCandle.open;
        const slippagePct = _config.slippagePct;
        const feeRate = _config.feeRate;

        const execPrice = rawPrice * (1.0 + slippagePct);
        _stopPrice = execPrice * (1.0 - _config.stopPercent);

        const stopDistance = execPrice - _stopPrice;
        _riskAmount = _capital * _config.riskPercent;
        _shares = _riskAmount / stopDistance;

        const maxShares = (_capital * (1.0 - feeRate)) / execPrice;
        if (_shares > maxShares) _shares = maxShares;

        const cost = _shares * execPrice;
        const fee = cost * feeRate / (1.0 - feeRate);
        _capital -= (cost + fee);

        _entryPrice = execPrice;
        _entryIdx = _liveSeries.length - 1;
        _inPosition = true;
        _pendingEntry = false;

        _addAuditEvent('ENTRY', {
            candleTime: execCandle.time,
            execPrice: execPrice,
            stopPrice: _stopPrice,
            shares: _shares,
            cost: cost + fee,
            capitalAfter: _capital
        });

        console.log(`[PaperExecutionEngine] ENTRY @ ${execPrice.toFixed(2)} | stop=${_stopPrice.toFixed(2)} | shares=${_shares.toFixed(6)}`);
    }

    function _exitPosition(execPrice, reason, candleTime) {
        const feeRate = _config.feeRate;

        const grossValue = _shares * execPrice;
        const netValue = grossValue * (1.0 - feeRate);
        const costBasis = _shares * _entryPrice;
        const entryFee = costBasis * feeRate / (1.0 - feeRate);
        const totalCost = costBasis + entryFee;
        const pnl = netValue - totalCost;

        _tradeLog.push({
            entryIdx: _entryIdx,
            exitIdx: _liveSeries.length - 1,
            entryPrice: _entryPrice,
            exitPrice: execPrice,
            stopPrice: _stopPrice,
            pnl: pnl,
            returnPct: (pnl / totalCost) * 100.0,
            rMultiple: _riskAmount > 0 ? pnl / _riskAmount : 0,
            holdingBars: (_liveSeries.length - 1) - _entryIdx,
            isWin: pnl > 0,
            exitReason: reason,
            entryTime: _liveSeries[_entryIdx] ? _liveSeries[_entryIdx].time : null,
            exitTime: candleTime
        });

        _capital += netValue;
        _shares = 0;
        _inPosition = false;
        _stopPrice = 0;
        _pendingExit = false;

        _addAuditEvent('EXIT', {
            reason: reason,
            candleTime: candleTime,
            execPrice: execPrice,
            pnl: pnl,
            returnPct: ((pnl / totalCost) * 100).toFixed(2) + '%',
            capitalAfter: _capital
        });

        console.log(`[PaperExecutionEngine] EXIT (${reason}) @ ${execPrice.toFixed(2)} | pnl=${pnl.toFixed(2)}`);
    }

    // ====================================================================
    // PUBLIC API
    // ====================================================================

    const PaperExecutionEngine = {

        /**
         * init(config) — Reset all state and configure the engine.
         * Must be called before the first onCandle().
         *
         * @param {Object} config
         *   startingCapital  {number} default 10000
         *   riskPercent      {number} fraction of capital at risk per trade, default 0.02
         *   stopPercent      {number} stop distance from entry, default 0.02
         *   slippagePct      {number} default 0.001
         *   feeRate          {number} default 0.001
         */
        init(config) {
            _resetState(config);
            console.log('[PaperExecutionEngine] Initialized.', _config);
        },

        /**
         * onCandle(candle) — Process one fully-closed OHLC candle.
         *
         * Contract:
         *  - Must be called only with fully-closed candles (enforced by DataFeed).
         *  - Deduplicated by candle.time (openTime ISO string).
         *  - Monotonic: candles with time <= lastProcessedCandleTs are ignored.
         *
         * Execution sequence mirrors runBacktest exactly:
         *  1. Guard: killed / not initiated
         *  2. Dedup: ignore duplicates
         *  3. Append to liveSeries
         *  4. Execute pending entry (on this candle's open)
         *  5. Execute pending exit (on this candle's open)
         *  6. Stop-loss check (this candle's low)
         *  7. Signal generation for NEXT bar
         *  8. Mark-to-market equity at close
         *  9. Update diagnostics + audit event
         *
         * @param {Object} candle { time, open, high, low, close, volume }
         */
        onCandle(candle) {
            _tickCount++;

            // Guard 1: killed engine
            if (_killed) {
                _addAuditEvent('HARD_BLOCK', {
                    reason: 'Engine is killed — candle rejected',
                    candleTime: candle.time,
                    _tickCount
                });
                console.warn('[PaperExecutionEngine] HARD_BLOCK: engine killed, candle rejected:', candle.time);
                return;
            }

            // Guard 2: not initialised
            if (!_initiated) {
                console.warn('[PaperExecutionEngine] onCandle called before init() — ignored.');
                return;
            }

            // Guard 3: deduplication / monotonic check
            if (_lastProcessedCandleTs !== null) {
                // Use lexicographic ISO comparison (valid because ISO 8601 is lexicographically sortable)
                if (candle.time <= _lastProcessedCandleTs) {
                    _ignoredDuplicateCount++;
                    console.log(`[PaperExecutionEngine] DUPLICATE_IGNORED — candle.time=${candle.time} <= lastProcessed=${_lastProcessedCandleTs}`);
                    return;
                }
            }

            // ── STEP 3: Append candle to rolling series ────────────────────────
            _appendToSeries(candle);
            const seriesLen = _liveSeries.length;
            const lastIdx = seriesLen - 1;

            // ── STEP 4: Execute pending ENTRY (from previous bar signal) ────────
            // Entry occurs at NEXT candle open (this candle), with slippage applied.
            if (_pendingEntry && !_inPosition) {
                _enterPosition(candle);
            }

            // ── STEP 5: Execute pending EXIT (from previous bar signal) ─────────
            if (_pendingExit && _inPosition) {
                const rawPrice = candle.open;
                const execPrice = rawPrice * (1.0 - _config.slippagePct);
                _exitPosition(execPrice, 'SIGNAL', candle.time);
            }

            // ── STEP 6: Stop-loss check (candle low hit during this bar) ────────
            // Stop fills below stop price with additional slippage (adverse).
            if (_inPosition && candle.low <= _stopPrice) {
                // Stop fills at stopPrice * (1 - slippage) per engine convention
                const execPrice = _stopPrice * (1.0 - _config.slippagePct);
                _exitPosition(execPrice, 'STOP', candle.time);
            }

            // ── STEP 7: Signal generation for the NEXT candle ───────────────────
            // Requires BacktestEngine to be loaded and enough history.
            if (seriesLen >= MIN_BARS_FOR_SIGNAL && window.BacktestEngine &&
                typeof window.BacktestEngine.generateSignalVolBreakout === 'function') {

                const signal = window.BacktestEngine.generateSignalVolBreakout(
                    _liveSeries, lastIdx, _inPosition
                );
                _pendingEntry = signal.enter;
                _pendingExit = signal.exit;

                if (signal.enter || signal.exit) {
                    console.log(`[PaperExecutionEngine] SIGNAL — enter=${signal.enter} exit=${signal.exit} @ ${candle.time}`);
                }
            } else {
                // Not enough bars yet — keep pending flags false
                _pendingEntry = false;
                _pendingExit = false;
            }

            // ── STEP 8: Mark-to-market equity at candle close ───────────────────
            const equity = _inPosition
                ? _capital + _shares * candle.close
                : _capital;
            _equityCurve.push(equity);

            // ── STEP 9: Update diagnostics ───────────────────────────────────────
            _lastProcessedCandleTs = candle.time;
            _processedCount++;

            // TICK_PROCESSED audit event (lightweight — no heavy serialisation)
            _addAuditEvent('TICK_PROCESSED', {
                candleTime: candle.time,
                close: candle.close,
                equity: equity,
                inPosition: _inPosition,
                pendingEntry: _pendingEntry,
                pendingExit: _pendingExit,
                processedCount: _processedCount,
                seriesLen: seriesLen
            });
        },

        /**
         * getSnapshot() — Returns a read-only copy of the current engine state.
         * Safe to call at any time (even before init).
         *
         * @returns {Object}
         */
        getSnapshot() {
            return {
                // Position state
                capital: _capital,
                inPosition: _inPosition,
                shares: _shares,
                entryPrice: _entryPrice,
                stopPrice: _stopPrice,
                pendingEntry: _pendingEntry,
                pendingExit: _pendingExit,

                // Curves
                equityCurve: _equityCurve.slice(),   // copy to prevent mutation
                tradeLog: _tradeLog.slice(),

                // Diagnostics
                lastProcessedCandleTs: _lastProcessedCandleTs,
                tickCount: _tickCount,
                processedCount: _processedCount,
                ignoredDuplicateCount: _ignoredDuplicateCount,
                seriesLen: _liveSeries.length,
                killed: _killed,
                initiated: _initiated,

                // Config snapshot
                config: Object.assign({}, _config),

                // Recent audit events (last 20 for display)
                recentEvents: _auditEvents.slice(-20)
            };
        },

        /**
         * reset() — Full hard reset. Re-applies last config.
         * Equivalent to calling init() with the same config used previously.
         */
        reset() {
            const prevConfig = Object.assign({}, _config);
            _resetState(prevConfig);
            console.log('[PaperExecutionEngine] Hard reset. State cleared.');
        },

        /**
         * kill() — Emergency stop.
         * Sets killed=true. All subsequent onCandle() calls will log HARD_BLOCK
         * and return immediately without processing.
         */
        kill() {
            _killed = true;
            _addAuditEvent('ENGINE_KILLED', {
                reason: 'Kill switch activated',
                processedCount: _processedCount,
                capital: _capital,
                inPosition: _inPosition
            });
            console.warn('[PaperExecutionEngine] ☠️ Engine killed. All future candles blocked.');
        },

        /**
         * selfTest() — Console-level verification tests.
         * Run: PaperExecutionEngine.selfTest()
         */
        selfTest() {
            console.group('[PaperExecutionEngine] Self-Test');

            // Initialise with test config
            this.init({ startingCapital: 10000, riskPercent: 0.02, stopPercent: 0.02, slippagePct: 0.001, feeRate: 0.001 });

            // Build 60 synthetic candles with an uptrend + breakout pattern
            const baseTs = Date.now() - 60 * 60000;
            const synth = [];
            for (let i = 0; i < 60; i++) {
                const t = new Date(baseTs + i * 60000).toISOString();
                // Gradually rising price to trigger breakout signal eventually
                const c = 50000 + i * 50;
                synth.push({ time: t, open: c - 100, high: c + 200, low: c - 200, close: c, volume: 1000 });
            }

            synth.forEach(c => this.onCandle(c));
            const snap = this.getSnapshot();

            const A = snap.processedCount === 60;
            console.log(`TEST A (processedCount=60): ${A ? '✅ PASS' : '❌ FAIL'} — got ${snap.processedCount}`);

            const B = snap.equityCurve.length >= 60;
            console.log(`TEST B (equityCurve.length>=60): ${B ? '✅ PASS' : '❌ FAIL'} — got ${snap.equityCurve.length}`);

            // Dedup test
            const dupCandle = synth[synth.length - 1]; // same ts as last processed
            this.onCandle(dupCandle);
            const snap2 = this.getSnapshot();
            const C = snap2.ignoredDuplicateCount >= 1;
            console.log(`TEST C (dedup): ${C ? '✅ PASS' : '❌ FAIL'} — ignoredDuplicates=${snap2.ignoredDuplicateCount}`);

            // Kill test
            this.kill();
            const preCount = this.getSnapshot().processedCount;
            const newCandle = { ...synth[0], time: new Date(Date.now() + 99999999).toISOString() };
            this.onCandle(newCandle);
            const D = this.getSnapshot().processedCount === preCount;
            console.log(`TEST D (kill blocks): ${D ? '✅ PASS' : '❌ FAIL'}`);

            const all = A && B && C && D;
            console.log(`\nOVERALL: ${all ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
            console.groupEnd();

            // Reset after test
            this.init({ startingCapital: 10000, riskPercent: 0.02, stopPercent: 0.02, slippagePct: 0.001, feeRate: 0.001 });
            return all;
        }
    };

    // ====================================================================
    // EXPORT
    // ====================================================================
    window.PaperExecutionEngine = PaperExecutionEngine;
    console.log('[PaperExecutionEngine] Module loaded. API: window.PaperExecutionEngine');

})();
