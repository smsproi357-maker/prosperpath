/* ========================================================================
   DATA FEED v1 — Live Closed-Candle OHLC Provider
   Supplies the latest fully closed candle for any supported symbol/timeframe.
   - Never emits the currently forming candle.
   - Enforces monotonic timestamps (no duplicates, no reordering).
   - Detects FEED_STALE and DISCONNECTED conditions.
   - Does NOT modify backtest engine math, strategy logic, or risk engine.
   ======================================================================== */

(function () {
    'use strict';

    // ====================================================================
    // CONSTANTS
    // ====================================================================

    // Map UI asset names → Binance symbols (mirrors backtest-engine.js)
    const SYMBOL_MAP = {
        'BTC-USD': 'BTCUSDT',
        'BTC-USDT': 'BTCUSDT',
        'ETH-USD': 'ETHUSDT',
        'ETH-USDT': 'ETHUSDT',
        'SOL-USD': 'SOLUSDT',
        'SOL-USDT': 'SOLUSDT'
    };

    // Map timeframe strings → Binance interval strings
    const TF_MAP = {
        '1m': '1m', '5m': '5m', '15m': '15m',
        '1h': '1h', '4h': '4h', '1d': '1d', '1w': '1w'
    };

    // Candle duration in milliseconds per timeframe
    const CANDLE_DURATION_MS = {
        '1m': 60 * 1000,
        '5m': 5 * 60 * 1000,
        '15m': 15 * 60 * 1000,
        '1h': 60 * 60 * 1000,
        '4h': 4 * 60 * 60 * 1000,
        '1d': 24 * 60 * 60 * 1000,
        '1w': 7 * 24 * 60 * 60 * 1000
    };

    const MAX_RETRIES = 3;
    const RETRY_DELAY_MS = 1000;

    // ====================================================================
    // INTERNAL STATE
    // ====================================================================

    let _activePollTimer = null;
    let _lastEmittedTime = null;   // ISO string of last emitted closed candle
    let _lastNewCandleAt = null;   // Date.now() when last new closed candle arrived
    let _currentStatus = 'IDLE';  // IDLE | CONNECTING | CONNECTED | STALE | DISCONNECTED

    // ====================================================================
    // PRIVATE HELPERS
    // ====================================================================

    function resolveSymbol(asset) {
        const sym = SYMBOL_MAP[asset];
        if (!sym) throw new Error(`[DataFeed] Unsupported asset: ${asset}. Use BTC-USD, ETH-USD, SOL-USD.`);
        return sym;
    }

    function resolveInterval(timeframe) {
        const iv = TF_MAP[timeframe];
        if (!iv) throw new Error(`[DataFeed] Unsupported timeframe: ${timeframe}.`);
        return iv;
    }

    function candleDurationMs(timeframe) {
        return CANDLE_DURATION_MS[timeframe] || (60 * 60 * 1000); // fallback 1h
    }

    async function fetchWithRetry(url) {
        let lastErr;
        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            try {
                const resp = await fetch(url);
                if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                return await resp.json();
            } catch (e) {
                lastErr = e;
                if (attempt < MAX_RETRIES - 1) {
                    await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
                }
            }
        }
        throw new Error(`[DataFeed] Network error after ${MAX_RETRIES} attempts: ${lastErr.message}`);
    }

    function rawKlineToCandle(k) {
        return {
            time: new Date(k[0]).toISOString(), // open time as ISO string
            open: parseFloat(k[1]),
            high: parseFloat(k[2]),
            low: parseFloat(k[3]),
            close: parseFloat(k[4]),
            volume: parseFloat(k[5])
        };
    }

    function emitStatus(status, onStatus) {
        if (_currentStatus !== status) {
            _currentStatus = status;
            console.log(`[DataFeed] Status → ${status}`);
        }
        if (typeof onStatus === 'function') onStatus(status);
    }

    // ====================================================================
    // PUBLIC API
    // ====================================================================

    const DataFeed = {

        // ----------------------------------------------------------------
        // A) fetchHistoricalCandles — wraps the existing BacktestEngine
        //    fetcher so the backtest page can use a shared DataFeed module.
        // ----------------------------------------------------------------
        async fetchHistoricalCandles(symbol, timeframe, start, end) {
            if (!window.BacktestEngine) {
                throw new Error('[DataFeed] BacktestEngine not available. Load backtest-engine.js first.');
            }
            // Delegates fully to the validated paginated fetcher.
            // Returns [{date, open, high, low, close, volume}] — same shape as engine.
            return BacktestEngine.fetchOHLCV(symbol, timeframe, start, end);
        },

        // ----------------------------------------------------------------
        // B) fetchLatestClosedCandle — fetches the most recent fully
        //    closed candle. Requests 2 candles; returns the second-to-last
        //    (index [length-2]) which is guaranteed closed since [length-1]
        //    is still forming.
        // ----------------------------------------------------------------
        async fetchLatestClosedCandle(symbol, timeframe) {
            const binanceSymbol = resolveSymbol(symbol);
            const interval = resolveInterval(timeframe);
            const url = `https://api.binance.com/api/v3/klines?symbol=${binanceSymbol}&interval=${interval}&limit=2`;

            const data = await fetchWithRetry(url);

            if (!data || data.length < 2) {
                throw new Error('[DataFeed] Binance returned fewer than 2 candles — cannot determine closed candle.');
            }

            // data[length-1] = forming candle   ← NEVER EMIT
            // data[length-2] = last closed candle ← emit this one
            return rawKlineToCandle(data[data.length - 2]);
        },

        // ----------------------------------------------------------------
        // C) startLiveFeed — polls at cadenceMs, emits only new closed
        //    candles to onCandle, status transitions to onStatus.
        //
        //    Status values emitted:
        //      IDLE → CONNECTING → CONNECTED → (STALE | DISCONNECTED)
        //
        //    Returns {stop} handle for clean teardown.
        // ----------------------------------------------------------------
        startLiveFeed({ symbol, timeframe, cadenceMs, onCandle, onStatus }) {
            // Stop any previously active feed first
            this.stopLiveFeed();

            _lastEmittedTime = null;
            _lastNewCandleAt = Date.now(); // initialise so stale-timer is fair
            _currentStatus = 'IDLE';

            const candleDur = candleDurationMs(timeframe);
            const staleThresh = cadenceMs > candleDur
                ? cadenceMs * 2         // if cadence > candle period, stale = 2×cadence
                : candleDur * 2;        // otherwise stale = 2×candle duration

            emitStatus('CONNECTING', onStatus);
            console.log(`[DataFeed] FEED_CONNECTING — ${symbol} ${timeframe} @ ${cadenceMs}ms cadence`);

            const self = this;

            async function poll() {
                // Guard: if feed was stopped externally between interval ticks
                if (!_activePollTimer) return;

                try {
                    const candle = await self.fetchLatestClosedCandle(symbol, timeframe);

                    // Monotonic check — skip if we already emitted this timestamp
                    if (_lastEmittedTime && candle.time <= _lastEmittedTime) {
                        // No new closed candle yet — check stale threshold
                        const sinceLastNew = Date.now() - _lastNewCandleAt;
                        if (sinceLastNew > staleThresh) {
                            emitStatus('STALE', onStatus);
                            console.warn(`[DataFeed] FEED_STALE — no new closed candle for ${Math.round(sinceLastNew / 1000)}s (threshold=${Math.round(staleThresh / 1000)}s)`);
                        }
                        return; // nothing new to emit
                    }

                    // New closed candle arrived
                    _lastEmittedTime = candle.time;
                    _lastNewCandleAt = Date.now();

                    // Transition CONNECTING → CONNECTED on first successful tick
                    emitStatus('CONNECTED', onStatus);

                    console.log(`[DataFeed] TICK_RECEIVED — ${symbol} ${timeframe} | candle.time=${candle.time} close=${candle.close}`);

                    if (typeof onCandle === 'function') {
                        onCandle(candle);
                    }

                } catch (err) {
                    // Network / parse failure → DISCONNECTED; stop feed
                    emitStatus('DISCONNECTED', onStatus);
                    console.error(`[DataFeed] FEED_DISCONNECTED — ${err.message}`);
                    self.stopLiveFeed();
                }
            }

            // Run first poll immediately, then on cadence
            poll();
            _activePollTimer = setInterval(poll, cadenceMs);

            console.log(`[DataFeed] FEED_CONNECTED (poll scheduled) — interval id: ${_activePollTimer}`);

            return { stop: () => this.stopLiveFeed() };
        },

        // ----------------------------------------------------------------
        // stopLiveFeed — clean teardown; transitions status to IDLE.
        // Safe to call multiple times.
        // ----------------------------------------------------------------
        stopLiveFeed() {
            if (_activePollTimer) {
                clearInterval(_activePollTimer);
                _activePollTimer = null;
                console.log('[DataFeed] Feed stopped cleanly.');
            }
            // Don't call emitStatus here — callers control what the final
            // feedState should be (IDLE after reset, not DISCONNECTED).
            _currentStatus = 'IDLE';
        },

        // ----------------------------------------------------------------
        // getStatus — current feed status string
        // ----------------------------------------------------------------
        getStatus() {
            return _currentStatus;
        },

        // ----------------------------------------------------------------
        // selfTest — console-only sanity check.
        //   DataFeed.selfTest()  → logs latest closed BTC 4H candle.
        // ----------------------------------------------------------------
        async selfTest() {
            console.group('[DataFeed] Self-Test — fetchLatestClosedCandle(BTC-USD, 4h)');
            try {
                const candle = await this.fetchLatestClosedCandle('BTC-USD', '4h');
                const candleTs = new Date(candle.time).getTime();
                const now = Date.now();

                console.log('Candle:', candle);

                // Assertion 1: time is in the past
                const A1 = candleTs < now;
                console.log(`TEST A (candle is in the past): ${A1 ? '✅ PASS' : '❌ FAIL'} — time=${candle.time}`);

                // Assertion 2: candle is within 2 × 4h window of now
                const deltaH = (now - candleTs) / (3600 * 1000);
                const A2 = deltaH <= 8;
                console.log(`TEST B (candle is recent, ≤8h ago): ${A2 ? '✅ PASS' : '❌ FAIL'} — ${deltaH.toFixed(2)}h ago`);

                // Assertion 3: all OHLC fields are numbers > 0
                const A3 = [candle.open, candle.high, candle.low, candle.close, candle.volume].every(v => typeof v === 'number' && v > 0);
                console.log(`TEST C (OHLCV all positive numbers): ${A3 ? '✅ PASS' : '❌ FAIL'}`);

                const all = A1 && A2 && A3;
                console.log(`\nOVERALL: ${all ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
            } catch (e) {
                console.error('❌ selfTest FAILED with error:', e.message);
            }
            console.groupEnd();
        }
    };

    // ====================================================================
    // EXPORT
    // ====================================================================
    window.DataFeed = DataFeed;
    console.log('[DataFeed] Module loaded. API: window.DataFeed');

})();
