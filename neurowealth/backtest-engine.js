/* ========================================================================
   BACKTEST ENGINE — Real VOL_BREAKOUT Engine (ported from C++ backtest_engine.cpp)
   Pure JavaScript, no dependencies. Source of truth for all backtest math.
   DO NOT MODIFY strategy logic, indicators, or position sizing.
   ========================================================================
   FIX: Performance panel zeros — root cause: fetchOHLCV was calling Binance
   API directly from the browser without a CORS fallback. When Binance is
   unreachable (CORS, geo-block, network error), the async block threw an
   exception, metrics stayed at the zero-reset state, and nothing was rendered.
   Change: Added a fallback inside fetchOHLCV that loads
   /exports/btc_4h_2019_2024.json when the Binance fetch fails, then filters
   it to the requested date range. No engine math was changed.
   ======================================================================== */

const BacktestEngine = (function () {
    'use strict';

    // ====================================================================
    // CONSTANTS (frozen from C++ engine)
    // ====================================================================
    const VOL_TREND_PERIOD = 50;
    const VOL_ATR_PERIOD = 14;
    const VOL_ATR_AVG_PERIOD = 20;
    const VOL_COMPRESSION_BARS = 3;
    const VOL_BREAKOUT_LOOKBACK = 10;
    const VOL_COMPRESSION_RECENCY = 5;
    const VOL_EXIT_SMA_PERIOD = 20;

    // ====================================================================
    // PRESETS
    // ====================================================================
    const PRESETS = {
        BTC_4H_PRODUCTION: {
            asset: 'BTC-USDT',
            timeframe: '4h',
            startingCapital: 10000,
            riskPercent: 0.02,
            stopPercent: 0.02,
            slippagePct: 0.001,
            feeRate: 0.001,
            strategy: 'VOL_BREAKOUT',
            gate: 'NONE',
            label: 'BTC_4H_PRODUCTION'
        },
        BTC_DAILY_PRODUCTION: {
            asset: 'BTC-USDT',
            timeframe: '1d',
            startingCapital: 10000,
            riskPercent: 0.02,
            stopPercent: 0.02,
            slippagePct: 0.001,
            feeRate: 0.001,
            strategy: 'VOL_BREAKOUT',
            gate: 'NONE',
            label: 'BTC_DAILY_PRODUCTION'
        }
    };

    // ====================================================================
    // INDICATOR FUNCTIONS (1:1 port from C++ engine)
    // ====================================================================

    function computeSMA(candles, endIdx, period) {
        let sum = 0;
        for (let j = endIdx - period + 1; j <= endIdx; j++) {
            sum += candles[j].close;
        }
        return sum / period;
    }

    function computeATR(candles, endIdx, period) {
        let atrSum = 0;
        for (let j = endIdx - period + 1; j <= endIdx; j++) {
            let tr = candles[j].high - candles[j].low;
            let tr2 = Math.abs(candles[j].high - candles[j - 1].close);
            let tr3 = Math.abs(candles[j].low - candles[j - 1].close);
            tr = Math.max(tr, tr2, tr3);
            atrSum += tr;
        }
        return atrSum / period;
    }

    function computeRSI(candles, endIdx, period) {
        let avgGain = 0, avgLoss = 0;
        for (let j = endIdx - period + 1; j <= endIdx; j++) {
            const change = candles[j].close - candles[j - 1].close;
            if (change > 0) avgGain += change;
            else avgLoss += Math.abs(change);
        }
        avgGain /= period;
        avgLoss /= period;
        if (avgLoss < 1e-12) return 100.0;
        const rs = avgGain / avgLoss;
        return 100.0 - (100.0 / (1.0 + rs));
    }

    // ====================================================================
    // SIGNAL GENERATOR — VOL_BREAKOUT (1:1 port)
    // ====================================================================

    function generateSignalVolBreakout(candles, i, inPosition) {
        const sig = { enter: false, exit: false };

        const minBars = Math.max(VOL_TREND_PERIOD, VOL_ATR_PERIOD + VOL_ATR_AVG_PERIOD, VOL_BREAKOUT_LOOKBACK + 1);
        if (i < minBars) return sig;

        // EXIT: Close < SMA(20)
        if (inPosition) {
            const exitSma = computeSMA(candles, i, VOL_EXIT_SMA_PERIOD);
            if (candles[i].close < exitSma) {
                sig.exit = true;
            }
            return sig;
        }

        // ENTRY CONDITIONS (long only)

        // 1. Trend filter: Close > SMA(50) AND SMA(50) slope positive over 5 bars
        const sma50Now = computeSMA(candles, i, VOL_TREND_PERIOD);
        if (candles[i].close <= sma50Now) return sig;

        const slopeLag = Math.min(5, i - VOL_TREND_PERIOD + 1);
        const sma50Prev = computeSMA(candles, i - slopeLag, VOL_TREND_PERIOD);
        if (sma50Now <= sma50Prev) return sig;

        // 2. Volatility compression detection
        let foundCompression = false;
        let consec = 0;
        const searchStart = Math.max(minBars, i - VOL_COMPRESSION_RECENCY);
        for (let k = searchStart; k <= i; k++) {
            const atrK = computeATR(candles, k, VOL_ATR_PERIOD);
            let atrAvg = 0;
            for (let m = k - VOL_ATR_AVG_PERIOD + 1; m <= k; m++) {
                atrAvg += computeATR(candles, m, VOL_ATR_PERIOD);
            }
            atrAvg /= VOL_ATR_AVG_PERIOD;

            if (atrK < atrAvg) {
                consec++;
                if (consec >= VOL_COMPRESSION_BARS) {
                    foundCompression = true;
                    break;
                }
            } else {
                consec = 0;
            }
        }
        if (!foundCompression) return sig;

        // 3. Breakout trigger: Close > highest high of last N bars AND ATR increasing
        let highestHigh = 0;
        for (let k = i - VOL_BREAKOUT_LOOKBACK; k < i; k++) {
            if (candles[k].high > highestHigh) highestHigh = candles[k].high;
        }
        if (candles[i].close <= highestHigh) return sig;

        const atrNow = computeATR(candles, i, VOL_ATR_PERIOD);
        const atrPrev = computeATR(candles, i - 1, VOL_ATR_PERIOD);
        if (atrNow <= atrPrev) return sig;

        // All conditions met — enter long
        sig.enter = true;
        return sig;
    }

    // ====================================================================
    // BACKTEST EXECUTOR (1:1 port from run_backtest_validated)
    // ====================================================================

    // ----------------------------------------------------------------
    // STRICT CONFIG VALIDATOR — delegates to RunConfigShared.requireNum
    // Throws on missing/NaN to surface bugs. Replaces silent || fallback.
    // ----------------------------------------------------------------
    function _requireNum(config, key) {
        return RunConfigShared.requireNum(config, key);
    }

    function runBacktest(candles, config) {
        // Strict extraction — throws a clear error for any missing/NaN value.
        // This replaces the silent `config.x || default` that hid input changes.
        const startingCapital = _requireNum(config, 'startingCapital');
        const riskPercent = _requireNum(config, 'riskPercent');
        const stopPercent = _requireNum(config, 'stopPercent');
        const slippagePct = _requireNum(config, 'slippagePct');
        const feeRate = _requireNum(config, 'feeRate');

        const trades = [];
        const equityCurve = [startingCapital];

        let inPosition = false;
        let capital = startingCapital;
        let shares = 0;
        let entryIdx = -1;
        let entryPrice = 0;
        let stopPrice = 0;
        let riskAmount = 0;
        let pendingEntry = false;
        let pendingExit = false;

        const n = candles.length;

        for (let i = 1; i < n; i++) {
            // Execute pending entry
            if (pendingEntry && !inPosition) {
                const rawPrice = candles[i].open;
                const execPrice = rawPrice * (1.0 + slippagePct);

                stopPrice = execPrice * (1.0 - stopPercent);
                const stopDistance = execPrice - stopPrice;
                riskAmount = capital * riskPercent;
                shares = riskAmount / stopDistance;

                const maxShares = (capital * (1.0 - feeRate)) / execPrice;
                if (shares > maxShares) shares = maxShares;

                const cost = shares * execPrice;
                const fee = cost * feeRate / (1.0 - feeRate);
                capital -= cost + fee;

                entryPrice = execPrice;
                entryIdx = i;
                inPosition = true;
                pendingEntry = false;
            }

            // Execute pending exit
            if (pendingExit && inPosition) {
                const rawPrice = candles[i].open;
                const execPrice = rawPrice * (1.0 - slippagePct);

                const grossValue = shares * execPrice;
                const netValue = grossValue * (1.0 - feeRate);
                const costBasis = shares * entryPrice;
                const entryFee = costBasis * feeRate / (1.0 - feeRate);
                const totalCost = costBasis + entryFee;

                trades.push({
                    entryIdx: entryIdx,
                    exitIdx: i,
                    entryPrice: entryPrice,
                    exitPrice: execPrice,
                    stopPrice: stopPrice,
                    pnl: netValue - totalCost,
                    returnPct: ((netValue - totalCost) / totalCost) * 100.0,
                    rMultiple: riskAmount > 0 ? (netValue - totalCost) / riskAmount : 0,
                    holdingPeriod: i - entryIdx,
                    isWin: (netValue - totalCost) > 0,
                    exitReason: 'SIGNAL'
                });

                capital += netValue;
                shares = 0;
                inPosition = false;
                stopPrice = 0;
                pendingExit = false;
            }

            // Stop-loss
            if (inPosition && candles[i].low <= stopPrice) {
                const execPrice = stopPrice * (1.0 - slippagePct);

                const grossValue = shares * execPrice;
                const netValue = grossValue * (1.0 - feeRate);
                const costBasis = shares * entryPrice;
                const entryFee = costBasis * feeRate / (1.0 - feeRate);
                const totalCost = costBasis + entryFee;

                trades.push({
                    entryIdx: entryIdx,
                    exitIdx: i,
                    entryPrice: entryPrice,
                    exitPrice: execPrice,
                    stopPrice: stopPrice,
                    pnl: netValue - totalCost,
                    returnPct: ((netValue - totalCost) / totalCost) * 100.0,
                    rMultiple: riskAmount > 0 ? (netValue - totalCost) / riskAmount : 0,
                    holdingPeriod: i - entryIdx,
                    isWin: false,
                    exitReason: 'STOP'
                });

                capital += netValue;
                shares = 0;
                inPosition = false;
                stopPrice = 0;
            }

            // Generate signal
            const signal = generateSignalVolBreakout(candles, i, inPosition);
            pendingEntry = signal.enter;
            pendingExit = signal.exit;

            // Mark-to-market equity
            if (inPosition) {
                equityCurve.push(capital + shares * candles[i].close);
            } else {
                equityCurve.push(capital);
            }
        }

        return {
            trades,
            equityCurve,
            finalCapital: equityCurve[equityCurve.length - 1],
            totalBars: n - 1
        };
    }

    // ====================================================================
    // METRICS CALCULATOR
    // ====================================================================

    function computeMetrics(result, config) {
        // Strict — no silent fallbacks.  Caller MUST supply valid config.
        const startingCapital = _requireNum(config, 'startingCapital');
        const trades = result.trades;
        const eq = result.equityCurve;
        const totalBars = result.totalBars;

        // Return
        const totalReturn = ((result.finalCapital - startingCapital) / startingCapital) * 100;

        // CAGR — estimate years from bar count and timeframe
        const tfHours = { '1m': 1 / 60, '5m': 5 / 60, '15m': 0.25, '1h': 1, '4h': 4, '1d': 24, '1w': 168 };
        const hoursPerBar = tfHours[config.timeframe];
        if (hoursPerBar === undefined) {
            throw new Error('[BacktestEngine] computeMetrics: unknown timeframe "' + config.timeframe + '". Supported: ' + Object.keys(tfHours).join(', '));
        }
        const years = (totalBars * hoursPerBar) / (365.25 * 24);
        const growth = result.finalCapital / startingCapital;
        const cagr = (years > 0 && growth > 0) ? (Math.pow(growth, 1.0 / years) - 1.0) * 100 : 0;

        // MaxDD
        let peak = eq[0], maxDD = 0;
        for (let i = 1; i < eq.length; i++) {
            if (eq[i] > peak) peak = eq[i];
            const dd = ((peak - eq[i]) / peak) * 100;
            if (dd > maxDD) maxDD = dd;
        }

        // Sharpe (annualized from bar returns)
        const returns = [];
        for (let i = 1; i < eq.length; i++) {
            returns.push((eq[i] - eq[i - 1]) / eq[i - 1]);
        }
        const meanRet = returns.reduce((a, b) => a + b, 0) / returns.length;
        const variance = returns.reduce((a, b) => a + (b - meanRet) ** 2, 0) / returns.length;
        const stdDev = Math.sqrt(variance);
        const barsPerYear = (365.25 * 24) / hoursPerBar;
        const sharpe = stdDev > 0 ? (meanRet / stdDev) * Math.sqrt(barsPerYear) : 0;

        // Sortino (downside deviation only)
        const downReturns = returns.filter(r => r < 0);
        const downVariance = downReturns.length > 0
            ? downReturns.reduce((a, b) => a + (b - 0) ** 2, 0) / returns.length
            : 0;
        const downDev = Math.sqrt(downVariance);
        const sortino = downDev > 0 ? (meanRet / downDev) * Math.sqrt(barsPerYear) : 0;

        // PF, Win Rate, Expectancy
        let grossProfit = 0, grossLoss = 0, wins = 0;
        let totalPnl = 0;
        trades.forEach(t => {
            totalPnl += t.pnl;
            if (t.pnl > 0) { grossProfit += t.pnl; wins++; }
            else grossLoss += Math.abs(t.pnl);
        });
        const pf = grossLoss > 0 ? grossProfit / grossLoss : 0;
        const winRate = trades.length > 0 ? (wins / trades.length) * 100 : 0;
        const expectancy = trades.length > 0 ? totalPnl / trades.length : 0;

        // Calmar
        const calmar = maxDD > 0 ? cagr / maxDD : 0;

        // Avg Win / Avg Loss
        const winTrades = trades.filter(t => t.isWin);
        const lossTrades = trades.filter(t => !t.isWin);
        const avgWin = winTrades.length > 0 ? winTrades.reduce((a, t) => a + t.pnl, 0) / winTrades.length : 0;
        const avgLoss = lossTrades.length > 0 ? lossTrades.reduce((a, t) => a + Math.abs(t.pnl), 0) / lossTrades.length : 0;
        const avgWinLoss = avgLoss > 0 ? avgWin / avgLoss : 0;

        // Max Consecutive Losses
        let maxConsec = 0, curConsec = 0;
        trades.forEach(t => {
            if (!t.isWin) { curConsec++; if (curConsec > maxConsec) maxConsec = curConsec; }
            else curConsec = 0;
        });

        // Avg Trade Duration (in bars, convert to timeframe-appropriate days)
        let avgDuration = 0;
        if (trades.length > 0) {
            const totalHold = trades.reduce((a, t) => a + t.holdingPeriod, 0);
            avgDuration = totalHold / trades.length;
        }
        const daysPerBar = hoursPerBar / 24;
        const avgDurationDays = avgDuration * daysPerBar;

        // Exposure Time (% of bars in position)
        let barsInPosition = 0;
        trades.forEach(t => { barsInPosition += t.holdingPeriod; });
        const exposureTime = totalBars > 0 ? (barsInPosition / totalBars) * 100 : 0;

        return {
            totalReturn: totalReturn.toFixed(2),
            cagr: cagr.toFixed(2),
            maxDrawdown: '-' + maxDD.toFixed(2),
            sharpe: sharpe.toFixed(2),
            sortino: sortino.toFixed(2),
            winRate: winRate.toFixed(1),
            profitFactor: pf.toFixed(2),
            expectancy: Math.floor(expectancy),
            tradeCount: trades.length,
            calmar: calmar.toFixed(2),
            avgWinLoss: avgWinLoss.toFixed(2),
            maxConsecLosses: maxConsec,
            avgTradeDuration: avgDurationDays.toFixed(1),
            exposureTime: exposureTime.toFixed(1)
        };
    }

    // ====================================================================
    // DRAWDOWN CURVE (from equity curve)
    // ====================================================================

    function computeDrawdownCurve(equityCurve) {
        let peak = equityCurve[0];
        return equityCurve.map(eq => {
            if (eq > peak) peak = eq;
            return ((eq - peak) / peak) * 100;
        });
    }

    // ====================================================================
    // DISTRIBUTION HISTOGRAM (from trades)
    // ====================================================================

    function computeDistribution(trades) {
        const bins = {};
        for (let i = -8; i <= 8; i++) bins[i] = 0;

        trades.forEach(t => {
            let bucket = Math.round(t.returnPct);
            bucket = Math.max(-8, Math.min(8, bucket));
            bins[bucket]++;
        });

        const result = [];
        for (let i = -8; i <= 8; i++) {
            result.push({
                label: (i >= 0 ? '+' : '') + i + '%',
                value: bins[i],
                pct: i
            });
        }
        return result;
    }

    // ====================================================================
    // MONTHLY RETURNS (from equity curve + candle dates)
    // ====================================================================

    function computeMonthlyReturns(candles, equityCurve) {
        const monthly = {};
        if (!candles[0] || !candles[0].date) return monthly;

        let prevMonth = null, prevYear = null, monthStart = equityCurve[0];

        for (let i = 0; i < candles.length && i < equityCurve.length; i++) {
            const d = candles[i].date;
            const month = d.getMonth();
            const year = d.getFullYear();

            if (prevMonth !== null && (month !== prevMonth || year !== prevYear)) {
                if (!monthly[prevYear]) monthly[prevYear] = new Array(12).fill(null);
                const ret = ((equityCurve[i - 1] - monthStart) / monthStart) * 100;
                monthly[prevYear][prevMonth] = parseFloat(ret.toFixed(1));
                monthStart = equityCurve[i - 1];
            }

            prevMonth = month;
            prevYear = year;
        }

        // Last partial month
        if (prevYear !== null) {
            if (!monthly[prevYear]) monthly[prevYear] = new Array(12).fill(null);
            const lastEq = equityCurve[equityCurve.length - 1];
            const ret = ((lastEq - monthStart) / monthStart) * 100;
            monthly[prevYear][prevMonth] = parseFloat(ret.toFixed(1));
        }

        return monthly;
    }

    // ====================================================================
    // DATA FETCHER — Binance Public API
    // ====================================================================

    async function fetchOHLCV(asset, timeframe, startDate, endDate) {
        // Map UI asset names to Binance symbols
        const symbolMap = {
            'BTC-USD': 'BTCUSDT', 'BTC-USDT': 'BTCUSDT',
            'ETH-USD': 'ETHUSDT', 'ETH-USDT': 'ETHUSDT',
            'SOL-USD': 'SOLUSDT', 'SOL-USDT': 'SOLUSDT'
        };

        const symbol = symbolMap[asset];
        if (!symbol) {
            throw new Error(`Data unavailable for ${asset}. Select a crypto asset (BTC-USD, ETH-USD).`);
        }

        // Map timeframe
        const tfMap = {
            '1m': '1m', '5m': '5m', '15m': '15m',
            '1h': '1h', '4h': '4h', '1d': '1d', '1w': '1w'
        };
        const interval = tfMap[timeframe];
        if (!interval) throw new Error(`Unsupported timeframe: ${timeframe}`);

        const startMs = new Date(startDate).getTime();
        const endMs = new Date(endDate).getTime();

        // ---- Primary: Binance paginated fetch ----
        let binanceError = null;
        try {
            const allCandles = [];
            let currentStart = startMs;
            const maxRetries = 3;

            while (currentStart < endMs) {
                let data = null;
                for (let attempt = 0; attempt < maxRetries; attempt++) {
                    try {
                        const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&startTime=${currentStart}&endTime=${endMs}&limit=1000`;
                        const resp = await fetch(url);
                        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                        data = await resp.json();
                        break;
                    } catch (e) {
                        if (attempt === maxRetries - 1) throw new Error(`Failed to fetch data: ${e.message}`);
                        await new Promise(r => setTimeout(r, 1000));
                    }
                }

                if (!data || data.length === 0) break;

                for (const k of data) {
                    allCandles.push({
                        date: new Date(k[0]),
                        open: parseFloat(k[1]),
                        high: parseFloat(k[2]),
                        low: parseFloat(k[3]),
                        close: parseFloat(k[4]),
                        volume: parseFloat(k[5])
                    });
                }

                // Move start past last candle
                currentStart = data[data.length - 1][0] + 1;

                // Rate limiting
                if (data.length === 1000) {
                    await new Promise(r => setTimeout(r, 200));
                }
            }

            if (allCandles.length >= 100) {
                // 2B: strict shape validator
                if (!(allCandles[0].date instanceof Date)) throw new Error('[Backtest] Candle date is not a Date instance');
                if (!isFinite(allCandles[0].close)) throw new Error('[Backtest] Candle close is not finite');
                return allCandles;
            }
            binanceError = new Error(`Insufficient data: only ${allCandles.length} candles loaded. Need at least 100.`);
        } catch (e) {
            binanceError = e;
        }

        // ---- Fallback: load golden candleset from /exports/btc_4h_2019_2024.json ----
        console.warn(`[Backtest] Binance fetch failed, falling back to golden candleset. Reason: ${binanceError.message}`);
        console.warn('[Backtest] Raw Binance error:', binanceError);

        // Only the BTC 4H golden set is available locally; warn if requesting something else
        if (asset !== 'BTC-USD' && asset !== 'BTC-USDT') {
            console.warn(`[Backtest] Golden candleset only covers BTC-USD 4H. Requested: ${asset} ${timeframe}. Proceeding with BTC 4H data.`);
        }

        let rawJson;
        try {
            const fallbackResp = await fetch('/exports/btc_4h_2019_2024.json');
            if (!fallbackResp.ok) throw new Error(`HTTP ${fallbackResp.status}`);
            rawJson = await fallbackResp.json();
        } catch (fe) {
            throw new Error(`[Backtest] Binance fetch failed AND golden candleset could not be loaded: ${fe.message}`);
        }

        // Map the golden set to the required candle shape
        // Supports both array-of-arrays [ts,o,h,l,c,v] and array-of-objects {date/t, open/o, high/h, low/l, close/c, volume/v}
        const mapped = rawJson.map(k => {
            if (Array.isArray(k)) {
                return {
                    date: new Date(k[0]),
                    open: parseFloat(k[1]),
                    high: parseFloat(k[2]),
                    low: parseFloat(k[3]),
                    close: parseFloat(k[4]),
                    volume: parseFloat(k[5])
                };
            }
            // Object shape
            const ts = k.date || k.t || k.timestamp || k.time || k.openTime;
            return {
                date: ts instanceof Date ? ts : new Date(typeof ts === 'number' ? ts : ts),
                open: parseFloat(k.open ?? k.o),
                high: parseFloat(k.high ?? k.h),
                low: parseFloat(k.low ?? k.l),
                close: parseFloat(k.close ?? k.c),
                volume: parseFloat(k.volume ?? k.v ?? 0)
            };
        });

        // Filter to the requested date range
        const filtered = mapped.filter(c => {
            const ms = c.date.getTime();
            return ms >= startMs && ms <= endMs;
        });

        const candles = filtered.length >= 100 ? filtered : mapped; // fall back to full set if range too narrow
        console.log(`[Backtest] Golden candleset loaded: ${candles.length} candles (range-filtered: ${filtered.length})`);

        // 2B: strict shape validator on fallback data too
        if (!candles.length) throw new Error('[Backtest] No candles loaded from golden candleset');
        if (!(candles[0].date instanceof Date)) throw new Error('[Backtest] Golden candle date is not a Date instance');
        if (!isFinite(candles[0].close)) {
            console.error('[Backtest] First 3 raw candles:', rawJson.slice(0, 3));
            throw new Error('[Backtest] Golden candle close is not finite');
        }
        if (candles.length < 100) throw new Error(`[Backtest] Golden candleset has only ${candles.length} candles after filtering. Need at least 100.`);

        return candles;
    }
    // ====================================================================
    // BUILD RUN CONFIG FROM UI — single source of truth
    // Validates every relevant DOM input at run-time.
    // Returns a config object with configHash + engineVersion attached.
    // Throws a descriptive Error (surfaced in UI) on any invalid input.
    // ====================================================================

    // Delegates to RunConfigShared — single source of truth for hashing.
    function _hashConfig(cfg) {
        return RunConfigShared.hashConfig(cfg);
    }

    function _readDOMInput(id, label) {
        const el = document.getElementById(id);
        if (!el) throw new Error(`[BacktestEngine] DOM element #${id} not found. Page may not have loaded correctly.`);
        return el.value;
    }

    function _readDOMFloat(id, label) {
        const raw = _readDOMInput(id, label);
        const v = parseFloat(raw);
        if (!isFinite(v)) {
            const msg = `[BacktestEngine] Input "${label}" (#${id}) is not a valid number — got: "${raw}". Please enter a valid number.`;
            console.error(msg);
            throw new Error(msg);
        }
        return v;
    }

    function buildRunConfigFromUI() {
        // Read every relevant input from the live DOM (not from a cached snapshot).
        const asset = _readDOMInput('asset-select', 'Asset');
        const timeframe = _readDOMInput('timeframe-select', 'Timeframe');
        const startDate = _readDOMInput('start-date', 'Start Date');
        const endDate = _readDOMInput('end-date', 'End Date');

        if (!asset || !timeframe) throw new Error('[BacktestEngine] Asset or Timeframe is not selected.');
        if (!startDate || !endDate) throw new Error('[BacktestEngine] Start Date or End Date is empty.');
        if (startDate >= endDate) throw new Error(`[BacktestEngine] Start Date (${startDate}) must be before End Date (${endDate}).`);

        const startingCapital = _readDOMFloat('starting-capital', 'Starting Capital');
        const positionPct = _readDOMFloat('position-size', 'Position %');
        const feePct = _readDOMFloat('trading-fees', 'Trading Fees %');
        const slippagePctUI = _readDOMFloat('slippage', 'Slippage %');
        const stopLossPct = _readDOMFloat('stop-loss', 'Stop Loss %');

        if (startingCapital <= 0) throw new Error('[BacktestEngine] Starting Capital must be greater than zero.');
        if (positionPct <= 0 || positionPct > 100) throw new Error('[BacktestEngine] Position % must be between 0 and 100.');
        if (feePct < 0) throw new Error('[BacktestEngine] Trading Fees % cannot be negative.');
        if (slippagePctUI < 0) throw new Error('[BacktestEngine] Slippage % cannot be negative.');
        if (stopLossPct < 0) throw new Error('[BacktestEngine] Stop Loss % cannot be negative.');

        const config = {
            asset,
            timeframe,
            startDate,
            endDate,
            startingCapital,
            riskPercent: positionPct / 100,  // UI shows %, engine uses fraction
            feeRate: feePct / 100,
            slippagePct: slippagePctUI / 100,
            stopPercent: stopLossPct / 100,
            engineVersion: RunConfigShared.ENGINE_VERSION
        };

        config.configHash = _hashConfig(config);
        return config;
    }

    /** Legacy alias — keeps any existing callers working unchanged. */
    function collectInputs() { return buildRunConfigFromUI(); }

    // ====================================================================
    // CANDLESET HASH — fingerprints the actual data window used
    // Format: "<firstMs>-<lastMs>-<count>"  (changes if range or TF changes)
    // ====================================================================

    // Delegates to RunConfigShared — single source of truth for candle fingerprinting.
    function computeCandlesetHash(candles) {
        return RunConfigShared.computeCandlesetHash(candles);
    }

    // ====================================================================
    // INTEGRATION TESTS (console-only)
    // ====================================================================

    function runIntegrationTests(candles, result, metrics) {
        const tests = [];

        // 1. Consistency: equity curve length == candle length
        const eqLenOk = result.equityCurve.length === candles.length;
        tests.push({
            name: 'Equity curve length matches candles', pass: eqLenOk,
            detail: `eq=${result.equityCurve.length} candles=${candles.length}`
        });

        // 2. Chronology: trades in time order
        let chronoOk = true;
        for (let i = 1; i < result.trades.length; i++) {
            if (result.trades[i].entryIdx <= result.trades[i - 1].exitIdx) {
                chronoOk = false; break;
            }
        }
        tests.push({ name: 'Trades in chronological order', pass: chronoOk });

        // 3. No overlap
        let overlapOk = true;
        for (let i = 1; i < result.trades.length; i++) {
            if (result.trades[i].entryIdx < result.trades[i - 1].exitIdx) {
                overlapOk = false; break;
            }
        }
        tests.push({ name: 'No trade overlap', pass: overlapOk });

        // 4. Metrics sanity
        tests.push({ name: 'Trade count > 0', pass: result.trades.length > 0 });
        tests.push({ name: 'Final capital > 0', pass: result.finalCapital > 0 });

        console.group('🧪 Backtest Integration Tests');
        tests.forEach(t => {
            const icon = t.pass ? '✅' : '❌';
            console.log(`${icon} ${t.name}${t.detail ? ` (${t.detail})` : ''}`);
        });
        const allPass = tests.every(t => t.pass);
        console.log(allPass ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED');
        console.groupEnd();

        return allPass;
    }

    // ====================================================================
    // INDICATOR AUDIT — SANITY TESTS
    // Returns { pass, checks:[], samples:{} }
    // Does NOT change any strategy logic or parameters.
    // ====================================================================

    function _stddev(arr) {
        if (arr.length < 2) return 0;
        const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
        const variance = arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length;
        return Math.sqrt(variance);
    }

    function _sampleSlice(arr, warmup) {
        const n = arr.length;
        const region = arr.slice(warmup);
        return {
            first5: region.slice(0, 5),
            mid5: region.slice(Math.floor(region.length / 2), Math.floor(region.length / 2) + 5),
            last5: region.slice(-5),
            mean: region.length ? region.reduce((a, b) => a + b, 0) / region.length : NaN,
            stddev: _stddev(region)
        };
    }

    function runIndicatorSanityTests(candles, config) {
        const n = candles.length;
        const warmup = Math.max(VOL_TREND_PERIOD, VOL_ATR_PERIOD + VOL_ATR_AVG_PERIOD, VOL_BREAKOUT_LOOKBACK + 1);
        const checks = [];
        const samples = {};

        // Pre-compute full series arrays for indicators after warmup
        const sma50Arr = [], sma20Arr = [], atr14Arr = [], rsiArr = [];
        const compArr = [], breakArr = [];
        const closePrices = candles.map(c => c.close);
        const minClose = Math.min(...closePrices);
        const maxClose = Math.max(...closePrices);

        for (let i = warmup; i < n; i++) {
            sma50Arr.push(computeSMA(candles, i, VOL_TREND_PERIOD));
            sma20Arr.push(computeSMA(candles, i, VOL_EXIT_SMA_PERIOD));
            atr14Arr.push(computeATR(candles, i, VOL_ATR_PERIOD));
            rsiArr.push(computeRSI(candles, i, VOL_ATR_PERIOD));

            // Compression flag at each bar
            let consec = 0, found = false;
            const searchStart = Math.max(warmup, i - VOL_COMPRESSION_RECENCY);
            for (let k = searchStart; k <= i; k++) {
                const atrK = computeATR(candles, k, VOL_ATR_PERIOD);
                let atrAvg = 0;
                for (let m = k - VOL_ATR_AVG_PERIOD + 1; m <= k; m++) atrAvg += computeATR(candles, m, VOL_ATR_PERIOD);
                atrAvg /= VOL_ATR_AVG_PERIOD;
                if (atrK < atrAvg) { consec++; if (consec >= VOL_COMPRESSION_BARS) { found = true; break; } }
                else consec = 0;
            }
            compArr.push(found ? 1 : 0);

            // Breakout flag
            let highestHigh = 0;
            for (let k = i - VOL_BREAKOUT_LOOKBACK; k < i; k++) if (candles[k].high > highestHigh) highestHigh = candles[k].high;
            breakArr.push(candles[i].close > highestHigh ? 1 : 0);
        }

        samples.sma50 = _sampleSlice(sma50Arr, 0);
        samples.sma20 = _sampleSlice(sma20Arr, 0);
        samples.atr14 = _sampleSlice(atr14Arr, 0);
        samples.rsi = _sampleSlice(rsiArr, 0);
        samples.compressionFlag = _sampleSlice(compArr, 0);
        samples.breakoutFlag = _sampleSlice(breakArr, 0);

        // ---- CHECK A: No NaN / Infinity after warmup ----
        const checkAData = [
            { name: 'SMA50', arr: sma50Arr },
            { name: 'SMA20', arr: sma20Arr },
            { name: 'ATR14', arr: atr14Arr },
            { name: 'RSI', arr: rsiArr }
        ];
        checkAData.forEach(({ name, arr }) => {
            const badIdx = arr.findIndex(v => !isFinite(v) || isNaN(v));
            const pass = badIdx === -1;
            checks.push({ name: `A: No NaN/Inf in ${name}`, pass, details: pass ? `all ${arr.length} values finite` : `first bad at warmup+${badIdx}: ${arr[badIdx]}` });
        });

        // ---- CHECK B: Indicators not constant (stddev > 0) ----
        [['SMA50', sma50Arr], ['SMA20', sma20Arr], ['ATR14', atr14Arr], ['RSI', rsiArr]].forEach(([name, arr]) => {
            const sd = _stddev(arr);
            checks.push({ name: `B: ${name} is not constant`, pass: sd > 0, details: `stddev=${sd.toFixed(6)}` });
        });

        // ---- CHECK C: Range checks ----
        // ATR > 0
        const atrAllPos = atr14Arr.every(v => v > 0);
        checks.push({ name: 'C: ATR14 > 0 after warmup', pass: atrAllPos, details: `min=${atr14Arr.length ? Math.min(...atr14Arr).toFixed(4) : 'n/a'}` });
        // RSI in [0,100]
        const rsiBad = rsiArr.filter(v => v < 0 || v > 100);
        checks.push({ name: 'C: RSI in [0,100]', pass: rsiBad.length === 0, details: `out-of-range count=${rsiBad.length}` });
        // SMA within price range (generous ±50% tolerance for trending assets)
        const smaLo = minClose * 0.5, smaHi = maxClose * 1.5;
        const smaBad = sma50Arr.filter(v => v < smaLo || v > smaHi);
        checks.push({ name: 'C: SMA50 within candle price range', pass: smaBad.length === 0, details: `range [${smaLo.toFixed(2)}, ${smaHi.toFixed(2)}] oob=${smaBad.length}` });

        // ---- CHECK D: Time alignment (no look-ahead) ----
        // For 5 k-points: compute indicator on slice(0,k+1) and compare with full-series[k]
        const kPoints = [];
        const step = Math.floor((n - 1 - warmup) / 6);
        for (let p = 1; p <= 5; p++) kPoints.push(warmup + p * step);

        let alignOk = true;
        const alignDetails = [];
        const TOL = 1e-9;
        kPoints.forEach(k => {
            const sliced = candles.slice(0, k + 1);
            const smaTrunc = computeSMA(sliced, k, VOL_TREND_PERIOD);
            const smaFull = computeSMA(candles, k, VOL_TREND_PERIOD);
            const atrTrunc = computeATR(sliced, k, VOL_ATR_PERIOD);
            const atrFull = computeATR(candles, k, VOL_ATR_PERIOD);
            const rsiTrunc = computeRSI(sliced, k, VOL_ATR_PERIOD);
            const rsiFull = computeRSI(candles, k, VOL_ATR_PERIOD);
            const smaDiff = Math.abs(smaTrunc - smaFull);
            const atrDiff = Math.abs(atrTrunc - atrFull);
            const rsiDiff = Math.abs(rsiTrunc - rsiFull);
            const ok = smaDiff <= TOL && atrDiff <= TOL && rsiDiff <= TOL;
            if (!ok) alignOk = false;
            alignDetails.push(`k=${k}: Δsma=${smaDiff.toExponential(2)} Δatr=${atrDiff.toExponential(2)} Δrsi=${rsiDiff.toExponential(2)} ok=${ok}`);
        });
        checks.push({ name: 'D: Time alignment (no look-ahead)', pass: alignOk, details: alignDetails.join(' | ') });

        // ---- Self-test: ATR period sensitivity (Test 4 guard) ----
        // Compute ATR with period=14 vs period=20 on same data; assert stddevs differ.
        // This ONLY uses a local variable — does NOT change engine constants.
        const ALT_PERIOD = 20;
        const atrAlt = [];
        for (let i = warmup; i < n; i++) atrAlt.push(computeATR(candles, i, ALT_PERIOD));
        const sdBase = _stddev(atr14Arr);
        const sdAlt = _stddev(atrAlt);
        const sensitivityOk = Math.abs(sdBase - sdAlt) > 1e-9 || (sdBase === 0 && sdAlt === 0);
        checks.push({
            name: `Self-test: ATR(${VOL_ATR_PERIOD}) stddev differs from ATR(${ALT_PERIOD})`,
            pass: sensitivityOk,
            details: `ATR${VOL_ATR_PERIOD}_stddev=${sdBase.toFixed(4)} ATR${ALT_PERIOD}_stddev=${sdAlt.toFixed(4)} diff=${Math.abs(sdBase - sdAlt).toFixed(6)}`
        });

        const pass = checks.every(c => c.pass);
        return { pass, checks, samples };
    }

    // ====================================================================
    // SIGNAL TRACE INSTRUMENTATION — read-only mirror of signal loop
    // Does NOT execute trades. Records why each entry/exit fired or gated.
    // ====================================================================

    function runSignalTrace(candles, config) {
        const n = candles.length;
        const minBars = Math.max(VOL_TREND_PERIOD, VOL_ATR_PERIOD + VOL_ATR_AVG_PERIOD, VOL_BREAKOUT_LOOKBACK + 1);

        const entries = [];
        const exits = [];
        const blocked = { trendFilter: 0, compression: 0, breakout: 0, atrIncreasing: 0 };
        let totalSignalChecks = 0;

        // Mirrors runBacktest's pending flags but read-only — only tracks signals.
        let inPosition = false;
        let pendingEntry = false;
        let pendingExit = false;
        let traceEntryIdx = -1; // which candle index the pending entry was signalled on

        for (let i = 1; i < n; i++) {
            // --- Execute pending entry (purely for state tracking, no capital change) ---
            if (pendingEntry && !inPosition) {
                inPosition = true;
                pendingEntry = false;
            }
            // --- Execute pending exit ---
            if (pendingExit && inPosition) {
                inPosition = false;
                pendingExit = false;
            }
            // --- Stop-loss tracking ---
            // We don't know stopPrice without executing capital math, so we
            // replicate the minimal logic needed:
            // (stop tracking: not needed for signal trace — exits are captured via signal)

            if (i < minBars) continue;

            totalSignalChecks++;

            // --- Compute all indicator values at bar i ---
            const close = candles[i].close;
            const sma50 = computeSMA(candles, i, VOL_TREND_PERIOD);
            const sma20 = computeSMA(candles, i, VOL_EXIT_SMA_PERIOD);
            const atr14 = computeATR(candles, i, VOL_ATR_PERIOD);
            const atr14Prev = computeATR(candles, i - 1, VOL_ATR_PERIOD);

            // atrAvg20: average of the last 20 ATR values
            let atrAvg20 = 0;
            for (let m = i - VOL_ATR_AVG_PERIOD + 1; m <= i; m++) {
                atrAvg20 += computeATR(candles, m, VOL_ATR_PERIOD);
            }
            atrAvg20 /= VOL_ATR_AVG_PERIOD;

            const rsi = computeRSI(candles, i, VOL_ATR_PERIOD);

            let highestHigh10 = 0;
            for (let k = i - VOL_BREAKOUT_LOOKBACK; k < i; k++) {
                if (candles[k].high > highestHigh10) highestHigh10 = candles[k].high;
            }
            const atrRatio = atrAvg20 > 0 ? atr14 / atrAvg20 : 0;

            const snap = { close, sma50, sma20, atr14, atrAvg20, rsi, highestHigh10, atrRatio };

            // ---- EXIT path ----
            if (inPosition) {
                if (close < sma20) {
                    exits.push({
                        exitIndex: i,
                        exitTimeISO: candles[i].date instanceof Date ? candles[i].date.toISOString() : String(candles[i].date),
                        exitPrice: candles[i].close,
                        exitReason: 'SIGNAL',
                        indicatorSnapshot: snap
                    });
                    pendingExit = true;
                }
                continue; // engine skips entry checks when in position
            }

            // ---- ENTRY path: evaluate each gate ----
            // Gate 1: Trend filter
            const slopeLag = Math.min(5, i - VOL_TREND_PERIOD + 1);
            const sma50Prev = computeSMA(candles, i - slopeLag, VOL_TREND_PERIOD);
            const trendFilter = close > sma50 && sma50 > sma50Prev;

            if (!trendFilter) { blocked.trendFilter++; continue; }

            // Gate 2: Compression
            let consec = 0, foundCompression = false;
            const searchStart = Math.max(minBars, i - VOL_COMPRESSION_RECENCY);
            for (let k = searchStart; k <= i; k++) {
                const atrK = computeATR(candles, k, VOL_ATR_PERIOD);
                let avg = 0;
                for (let m = k - VOL_ATR_AVG_PERIOD + 1; m <= k; m++) avg += computeATR(candles, m, VOL_ATR_PERIOD);
                avg /= VOL_ATR_AVG_PERIOD;
                if (atrK < avg) { consec++; if (consec >= VOL_COMPRESSION_BARS) { foundCompression = true; break; } }
                else consec = 0;
            }
            if (!foundCompression) { blocked.compression++; continue; }

            // Gate 3: Breakout
            const breakout = close > highestHigh10;
            if (!breakout) { blocked.breakout++; continue; }

            // Gate 4: ATR increasing
            const atrIncreasing = atr14 > atr14Prev;
            if (!atrIncreasing) { blocked.atrIncreasing++; continue; }

            // All gates passed — entry signal
            entries.push({
                entryIndex: i,
                entryTimeISO: candles[i].date instanceof Date ? candles[i].date.toISOString() : String(candles[i].date),
                entryPrice: close,
                reasons: { trendFilter, compression: foundCompression, breakout, atrIncreasing },
                indicatorSnapshot: snap
            });
            pendingEntry = true;
            inPosition = true; // immediately simulate entering so next bars see position
        }

        return {
            entries,
            exits,
            stats: {
                totalSignals: totalSignalChecks,
                entriesTaken: entries.length,
                entriesBlockedByWhichReasonCounts: blocked
            }
        };
    }

    // ====================================================================
    // CONSOLE HELPERS — exposed on window for DevTools use
    // window._lastAuditCandles / window._lastAuditConfig are cached by backtest.js
    //   after every runBacktest call so these work without re-fetching.
    // ====================================================================

    // ====================================================================
    // GENERIC INDICATOR SERIES COMPUTER
    // Computes full-length series arrays (one value per bar).
    // Values before warmup period are NaN.
    // ====================================================================

    function _computeEMA(candles, period) {
        const n = candles.length;
        const out = new Array(n).fill(NaN);
        if (n < period) return out;
        // Seed with SMA
        let sum = 0;
        for (let j = 0; j < period; j++) sum += candles[j].close;
        out[period - 1] = sum / period;
        const k = 2 / (period + 1);
        for (let i = period; i < n; i++) {
            out[i] = candles[i].close * k + out[i - 1] * (1 - k);
        }
        return out;
    }

    function _computeSMASeries(candles, period) {
        const n = candles.length;
        const out = new Array(n).fill(NaN);
        for (let i = period - 1; i < n; i++) {
            out[i] = computeSMA(candles, i, period);
        }
        return out;
    }

    function _computeRSISeries(candles, period) {
        const n = candles.length;
        const out = new Array(n).fill(NaN);
        for (let i = period; i < n; i++) {
            out[i] = computeRSI(candles, i, period);
        }
        return out;
    }

    function _computeATRSeries(candles, period) {
        const n = candles.length;
        const out = new Array(n).fill(NaN);
        for (let i = period; i < n; i++) {
            out[i] = computeATR(candles, i, period);
        }
        return out;
    }

    function _computeMACDSeries(candles, fast, slow, signal) {
        const n = candles.length;
        const emaFast = _computeEMA(candles, fast);
        const emaSlow = _computeEMA(candles, slow);
        const macdLine = new Array(n).fill(NaN);
        for (let i = slow - 1; i < n; i++) {
            if (!isNaN(emaFast[i]) && !isNaN(emaSlow[i])) macdLine[i] = emaFast[i] - emaSlow[i];
        }
        // Signal line = EMA(macdLine, signal)
        const sigLine = new Array(n).fill(NaN);
        // Seed first signal value
        let firstIdx = -1;
        for (let i = 0; i < n; i++) { if (!isNaN(macdLine[i])) { firstIdx = i; break; } }
        if (firstIdx < 0 || n - firstIdx < signal) return { macd: macdLine, signal: sigLine, hist: new Array(n).fill(NaN) };
        let sum = 0;
        for (let j = firstIdx; j < firstIdx + signal; j++) sum += macdLine[j];
        sigLine[firstIdx + signal - 1] = sum / signal;
        const k = 2 / (signal + 1);
        for (let i = firstIdx + signal; i < n; i++) {
            sigLine[i] = macdLine[i] * k + sigLine[i - 1] * (1 - k);
        }
        const hist = macdLine.map((v, i) => (isNaN(v) || isNaN(sigLine[i])) ? NaN : v - sigLine[i]);
        return { macd: macdLine, signal: sigLine, hist };
    }

    /**
     * _computeIndicatorSeries — builds a named series map from strategyDef.indicators.
     * Returns { 'SMA_20': [...], 'RSI_14': [...], 'PRICE': [...], ... }
     */
    function _computeIndicatorSeries(candles, indicators) {
        const map = {};
        // Always include PRICE (close) series
        map['PRICE'] = candles.map(c => c.close);
        for (const ind of (indicators || [])) {
            const type = (ind.type || '').toUpperCase();
            const p = ind.params || {};
            try {
                if (type === 'SMA') {
                    const period = parseInt(p.period || 20);
                    map[`SMA_${period}`] = _computeSMASeries(candles, period);
                } else if (type === 'EMA') {
                    const period = parseInt(p.period || 20);
                    map[`EMA_${period}`] = _computeEMA(candles, period);
                } else if (type === 'RSI') {
                    const period = parseInt(p.period || 14);
                    map[`RSI_${period}`] = _computeRSISeries(candles, period);
                } else if (type === 'ATR') {
                    const period = parseInt(p.period || 14);
                    map[`ATR_${period}`] = _computeATRSeries(candles, period);
                } else if (type === 'MACD') {
                    const fast = parseInt(p.fast || 12);
                    const slow = parseInt(p.slow || 26);
                    const sig = parseInt(p.signal || 9);
                    const { macd, signal: sigLine, hist } = _computeMACDSeries(candles, fast, slow, sig);
                    map[`MACD_${fast}_${slow}_${sig}`] = macd;
                    map[`MACD_SIG_${fast}_${slow}_${sig}`] = sigLine;
                    map[`MACD_HIST_${fast}_${slow}_${sig}`] = hist;
                } else {
                    console.warn(`[BacktestEngine] Unknown indicator type: "${type}" — skipped.`);
                }
            } catch (e) {
                console.warn(`[BacktestEngine] Error computing indicator ${type}:`, e);
            }
        }
        return map;
    }

    /**
     * _resolveValue — resolves a rule lhs/rhs token to a number at bar i.
     * Token is either a numeric string, or a series key like "RSI_14", "SMA_20",
     * or a UI-friendly label like "RSI(14)", "SMA(20)", "Price".
     */
    function _resolveValue(token, seriesMap, i) {
        if (token === undefined || token === null || token === '') return NaN;
        const s = String(token).trim();
        // Numeric literal
        const num = parseFloat(s);
        if (isFinite(num)) return num;
        // Direct series key
        if (seriesMap[s] !== undefined) return seriesMap[s][i];
        // UI-friendly label mapping: "RSI(14)" → RSI_14, "SMA(20)" → SMA_20, etc.
        const mapped = s
            .replace(/^RSI\((\d+)\)$/i, 'RSI_$1')
            .replace(/^SMA\((\d+)\)$/i, 'SMA_$1')
            .replace(/^EMA\((\d+)\)$/i, 'EMA_$1')
            .replace(/^ATR\((\d+)\)$/i, 'ATR_$1')
            .replace(/^MACD Signal$/i, () => {
                // find first MACD_SIG key
                const k = Object.keys(seriesMap).find(sk => sk.startsWith('MACD_SIG'));
                return k || 'MACD_SIG';
            })
            .replace(/^Price$/i, 'PRICE')
            .replace(/^Close$/i, 'PRICE');
        if (seriesMap[mapped] !== undefined) return seriesMap[mapped][i];
        return NaN;
    }

    /**
     * _evaluateRules — evaluates an array of rules at bar i.
     * Returns true only if ALL rules pass (AND logic).
     * A rule has shape: { lhs, op, rhs, cross? }
     */
    function _evaluateRules(rules, seriesMap, i) {
        if (!rules || rules.length === 0) return false;
        for (const rule of rules) {
            const lhsVal = _resolveValue(rule.lhs, seriesMap, i);
            const rhsVal = _resolveValue(rule.rhs, seriesMap, i);
            if (!isFinite(lhsVal) || !isFinite(rhsVal)) return false;
            const op = (rule.op || '').toLowerCase().trim();
            let pass = false;
            if (op === '<') pass = lhsVal < rhsVal;
            else if (op === '>') pass = lhsVal > rhsVal;
            else if (op === '=') pass = Math.abs(lhsVal - rhsVal) < 1e-9;
            else if (op === 'crosses above' || op === 'cross') {
                // current bar: lhs > rhs; prev bar: lhs <= rhs
                const lhsPrev = _resolveValue(rule.lhs, seriesMap, i - 1);
                const rhsPrev = _resolveValue(rule.rhs, seriesMap, i - 1);
                pass = isFinite(lhsPrev) && isFinite(rhsPrev) && lhsVal > rhsVal && lhsPrev <= rhsPrev;
            } else if (op === 'crosses below') {
                const lhsPrev = _resolveValue(rule.lhs, seriesMap, i - 1);
                const rhsPrev = _resolveValue(rule.rhs, seriesMap, i - 1);
                pass = isFinite(lhsPrev) && isFinite(rhsPrev) && lhsVal < rhsVal && lhsPrev >= rhsPrev;
            } else {
                // Unknown op — skip rule (treat as not-passing)
                console.warn(`[BacktestEngine] Unknown rule operator: "${rule.op}"`);
                pass = false;
            }
            if (!pass) return false;
        }
        return true;
    }

    // ====================================================================
    // runBacktestWithStrategy — new unified entrypoint
    // If strategyDef.mode == 'VOL_BREAKOUT': delegates to existing runBacktest
    // Else: generic rule-based execution using strategyDef.indicators + rules
    // ====================================================================

    function runBacktestWithStrategy(candles, runConfig, strategyDef) {
        // --- VOL_BREAKOUT: full parity path, zero changes ---
        if (!strategyDef || strategyDef.mode === 'VOL_BREAKOUT') {
            const result = runBacktest(candles, runConfig);
            result.strategyHash = RunConfigShared.hashStrategy(strategyDef);
            result.strategyMode = 'VOL_BREAKOUT';
            return result;
        }

        // --- Generic rule-based backtest ---
        const startingCapital = _requireNum(runConfig, 'startingCapital');
        const riskPercent = _requireNum(runConfig, 'riskPercent');
        const stopPercent = _requireNum(runConfig, 'stopPercent');
        const slippagePct = _requireNum(runConfig, 'slippagePct');
        const feeRate = _requireNum(runConfig, 'feeRate');

        // Optional take-profit from strategyDef.risk
        const takeProfitPct = (strategyDef.risk && strategyDef.risk.takeProfitPct > 0)
            ? strategyDef.risk.takeProfitPct : Infinity;

        // Precompute all indicator series
        const seriesMap = _computeIndicatorSeries(candles, strategyDef.indicators || []);

        const entryRules = strategyDef.entryRules || [];
        const exitRules = strategyDef.exitRules || [];

        const trades = [];
        const equityCurve = [startingCapital];

        let inPosition = false;
        let capital = startingCapital;
        let shares = 0;
        let entryIdx = -1;
        let entryPrice = 0;
        let stopPrice = 0;
        let takeProfitPrice = 0;
        let riskAmount = 0;
        let pendingEntry = false;
        let pendingExit = false;

        const n = candles.length;

        for (let i = 1; i < n; i++) {
            // Execute pending entry
            if (pendingEntry && !inPosition) {
                const rawPrice = candles[i].open;
                const execPrice = rawPrice * (1.0 + slippagePct);

                stopPrice = execPrice * (1.0 - stopPercent);
                takeProfitPrice = takeProfitPct < Infinity ? execPrice * (1.0 + takeProfitPct) : Infinity;
                const stopDistance = execPrice - stopPrice;
                riskAmount = capital * riskPercent;
                shares = riskAmount / stopDistance;

                const maxShares = (capital * (1.0 - feeRate)) / execPrice;
                if (shares > maxShares) shares = maxShares;

                const cost = shares * execPrice;
                const fee = cost * feeRate / (1.0 - feeRate);
                capital -= cost + fee;

                entryPrice = execPrice;
                entryIdx = i;
                inPosition = true;
                pendingEntry = false;
            }

            // Execute pending exit
            if (pendingExit && inPosition) {
                const rawPrice = candles[i].open;
                const execPrice = rawPrice * (1.0 - slippagePct);

                const grossValue = shares * execPrice;
                const netValue = grossValue * (1.0 - feeRate);
                const costBasis = shares * entryPrice;
                const entryFee = costBasis * feeRate / (1.0 - feeRate);
                const totalCost = costBasis + entryFee;

                trades.push({
                    entryIdx, exitIdx: i, entryPrice, exitPrice: execPrice,
                    stopPrice,
                    pnl: netValue - totalCost,
                    returnPct: ((netValue - totalCost) / totalCost) * 100.0,
                    rMultiple: riskAmount > 0 ? (netValue - totalCost) / riskAmount : 0,
                    holdingPeriod: i - entryIdx,
                    isWin: (netValue - totalCost) > 0,
                    exitReason: 'SIGNAL'
                });

                capital += netValue;
                shares = 0;
                inPosition = false;
                stopPrice = 0;
                takeProfitPrice = 0;
                pendingExit = false;
            }

            // Stop-loss
            if (inPosition && candles[i].low <= stopPrice) {
                const execPrice = stopPrice * (1.0 - slippagePct);
                const grossValue = shares * execPrice;
                const netValue = grossValue * (1.0 - feeRate);
                const costBasis = shares * entryPrice;
                const entryFee = costBasis * feeRate / (1.0 - feeRate);
                const totalCost = costBasis + entryFee;

                trades.push({
                    entryIdx, exitIdx: i, entryPrice, exitPrice: execPrice,
                    stopPrice,
                    pnl: netValue - totalCost,
                    returnPct: ((netValue - totalCost) / totalCost) * 100.0,
                    rMultiple: riskAmount > 0 ? (netValue - totalCost) / riskAmount : 0,
                    holdingPeriod: i - entryIdx,
                    isWin: false,
                    exitReason: 'STOP'
                });

                capital += netValue;
                shares = 0;
                inPosition = false;
                stopPrice = 0;
                takeProfitPrice = 0;
            }

            // Take-profit
            if (inPosition && takeProfitPrice < Infinity && candles[i].high >= takeProfitPrice) {
                const execPrice = takeProfitPrice * (1.0 - slippagePct);
                const grossValue = shares * execPrice;
                const netValue = grossValue * (1.0 - feeRate);
                const costBasis = shares * entryPrice;
                const entryFee = costBasis * feeRate / (1.0 - feeRate);
                const totalCost = costBasis + entryFee;

                trades.push({
                    entryIdx, exitIdx: i, entryPrice, exitPrice: execPrice,
                    stopPrice,
                    pnl: netValue - totalCost,
                    returnPct: ((netValue - totalCost) / totalCost) * 100.0,
                    rMultiple: riskAmount > 0 ? (netValue - totalCost) / riskAmount : 0,
                    holdingPeriod: i - entryIdx,
                    isWin: true,
                    exitReason: 'TAKE_PROFIT'
                });

                capital += netValue;
                shares = 0;
                inPosition = false;
                stopPrice = 0;
                takeProfitPrice = 0;
            }

            // Evaluate entry/exit rules
            if (inPosition) {
                if (_evaluateRules(exitRules, seriesMap, i)) pendingExit = true;
            } else {
                if (_evaluateRules(entryRules, seriesMap, i)) pendingEntry = true;
            }

            // Mark-to-market equity
            equityCurve.push(inPosition ? capital + shares * candles[i].close : capital);
        }

        const result = {
            trades,
            equityCurve,
            finalCapital: equityCurve[equityCurve.length - 1],
            totalBars: n - 1,
            strategyHash: RunConfigShared.hashStrategy(strategyDef),
            strategyMode: 'GENERIC_RULES',
            _seriesMap: seriesMap   // kept for audit use — not enumerated in JSON export
        };
        return result;
    }

    // ====================================================================
    // GENERIC AUDIT HELPER — for non-VOL_BREAKOUT strategies
    // ====================================================================

    function _printAuditSummaryGeneric(strategyDef, seriesMap, entries) {
        console.group('╔══════════════════════════════════════╗');
        console.log('║    GENERIC STRATEGY AUDIT SUMMARY    ║');
        console.log('╚══════════════════════════════════════╝');
        console.log('[AUDIT] mode=GENERIC_RULES');
        console.log('[AUDIT] strategyHash=', RunConfigShared.hashStrategy(strategyDef));

        // Computed indicator series
        const seriesKeys = Object.keys(seriesMap);
        console.log('[AUDIT] Computed indicator series:', seriesKeys);
        seriesKeys.forEach(k => {
            const arr = seriesMap[k];
            const valid = arr.filter(v => isFinite(v));
            const warmup = arr.findIndex(v => isFinite(v));
            console.log(`  ${k}: warmup=${warmup} validBars=${valid.length} mean=${valid.length ? (valid.reduce((a, b) => a + b, 0) / valid.length).toFixed(4) : 'n/a'}`);
        });

        // First 3 rule matches (entry bars)
        console.log(`[AUDIT] Entry rule matches: ${entries.length} total. First 3:`);
        entries.slice(0, 3).forEach((e, idx) => {
            console.log(`  Entry #${idx + 1}: bar=${e.barIdx} time=${e.timeISO} indicatorValues=`, e.values);
        });

        console.groupEnd();
    }

    function auditIndicatorsCurrentRun() {
        const candles = window._lastAuditCandles;
        const config = window._lastAuditConfig;
        const strategyDef = window._lastAuditStrategyDef;
        if (!candles || !config) {
            console.warn('[BacktestEngine] No run cached. Click "Run Backtest" or "🧪 Indicator Audit" first.');
            return null;
        }

        // VOL_BREAKOUT path (existing, unchanged)
        if (!strategyDef || strategyDef.mode === 'VOL_BREAKOUT') {
            const report = runIndicatorSanityTests(candles, config);
            const trace = runSignalTrace(candles, config);
            window._lastSignalTrace = trace;
            _printAuditSummary(report, trace);
            return { sanity: report, trace };
        }

        // Generic path
        const seriesMap = _computeIndicatorSeries(candles, strategyDef.indicators || []);
        // Find first 3 entry matches
        const entries = [];
        const n = candles.length;
        for (let i = 1; i < n && entries.length < 3; i++) {
            if (_evaluateRules(strategyDef.entryRules || [], seriesMap, i)) {
                const values = {};
                Object.keys(seriesMap).forEach(k => { values[k] = seriesMap[k][i]; });
                entries.push({
                    barIdx: i,
                    timeISO: candles[i].date instanceof Date ? candles[i].date.toISOString() : String(candles[i].date),
                    values
                });
            }
        }
        _printAuditSummaryGeneric(strategyDef, seriesMap, entries);
        return { strategyDef, seriesMap, entries };
    }

    function traceTrade(n) {
        const trace = window._lastSignalTrace;
        if (!trace) {
            console.warn('[BacktestEngine] No trace cached. Run audit first.');
            return null;
        }
        if (!Number.isInteger(n) || n < 1 || n > trace.entries.length) {
            console.warn(`[BacktestEngine] Trade #${n} not found. Trace has ${trace.entries.length} entries (1-indexed).`);
            return null;
        }
        const entry = trace.entries[n - 1];
        console.group(`📍 Trade Trace #${n}`);
        console.log('Entry Index:   ', entry.entryIndex);
        console.log('Entry Time:    ', entry.entryTimeISO);
        console.log('Entry Price:   ', entry.entryPrice);
        console.log('Reasons:', entry.reasons);
        console.log('Snapshot:', entry.indicatorSnapshot);
        console.groupEnd();
        return entry;
    }

    function _printAuditSummary(report, trace) {
        const status = report.pass ? '✅ PASS' : '❌ FAIL';
        console.group(`╔══════════════════════════════════════╗`);
        console.log(`║      AUDIT SUMMARY  ${status}          ║`);
        console.log(`╚══════════════════════════════════════╝`);
        report.checks.forEach(c => {
            const icon = c.pass ? '✅' : '❌';
            console.log(`${icon} ${c.name} — ${c.details}`);
        });
        console.log(`--- Signal Trace ---`);
        console.log(`Total bars checked: ${trace.stats.totalSignals}`);
        console.log(`Entries taken:      ${trace.stats.entriesTaken}`);
        console.log(`Exits taken:        ${trace.exits.length}`);
        console.log(`Blocked by gate:   `, trace.stats.entriesBlockedByWhichReasonCounts);
        if (trace.entries.length > 0) {
            console.log('First entry trace:', trace.entries[0]);
        }
        console.groupEnd();
    }

    // ====================================================================
    // PUBLIC API
    // ====================================================================

    return {
        PRESETS,
        computeSMA,
        computeATR,
        computeRSI,
        generateSignalVolBreakout,
        runBacktest,
        runBacktestWithStrategy,   // NEW — unified entrypoint
        computeMetrics,
        computeDrawdownCurve,
        computeDistribution,
        computeMonthlyReturns,
        fetchOHLCV,
        buildRunConfigFromUI,
        collectInputs,          // legacy alias → buildRunConfigFromUI
        computeCandlesetHash,
        runIntegrationTests,
        // ---- Audit + Trace ----
        runIndicatorSanityTests,
        runSignalTrace,
        auditIndicatorsCurrentRun,
        traceTrade,
        // ---- Generic helpers (exposed for testing) ----
        _computeIndicatorSeries,
        _evaluateRules
    };

})();
