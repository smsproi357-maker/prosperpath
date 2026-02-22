/* ========================================================================
   BACKTEST ENGINE — Real VOL_BREAKOUT Engine (ported from C++ backtest_engine.cpp)
   Pure JavaScript, no dependencies. Source of truth for all backtest math.
   DO NOT MODIFY strategy logic, indicators, or position sizing.
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

    function runBacktest(candles, config) {
        const startingCapital = config.startingCapital || 100000;
        const riskPercent = config.riskPercent || 0.02;
        const stopPercent = config.stopPercent || 0.02;
        const slippagePct = config.slippagePct || 0.001;
        const feeRate = config.feeRate || 0.001;

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
        const startingCapital = config.startingCapital || 100000;
        const trades = result.trades;
        const eq = result.equityCurve;
        const totalBars = result.totalBars;

        // Return
        const totalReturn = ((result.finalCapital - startingCapital) / startingCapital) * 100;

        // CAGR — estimate years from bar count and timeframe
        const tfHours = { '1m': 1 / 60, '5m': 5 / 60, '15m': 0.25, '1h': 1, '4h': 4, '1d': 24, '1w': 168 };
        const hoursPerBar = tfHours[config.timeframe] || 24;
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

        // Paginate — Binance returns max 1000 candles per request
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

        if (allCandles.length < 100) {
            throw new Error(`Insufficient data: only ${allCandles.length} candles loaded. Need at least 100.`);
        }

        return allCandles;
    }

    // ====================================================================
    // COLLECT UI INPUTS
    // ====================================================================

    function collectInputs() {
        const asset = document.getElementById('asset-select')?.value || 'SPY';
        const timeframe = document.getElementById('timeframe-select')?.value || '1d';
        const startDate = document.getElementById('start-date')?.value || '2023-01-01';
        const endDate = document.getElementById('end-date')?.value || '2025-12-31';
        const startingCapital = parseFloat(document.getElementById('starting-capital')?.value) || 100000;
        const positionPct = parseFloat(document.getElementById('position-size')?.value) || 10;
        const feePct = parseFloat(document.getElementById('trading-fees')?.value) || 0.10;
        const slippagePct = parseFloat(document.getElementById('slippage')?.value) || 0.05;
        const stopLossPct = parseFloat(document.getElementById('stop-loss')?.value) || 2.0;

        return {
            asset,
            timeframe,
            startDate,
            endDate,
            startingCapital,
            riskPercent: positionPct / 100,
            feeRate: feePct / 100,
            slippagePct: slippagePct / 100,
            stopPercent: stopLossPct / 100
        };
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
    // PUBLIC API
    // ====================================================================

    return {
        PRESETS,
        computeSMA,
        computeATR,
        computeRSI,
        generateSignalVolBreakout,
        runBacktest,
        computeMetrics,
        computeDrawdownCurve,
        computeDistribution,
        computeMonthlyReturns,
        fetchOHLCV,
        collectInputs,
        runIntegrationTests
    };

})();
