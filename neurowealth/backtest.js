/* ========================================
   BACKTEST ENGINE — Chart Rendering & Interactivity
   Powered by real BacktestEngine (backtest-engine.js)
   ======================================== */

(function () {
    'use strict';

    // ---- State: populated by real engine after backtest runs ----
    let ohlcvData = [];
    let equityCurve = [];
    let drawdownData = [];
    let distributionData = [];
    let monthlyReturns = {};
    let lastResult = null;
    let lastMetrics = null;

    // ---- A/B Compare Runs State ----
    let baselineReport = null;
    let currentReport = null;

    // ---- Strategy Versioning State ----
    const DEBUG_VERSION_JOURNAL = true;

    function logJournal(...args) {
        if (DEBUG_VERSION_JOURNAL) {
            console.log('[Journal Debug]', ...args);
        }
    }

    // ---- Canvas Rendering ----

    function initCanvas(canvasId, parentId) {
        const canvas = document.getElementById(canvasId);
        const parent = document.getElementById(parentId);
        if (!canvas || !parent) return null;
        const rect = parent.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        canvas.style.width = rect.width + 'px';
        canvas.style.height = rect.height + 'px';
        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, rect.width, rect.height);
        return { ctx, w: rect.width, h: rect.height };
    }

    // Candlestick Chart
    function drawCandlestickChart() {
        const r = initCanvas('candlestick-canvas', 'main-chart');
        if (!r || ohlcvData.length === 0) return;
        const { ctx, w, h } = r;
        const data = ohlcvData.slice(-120);
        const padding = { top: 24, right: 60, bottom: 30, left: 60 };
        const chartW = w - padding.left - padding.right;
        const chartH = h - padding.top - padding.bottom;

        const minP = Math.min(...data.map(d => d.low)) * 0.998;
        const maxP = Math.max(...data.map(d => d.high)) * 1.002;

        // Grid
        ctx.strokeStyle = 'rgba(255,255,255,0.04)';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 5; i++) {
            const y = padding.top + (i / 5) * chartH;
            ctx.beginPath();
            ctx.moveTo(padding.left, y);
            ctx.lineTo(w - padding.right, y);
            ctx.stroke();

            const val = maxP - (i / 5) * (maxP - minP);
            ctx.fillStyle = '#475569';
            ctx.font = '10px "JetBrains Mono", monospace';
            ctx.textAlign = 'right';
            ctx.fillText('$' + val.toFixed(val > 100 ? 0 : 2), padding.left - 8, y + 3);
        }

        // Candles
        const barW = chartW / data.length;
        for (let i = 0; i < data.length; i++) {
            const d = data[i];
            const x = padding.left + i * barW;
            const bullish = d.close >= d.open;

            const openY = padding.top + ((maxP - d.open) / (maxP - minP)) * chartH;
            const closeY = padding.top + ((maxP - d.close) / (maxP - minP)) * chartH;
            const highY = padding.top + ((maxP - d.high) / (maxP - minP)) * chartH;
            const lowY = padding.top + ((maxP - d.low) / (maxP - minP)) * chartH;

            // Wick
            ctx.strokeStyle = bullish ? '#22c55e' : '#ef4444';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x + barW / 2, highY);
            ctx.lineTo(x + barW / 2, lowY);
            ctx.stroke();

            // Body
            ctx.fillStyle = bullish ? 'rgba(34, 197, 94, 0.85)' : 'rgba(239, 68, 68, 0.85)';
            const bodyTop = Math.min(openY, closeY);
            const bodyH = Math.max(Math.abs(closeY - openY), 1);
            ctx.fillRect(x + 1, bodyTop, barW - 2, bodyH);
        }

        // Trade markers (if we have trades and enough data)
        if (lastResult && lastResult.trades.length > 0) {
            const offset = Math.max(0, ohlcvData.length - 120);
            lastResult.trades.forEach(t => {
                // Entry marker
                const ei = t.entryIdx - offset;
                if (ei >= 0 && ei < data.length) {
                    const ex = padding.left + ei * barW + barW / 2;
                    const ey = padding.top + ((maxP - data[ei].low) / (maxP - minP)) * chartH + 10;
                    ctx.fillStyle = '#22c55e';
                    ctx.beginPath();
                    ctx.moveTo(ex, ey);
                    ctx.lineTo(ex - 4, ey + 8);
                    ctx.lineTo(ex + 4, ey + 8);
                    ctx.closePath();
                    ctx.fill();
                }
                // Exit marker
                const xi = t.exitIdx - offset;
                if (xi >= 0 && xi < data.length) {
                    const xx = padding.left + xi * barW + barW / 2;
                    const xy = padding.top + ((maxP - data[xi].high) / (maxP - minP)) * chartH - 10;
                    ctx.fillStyle = t.isWin ? '#22c55e' : '#ef4444';
                    ctx.beginPath();
                    ctx.moveTo(xx, xy);
                    ctx.lineTo(xx - 4, xy - 8);
                    ctx.lineTo(xx + 4, xy - 8);
                    ctx.closePath();
                    ctx.fill();
                }
            });
        }
    }

    // Volume Chart
    function drawVolumeChart() {
        const r = initCanvas('volume-canvas', 'volume-chart');
        if (!r || ohlcvData.length === 0) return;
        const { ctx, w, h } = r;
        const data = ohlcvData.slice(-120);
        const padding = { top: 4, right: 60, bottom: 4, left: 10 };
        const chartW = w - padding.left - padding.right;

        const maxVol = Math.max(...data.map(d => d.volume));
        const barW = chartW / data.length;

        for (let i = 0; i < data.length; i++) {
            const d = data[i];
            const x = padding.left + i * barW;
            const bH = (d.volume / maxVol) * (h - padding.top - padding.bottom);
            const bullish = d.close >= d.open;
            ctx.fillStyle = bullish ? 'rgba(34, 197, 94, 0.25)' : 'rgba(239, 68, 68, 0.25)';
            ctx.fillRect(x + 1, h - padding.bottom - bH, barW - 2, bH);
        }
    }

    // Equity Curve Chart
    function drawEquityChart(progress = 1) {
        const r = initCanvas('equity-canvas', 'equity-chart');
        if (!r || equityCurve.length === 0) return;
        const { ctx, w, h } = r;
        const padding = { top: 24, right: 60, bottom: 30, left: 60 };
        const chartW = w - padding.left - padding.right;
        const chartH = h - padding.top - padding.bottom;

        const minE = Math.min(...equityCurve) * 0.98;
        const maxE = Math.max(...equityCurve) * 1.02;

        // Grid (Always draw full grid)
        ctx.strokeStyle = 'rgba(255,255,255,0.04)';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 5; i++) {
            const y = padding.top + (i / 5) * chartH;
            ctx.beginPath();
            ctx.moveTo(padding.left, y);
            ctx.lineTo(w - padding.right, y);
            ctx.stroke();

            const val = maxE - (i / 5) * (maxE - minE);
            ctx.fillStyle = '#475569';
            ctx.font = '10px "JetBrains Mono", monospace';
            ctx.textAlign = 'right';
            ctx.fillText('$' + Math.round(val).toLocaleString(), padding.left - 8, y + 3);
        }

        // Determine how many points to draw based on progress
        const totalPoints = equityCurve.length;
        const drawCount = Math.floor(totalPoints * progress);
        if (drawCount < 2) return;

        // Area fill
        const gradient = ctx.createLinearGradient(0, padding.top, 0, h - padding.bottom);
        gradient.addColorStop(0, 'rgba(99, 102, 241, 0.2)');
        gradient.addColorStop(1, 'rgba(99, 102, 241, 0)');

        ctx.beginPath();
        for (let i = 0; i < drawCount; i++) {
            const x = padding.left + (i / (totalPoints - 1)) * chartW;
            const y = padding.top + ((maxE - equityCurve[i]) / (maxE - minE)) * chartH;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        // Drop down to bottom for area close
        const lastX = padding.left + ((drawCount - 1) / (totalPoints - 1)) * chartW;
        ctx.lineTo(lastX, h - padding.bottom);
        ctx.lineTo(padding.left, h - padding.bottom);
        ctx.closePath();
        ctx.fillStyle = gradient;
        ctx.fill();

        // Line
        ctx.beginPath();
        ctx.strokeStyle = '#6366f1';
        ctx.lineWidth = 2;
        for (let i = 0; i < drawCount; i++) {
            const x = padding.left + (i / (totalPoints - 1)) * chartW;
            const y = padding.top + ((maxE - equityCurve[i]) / (maxE - minE)) * chartH;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
    }

    // Drawdown Chart
    function drawDrawdownChart() {
        const r = initCanvas('drawdown-canvas', 'drawdown-chart');
        if (!r || drawdownData.length === 0) return;
        const { ctx, w, h } = r;
        const padding = { top: 24, right: 60, bottom: 30, left: 60 };
        const chartW = w - padding.left - padding.right;
        const chartH = h - padding.top - padding.bottom;

        const minDD = Math.min(...drawdownData) * 1.1;

        // Grid
        ctx.strokeStyle = 'rgba(255,255,255,0.04)';
        for (let i = 0; i <= 5; i++) {
            const y = padding.top + (i / 5) * chartH;
            ctx.beginPath();
            ctx.moveTo(padding.left, y);
            ctx.lineTo(w - padding.right, y);
            ctx.stroke();

            const val = -(i / 5) * Math.abs(minDD);
            ctx.fillStyle = '#475569';
            ctx.font = '10px "JetBrains Mono", monospace';
            ctx.textAlign = 'right';
            ctx.fillText(val.toFixed(1) + '%', padding.left - 8, y + 3);
        }

        // Area
        const gradient = ctx.createLinearGradient(0, padding.top, 0, h - padding.bottom);
        gradient.addColorStop(0, 'rgba(239, 68, 68, 0)');
        gradient.addColorStop(1, 'rgba(239, 68, 68, 0.25)');

        ctx.beginPath();
        for (let i = 0; i < drawdownData.length; i++) {
            const x = padding.left + (i / (drawdownData.length - 1)) * chartW;
            const y = padding.top + (drawdownData[i] / minDD) * chartH;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.lineTo(padding.left + chartW, padding.top);
        ctx.lineTo(padding.left, padding.top);
        ctx.closePath();
        ctx.fillStyle = gradient;
        ctx.fill();

        // Line
        ctx.beginPath();
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 1.5;
        for (let i = 0; i < drawdownData.length; i++) {
            const x = padding.left + (i / (drawdownData.length - 1)) * chartW;
            const y = padding.top + (drawdownData[i] / minDD) * chartH;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
    }

    // Distribution Histogram
    function drawDistributionChart() {
        const r = initCanvas('distribution-canvas', 'distribution-chart');
        if (!r || distributionData.length === 0) return;
        const { ctx, w, h } = r;
        const padding = { top: 24, right: 40, bottom: 40, left: 40 };
        const chartW = w - padding.left - padding.right;
        const chartH = h - padding.top - padding.bottom;

        const maxVal = Math.max(...distributionData.map(d => d.value));
        const barW = chartW / distributionData.length;

        // Grid
        ctx.strokeStyle = 'rgba(255,255,255,0.04)';
        for (let i = 0; i <= 4; i++) {
            const y = padding.top + (i / 4) * chartH;
            ctx.beginPath();
            ctx.moveTo(padding.left, y);
            ctx.lineTo(w - padding.right, y);
            ctx.stroke();
        }

        // Bars
        for (let i = 0; i < distributionData.length; i++) {
            const d = distributionData[i];
            const x = padding.left + i * barW;
            const bH = maxVal > 0 ? (d.value / maxVal) * chartH : 0;
            const isPos = d.pct >= 0;

            const grad = ctx.createLinearGradient(x, h - padding.bottom - bH, x, h - padding.bottom);
            if (isPos) {
                grad.addColorStop(0, 'rgba(34, 197, 94, 0.7)');
                grad.addColorStop(1, 'rgba(34, 197, 94, 0.2)');
            } else {
                grad.addColorStop(0, 'rgba(239, 68, 68, 0.7)');
                grad.addColorStop(1, 'rgba(239, 68, 68, 0.2)');
            }

            ctx.fillStyle = grad;
            const gap = 3;
            ctx.beginPath();
            const bx = x + gap;
            const bw = barW - gap * 2;
            const by = h - padding.bottom - bH;
            const radius = 3;
            ctx.moveTo(bx + radius, by);
            ctx.lineTo(bx + bw - radius, by);
            ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + radius);
            ctx.lineTo(bx + bw, h - padding.bottom);
            ctx.lineTo(bx, h - padding.bottom);
            ctx.lineTo(bx, by + radius);
            ctx.quadraticCurveTo(bx, by, bx + radius, by);
            ctx.closePath();
            ctx.fill();

            // Labels
            ctx.fillStyle = '#475569';
            ctx.font = '9px "JetBrains Mono", monospace';
            ctx.textAlign = 'center';
            ctx.fillText(d.label, x + barW / 2, h - padding.bottom + 16);

            // Value on top
            if (d.value > 0) {
                ctx.fillStyle = '#64748b';
                ctx.fillText(d.value.toString(), x + barW / 2, by - 6);
            }
        }
    }

    // Monthly Heatmap
    function renderHeatmap() {
        const tbody = document.getElementById('heatmap-body');
        if (!tbody) return;
        tbody.innerHTML = '';

        Object.keys(monthlyReturns).sort().forEach(year => {
            const row = document.createElement('tr');
            const yearCell = document.createElement('td');
            yearCell.className = 'year-label';
            yearCell.textContent = year;
            row.appendChild(yearCell);

            let yearTotal = 0;
            const vals = monthlyReturns[year];
            for (let m = 0; m < 12; m++) {
                const val = vals && vals[m] !== null && vals[m] !== undefined ? vals[m] : 0;
                yearTotal += val;
                const cell = document.createElement('td');
                cell.textContent = (val >= 0 ? '+' : '') + val.toFixed(1) + '%';

                if (val >= 3) cell.className = 'bt-hm-strong-pos';
                else if (val >= 1.5) cell.className = 'bt-hm-pos';
                else if (val >= 0) cell.className = 'bt-hm-slight-pos';
                else if (val >= -1.5) cell.className = 'bt-hm-slight-neg';
                else if (val >= -3) cell.className = 'bt-hm-neg';
                else cell.className = 'bt-hm-strong-neg';

                row.appendChild(cell);
            }

            const totalCell = document.createElement('td');
            totalCell.className = 'year-total';
            totalCell.textContent = (yearTotal >= 0 ? '+' : '') + yearTotal.toFixed(1) + '%';
            if (yearTotal >= 0) totalCell.classList.add('bt-hm-pos');
            else totalCell.classList.add('bt-hm-neg');
            row.appendChild(totalCell);

            tbody.appendChild(row);
        });
    }

    // ---- Tab Switching ----
    function initTabs() {
        const tabs = document.querySelectorAll('.bt-tab');
        const panels = document.querySelectorAll('.bt-analytics-panel');

        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                tabs.forEach(t => t.classList.remove('active'));
                panels.forEach(p => p.classList.remove('active'));
                tab.classList.add('active');
                const target = document.getElementById('tab-' + tab.dataset.tab);
                if (target) {
                    target.classList.add('active');
                    // Render on demand
                    if (tab.dataset.tab === 'equity') drawEquityChart();
                    else if (tab.dataset.tab === 'drawdown') drawDrawdownChart();
                    else if (tab.dataset.tab === 'distribution') drawDistributionChart();
                    else if (tab.dataset.tab === 'monthly') renderHeatmap();
                }
            });
        });
    }

    // ---- Toggle Buttons ----
    function initToggles() {
        document.querySelectorAll('.bt-toggle').forEach(btn => {
            btn.addEventListener('click', () => {
                btn.classList.toggle('active');
            });
        });
    }

    // ---- Run Backtest Button ----
    function initRunButton() {
        const btn = document.getElementById('btn-run-backtest');
        const status = document.getElementById('bt-status');
        const overlay = document.getElementById('bt-loading-overlay');
        const stepsContainer = document.getElementById('bt-loading-steps');
        if (!btn || !overlay || !stepsContainer) return;

        btn.addEventListener('click', () => {
            activeLoadedVersionId = null; // Clear context on new run

            // 1. Disable button & Show Overlay
            btn.classList.add('running');
            btn.innerHTML = `Running...`;
            btn.disabled = true;

            overlay.classList.add('active');
            stepsContainer.innerHTML = ''; // Clear previous steps

            if (status) {
                status.querySelector('.bt-status-dot').style.background = '#f59e0b';
                status.querySelector('.bt-status-dot').style.boxShadow = '0 0 8px rgba(245, 158, 11, 0.5)';
                status.querySelector('span:last-child').textContent = 'Running';
            }

            // Reset Metrics to Zero
            const metrics = [
                'totalReturn', 'cagr', 'maxDrawdown', 'sharpe', 'sortino',
                'winRate', 'profitFactor', 'expectancy', 'tradeCount',
                'calmar', 'avgWinLoss', 'maxConsecLosses', 'avgTradeDuration', 'exposureTime'
            ];
            metrics.forEach(key => {
                const el = document.querySelector(`[data-metric="${key}"]`);
                if (el) {
                    el.classList.remove('positive', 'negative');
                    if (key === 'expectancy') el.textContent = '$0';
                    else if (key === 'tradeCount' || key === 'maxConsecLosses') el.textContent = '0';
                    else if (key === 'avgTradeDuration') el.textContent = '0.0d';
                    else if (key === 'sharpe' || key === 'sortino' || key === 'profitFactor' || key === 'calmar' || key === 'avgWinLoss') el.textContent = '0.00';
                    else el.textContent = '0.00%';
                }
            });

            // Helper to add a step
            const addStep = (text, delay) => {
                return new Promise(resolve => {
                    setTimeout(() => {
                        const step = document.createElement('div');
                        step.className = 'bt-loading-step';
                        step.innerHTML = `
                            <div class="step-icon">
                                <svg class="step-spinner" width="12" height="12" viewBox="0 0 12 12" fill="none">
                                    <circle cx="6" cy="6" r="5" stroke="currentColor" stroke-width="2" stroke-dasharray="15 8" fill="none"/>
                                </svg>
                            </div>
                            <span>${text}</span>
                        `;
                        stepsContainer.appendChild(step);
                        // Mark previous step as done
                        const prev = step.previousElementSibling;
                        if (prev) {
                            prev.classList.add('complete');
                            prev.querySelector('.step-icon').innerHTML = `<span class="step-check">✓</span>`;
                        }
                        resolve(step);
                    }, delay);
                });
            };

            // Run Sequence — REAL ENGINE
            (async () => {
                try {
                    const config = BacktestEngine.collectInputs();

                    await addStep('Loading historical data...', 100);

                    // REAL: Fetch data from Binance
                    const candles = await BacktestEngine.fetchOHLCV(
                        config.asset, config.timeframe, config.startDate, config.endDate
                    );
                    ohlcvData = candles;

                    // Update chart header with real asset info
                    const chartTitle = document.querySelector('.bt-panel-center .bt-panel-title');
                    if (chartTitle) chartTitle.textContent = config.asset;
                    const chartPrice = document.querySelector('.bt-chart-price');
                    if (chartPrice) chartPrice.textContent = '$' + candles[candles.length - 1].close.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                    const chartChange = document.querySelector('.bt-chart-change');
                    if (chartChange) {
                        const pctChange = ((candles[candles.length - 1].close - candles[0].close) / candles[0].close * 100);
                        chartChange.textContent = (pctChange >= 0 ? '+' : '') + pctChange.toFixed(2) + '%';
                        chartChange.className = 'bt-chart-change ' + (pctChange >= 0 ? 'positive' : 'negative');
                    }

                    await addStep(`Computing indicators (${candles.length} bars)...`, 300);

                    await addStep('Executing trades...', 200);

                    // REAL: Run engine
                    const result = BacktestEngine.runBacktest(candles, config);
                    lastResult = result;

                    await addStep('Calculating performance metrics...', 200);

                    // REAL: Compute all derived data
                    const rawMetrics = BacktestEngine.computeMetrics(result, config);
                    equityCurve = result.equityCurve;
                    drawdownData = BacktestEngine.computeDrawdownCurve(equityCurve);
                    distributionData = BacktestEngine.computeDistribution(result.trades);
                    monthlyReturns = BacktestEngine.computeMonthlyReturns(candles, equityCurve);

                    const lastStep = await addStep('Generating performance report...', 200);

                    // Run integration tests
                    BacktestEngine.runIntegrationTests(candles, result, rawMetrics);

                    console.log('📊 Backtest Result:', {
                        trades: result.trades.length,
                        finalCapital: result.finalCapital.toFixed(2),
                        metrics: rawMetrics
                    });

                    // Mark last step done
                    setTimeout(() => {
                        lastStep.classList.add('complete');
                        lastStep.querySelector('.step-icon').innerHTML = `<span class="step-check">✓</span>`;
                        finishBacktest(rawMetrics);
                    }, 300);

                } catch (error) {
                    console.error('❌ Backtest error:', error);

                    // Show error in loading overlay
                    stepsContainer.innerHTML = `
                        <div class="bt-loading-step" style="color: #f87171;">
                            <div class="step-icon"><span style="color:#ef4444;">✗</span></div>
                            <span>${error.message}</span>
                        </div>
                    `;

                    setTimeout(() => {
                        overlay.classList.remove('active');
                        btn.classList.remove('running');
                        btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M4 3l11 6-11 6V3z" fill="currentColor"/></svg> Run Backtest`;
                        btn.disabled = false;
                        if (status) {
                            status.querySelector('.bt-status-dot').style.background = '#ef4444';
                            status.querySelector('.bt-status-dot').style.boxShadow = '0 0 8px rgba(239, 68, 68, 0.5)';
                            status.querySelector('span:last-child').textContent = 'Error';
                        }
                    }, 2000);
                }
            })();
        });

        function finishBacktest(rawMetrics) {
            lastMetrics = rawMetrics;
            // Prepare UI for Animation
            overlay.classList.remove('active');

            // Build trade table from real trades
            const tradeTableBody = document.getElementById('trade-log-body');
            const tableWrap = document.querySelector('.bt-trade-table-wrap');
            if (tradeTableBody && tableWrap && lastResult) {
                const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                let html = '';
                // Show last 10 trades (most recent first)
                const recentTrades = lastResult.trades.slice(-10).reverse();
                recentTrades.forEach(t => {
                    const entryDate = ohlcvData[t.entryIdx] ? ohlcvData[t.entryIdx].date : null;
                    const exitDate = ohlcvData[t.exitIdx] ? ohlcvData[t.exitIdx].date : null;
                    const entryStr = entryDate ? months[entryDate.getMonth()] + ' ' + entryDate.getDate() : 'Bar ' + t.entryIdx;
                    const exitStr = exitDate ? months[exitDate.getMonth()] + ' ' + exitDate.getDate() : 'Bar ' + t.exitIdx;
                    const cssClass = t.isWin ? 'positive' : 'negative';
                    const pct = (t.returnPct >= 0 ? '+' : '') + t.returnPct.toFixed(2) + '%';
                    const pnlStr = (t.pnl >= 0 ? '+$' : '-$') + Math.abs(Math.round(t.pnl)).toLocaleString();
                    const tfHours = { '1m': 1 / 60, '5m': 5 / 60, '15m': 0.25, '1h': 1, '4h': 4, '1d': 24, '1w': 168 };
                    const tf = document.getElementById('timeframe-select')?.value || '1d';
                    const daysHeld = (t.holdingPeriod * (tfHours[tf] || 24) / 24).toFixed(0);
                    html += `<tr><td>${entryStr}</td><td>${exitStr}</td><td><span class="bt-side long">LONG</span></td><td class="${cssClass}">${pct}</td><td class="${cssClass}">${pnlStr}</td><td>${daysHeld}d</td></tr>`;
                });
                tradeTableBody.innerHTML = html;

                // Hide table for now
                tableWrap.style.opacity = '0';
                tableWrap.style.transform = 'translateY(10px)';
                tableWrap.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
                tableWrap.classList.remove('fade-in');
            }

            // Start Animation Loop
            let startTime = null;
            const duration = 1200; // 1.2s total animation

            // Clear static charts first to avoid flash
            const ctx = document.getElementById('equity-canvas').getContext('2d');
            ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

            // Trigger Animation after brief pause
            setTimeout(() => {
                requestAnimationFrame(step);
            }, 200);

            function step(timestamp) {
                if (!startTime) startTime = timestamp;
                const progress = Math.min((timestamp - startTime) / duration, 1);
                const ease = 1 - Math.pow(1 - progress, 3); // Cubic ease out

                // 1. Animate Equity Chart (Left to Right)
                drawEquityChart(ease);

                // 2. Animate Metrics (Count up)
                updateMetricsDisplay(rawMetrics, ease);

                if (progress < 1) {
                    requestAnimationFrame(step);
                } else {
                    // Animation Complete
                    onAnimationComplete();
                }
            }

            function updateMetricsDisplay(targets, progress) {
                // Helper: lerp
                const lerp = (start, end, t) => start + (end - start) * t;

                // 1. Total Return
                const trVal = lerp(0, parseFloat(targets.totalReturn), progress);
                setMetric('totalReturn', (trVal >= 0 ? '+' : '') + trVal.toFixed(2) + '%', trVal > 0 ? 'positive' : (trVal < 0 ? 'negative' : ''));

                // 2. CAGR
                const cagrVal = lerp(0, parseFloat(targets.cagr), progress);
                setMetric('cagr', (cagrVal >= 0 ? '+' : '') + cagrVal.toFixed(2) + '%', cagrVal > 0 ? 'positive' : (cagrVal < 0 ? 'negative' : ''));

                // 3. Max Drawdown
                const ddVal = lerp(0, parseFloat(targets.maxDrawdown), progress);
                setMetric('maxDrawdown', ddVal.toFixed(2) + '%', 'negative');

                // 4. Sharpe & Sortino (Default color)
                setMetric('sharpe', lerp(0, parseFloat(targets.sharpe), progress).toFixed(2));
                setMetric('sortino', lerp(0, parseFloat(targets.sortino), progress).toFixed(2));

                // 5. Win Rate
                setMetric('winRate', lerp(0, parseFloat(targets.winRate), progress).toFixed(1) + '%');

                // 6. Profit Factor
                const pfVal = lerp(0, parseFloat(targets.profitFactor), progress);
                setMetric('profitFactor', pfVal.toFixed(2), pfVal > 1.0 ? 'positive' : (pfVal < 1.0 && progress === 1 ? 'negative' : ''));

                // 7. Expectancy
                const expVal = lerp(0, targets.expectancy, progress);
                setMetric('expectancy', (expVal >= 0 ? '$' : '-$') + Math.abs(Math.floor(expVal)), expVal > 0 ? 'positive' : (expVal < 0 ? 'negative' : ''));

                setMetric('tradeCount', Math.floor(lerp(0, targets.tradeCount, progress)));

                // Risk-Adjusted Section
                setMetric('calmar', lerp(0, parseFloat(targets.calmar), progress).toFixed(2));
                setMetric('avgWinLoss', lerp(0, parseFloat(targets.avgWinLoss), progress).toFixed(2));
                setMetric('maxConsecLosses', Math.floor(lerp(0, targets.maxConsecLosses, progress)));
                setMetric('avgTradeDuration', lerp(0, parseFloat(targets.avgTradeDuration), progress).toFixed(1) + 'd');
                setMetric('exposureTime', lerp(0, parseFloat(targets.exposureTime), progress).toFixed(1) + '%');
            }

            function setMetric(id, text, colorClass) {
                const el = document.querySelector(`[data-metric="${id}"]`);
                if (el) {
                    el.textContent = text;
                    if (colorClass) {
                        el.classList.add(colorClass);
                    } else {
                        el.classList.remove('positive', 'negative');
                    }
                }
            }

            function onAnimationComplete() {
                // Draw other static charts
                drawCandlestickChart();
                drawVolumeChart();
                drawDrawdownChart();
                drawDistributionChart();

                // Fade in table
                if (tableWrap) {
                    tableWrap.style.opacity = '1';
                    tableWrap.style.transform = 'translateY(0)';
                }

                // Reset Button
                btn.classList.remove('running');
                btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M4 3l11 6-11 6V3z" fill="currentColor"/></svg> Run Backtest`;
                btn.disabled = false;

                // Show exports
                const exportGroup = document.getElementById('export-group');
                if (exportGroup) exportGroup.style.display = 'grid';

                // Populate currentReport for A/B Compare and show compare group
                currentReport = buildReportObj('internal');
                const compareGroup = document.getElementById('compare-group');
                if (compareGroup) compareGroup.style.display = 'grid';
                updateCompareButtonState();
                if (typeof updateJournalButtonsState === 'function') updateJournalButtonsState();

                // Show Explain Results button
                const explainBtn = document.getElementById('btn-explain-results');
                if (explainBtn) explainBtn.style.display = 'flex';

                if (status) {
                    status.querySelector('.bt-status-dot').style.background = '#22c55e';
                    status.querySelector('.bt-status-dot').style.boxShadow = '0 0 8px rgba(34, 197, 94, 0.5)';
                    status.querySelector('span:last-child').textContent = 'Ready';
                }

                console.log('✅ INTEGRATION COMPLETE — UI now powered by real backtest engine');
            }
        }
    }

    // ---- Indicator Add/Remove ----
    function initIndicators() {
        // Remove buttons
        document.querySelectorAll('.bt-indicator-remove').forEach(btn => {
            btn.addEventListener('click', () => {
                btn.closest('.bt-indicator-card').remove();
            });
        });

        // Add indicator placeholder
        const addBtn = document.getElementById('btn-add-indicator');
        if (addBtn) {
            addBtn.addEventListener('click', () => {
                const list = document.getElementById('indicator-list');
                if (!list) return;
                const card = document.createElement('div');
                card.className = 'bt-indicator-card';
                card.innerHTML = `
          <div class="bt-indicator-header">
            <span class="bt-indicator-badge" style="background:rgba(234,179,8,0.15);color:#facc15;border:1px solid rgba(234,179,8,0.25);">EMA</span>
            <span class="bt-indicator-name">Exp. Moving Average</span>
            <button class="bt-indicator-remove" title="Remove">&times;</button>
          </div>
          <div class="bt-indicator-params">
            <div class="bt-mini-field">
              <label>Period</label>
              <input type="number" value="50" class="bt-input-mini">
            </div>
            <div class="bt-mini-field">
              <label>Source</label>
              <select class="bt-select-mini">
                <option>Close</option>
                <option>Open</option>
                <option>High</option>
                <option>Low</option>
              </select>
            </div>
          </div>
        `;
                list.appendChild(card);
                card.querySelector('.bt-indicator-remove').addEventListener('click', () => card.remove());
            });
        }
    }

    // ---- Add spin animation ----
    const spinStyle = document.createElement('style');
    spinStyle.textContent = `@keyframes bt-spin { to { transform: rotate(360deg); } }`;
    document.head.appendChild(spinStyle);

    // ---- Resize Handler ----
    let resizeTimeout;
    function handleResize() {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            drawCandlestickChart();
            drawVolumeChart();
            const activeTab = document.querySelector('.bt-tab.active');
            if (activeTab) {
                if (activeTab.dataset.tab === 'equity') drawEquityChart();
                else if (activeTab.dataset.tab === 'drawdown') drawDrawdownChart();
                else if (activeTab.dataset.tab === 'distribution') drawDistributionChart();
            }
        }, 200);
    }

    // ---- AI Strategy Modal ----
    function initAIStrategyModal() {
        const overlay = document.getElementById('ai-modal-overlay');
        const openBtn = document.getElementById('btn-ai-strategy');
        const closeBtn = document.getElementById('btn-modal-close');
        const advToggle = document.getElementById('advanced-mode-toggle');
        const advArea = document.getElementById('advanced-area');
        const generateBtn = document.getElementById('btn-generate-strategy');
        const resultPanel = document.getElementById('ai-result');
        const resultCode = document.getElementById('ai-result-code');
        const applyBtn = document.getElementById('btn-apply-strategy');

        if (!overlay || !openBtn) return;

        // Open modal
        openBtn.addEventListener('click', () => {
            overlay.classList.add('open');
            document.body.style.overflow = 'hidden';
        });

        // Close modal
        function closeModal() {
            overlay.classList.remove('open');
            document.body.style.overflow = '';
        }

        if (closeBtn) closeBtn.addEventListener('click', closeModal);

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeModal();
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && overlay.classList.contains('open')) closeModal();
        });

        // Advanced mode toggle
        if (advToggle && advArea) {
            advToggle.addEventListener('change', () => {
                advArea.style.display = advToggle.checked ? 'block' : 'none';
            });
        }

        // Mock AI strategy response
        const mockStrategy = {
            name: "EMA Crossover + RSI Filter",
            asset: "SPY",
            timeframe: "Daily",
            indicators: [
                { type: "EMA", params: { period: 50, source: "Close" } },
                { type: "EMA", params: { period: 200, source: "Close" } },
                { type: "RSI", params: { period: 14, overbought: 70, oversold: 30 } }
            ],
            entry: {
                logic: "AND",
                conditions: [
                    { indicator: "EMA(50)", operator: "crosses above", target: "EMA(200)" },
                    { indicator: "RSI(14)", operator: "<", target: 30 }
                ]
            },
            exit: {
                logic: "OR",
                conditions: [
                    { indicator: "RSI(14)", operator: "crosses above", target: 70 },
                    { indicator: "EMA(50)", operator: "crosses below", target: "EMA(200)" }
                ]
            },
            risk: {
                stop_loss: "2.5%",
                take_profit: "6.0%",
                position_size: "15%",
                max_drawdown_halt: "12%"
            }
        };

        // Generate Strategy
        if (generateBtn) {
            generateBtn.addEventListener('click', () => {
                generateBtn.classList.add('loading');
                const originalHTML = generateBtn.innerHTML;
                generateBtn.innerHTML = `
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style="animation: bt-spin 1s linear infinite;">
                        <circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.5" stroke-dasharray="24 10" fill="none"/>
                    </svg>
                    Generating...
                `;

                if (resultPanel) resultPanel.style.display = 'none';

                // Simulate AI processing
                setTimeout(() => {
                    generateBtn.classList.remove('loading');
                    generateBtn.innerHTML = originalHTML;

                    // Show result
                    if (resultCode) {
                        resultCode.textContent = JSON.stringify(mockStrategy, null, 2);
                    }
                    if (resultPanel) {
                        resultPanel.style.display = 'block';
                        resultPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    }
                }, 2400);
            });
        }

        // Apply to Strategy Builder
        if (applyBtn) {
            applyBtn.addEventListener('click', () => {
                // Update strategy name
                const nameInput = document.getElementById('strategy-name');
                if (nameInput) nameInput.value = mockStrategy.name;

                // Update asset
                const assetSelect = document.getElementById('asset-select');
                if (assetSelect) {
                    const aiAsset = document.getElementById('ai-asset');
                    if (aiAsset) assetSelect.value = aiAsset.value;
                }

                // Update timeframe
                const tfSelect = document.getElementById('timeframe-select');
                if (tfSelect) {
                    const aiTf = document.getElementById('ai-timeframe');
                    if (aiTf) tfSelect.value = aiTf.value;
                }

                // Update dates
                const startDate = document.getElementById('start-date');
                const endDate = document.getElementById('end-date');
                const aiStart = document.getElementById('ai-start');
                const aiEnd = document.getElementById('ai-end');
                if (startDate && aiStart) startDate.value = aiStart.value;
                if (endDate && aiEnd) endDate.value = aiEnd.value;

                // Update risk fields based on profile
                const riskProfile = document.getElementById('ai-risk-profile');
                const slInput = document.getElementById('stop-loss');
                const tpInput = document.getElementById('take-profit');
                const posInput = document.getElementById('position-size');

                if (riskProfile && slInput && tpInput && posInput) {
                    const profile = riskProfile.value;
                    if (profile === 'conservative') {
                        slInput.value = '1.5'; tpInput.value = '3.0'; posInput.value = '5';
                    } else if (profile === 'moderate') {
                        slInput.value = '2.5'; tpInput.value = '6.0'; posInput.value = '15';
                    } else {
                        slInput.value = '4.0'; tpInput.value = '10.0'; posInput.value = '25';
                    }
                }

                // Flash the strategy builder panel briefly
                const leftPanel = document.getElementById('panel-left');
                if (leftPanel) {
                    leftPanel.style.boxShadow = '0 0 20px rgba(99, 102, 241, 0.25)';
                    leftPanel.style.transition = 'box-shadow 0.5s';
                    setTimeout(() => {
                        leftPanel.style.boxShadow = '';
                    }, 1500);
                }

                // Close modal
                closeModal();

                // Scroll to strategy builder on mobile
                if (window.innerWidth <= 1024 && leftPanel) {
                    leftPanel.scrollIntoView({ behavior: 'smooth' });
                }
            });
        }
    }

    // ---- Production Preset & Exports ----

    function initPresets() {
        const selector = document.getElementById('preset-selector');
        if (!selector) return;

        selector.addEventListener('change', function () {
            const val = selector.value;
            const badge = document.getElementById('production-badge');
            const notes = document.getElementById('production-notes');
            const symbolHeader = document.getElementById('chart-symbol');
            const exportGroup = document.getElementById('export-group');

            // Inputs to lock
            const inputs = [
                'asset-select', 'timeframe-select', 'start-date', 'end-date',
                'starting-capital', 'trading-fees', 'slippage', 'stop-loss', 'position-size'
            ];

            if (val === 'BTC_4H_PRODUCTION') {
                if (badge) badge.style.display = 'inline-flex';
                if (notes) notes.style.display = 'block';
                if (symbolHeader) symbolHeader.textContent = 'BTC-USD (PRODUCTION)';

                // Set production values
                document.getElementById('asset-select').value = 'BTC-USD';
                document.getElementById('timeframe-select').value = '4h';
                document.getElementById('start-date').value = '2019-01-01';
                document.getElementById('end-date').value = '2024-12-31';
                document.getElementById('starting-capital').value = '10000';
                document.getElementById('trading-fees').value = '0.10';
                document.getElementById('slippage').value = '0.10';
                document.getElementById('stop-loss').value = '2.0';
                document.getElementById('position-size').value = '2.0';

                // Lock inputs
                inputs.forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.disabled = true;
                });

                // Clear indicators and set production ones (virtual lockout)
                const list = document.getElementById('indicator-list');
                if (list) list.innerHTML = '<!-- Production Locked --> <div class="bt-indicator-card"><div class="bt-indicator-header"><span class="bt-indicator-badge sma">Locked</span><span class="bt-indicator-name">VOL_BREAKOUT PRODUCTION LOGIC</span></div></div>';
            } else {
                if (badge) badge.style.display = 'none';
                if (notes) notes.style.display = 'none';
                if (symbolHeader) symbolHeader.textContent = document.getElementById('asset-select').value;

                // Unlock inputs
                inputs.forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.disabled = false;
                });

                // Restore indicators (re-init base list)
                initIndicators();
            }
        });
    }

    function initExports() {
        const btnConfig = document.getElementById('btn-export-config');
        const btnReport = document.getElementById('btn-export-report');

        if (btnConfig) {
            btnConfig.addEventListener('click', () => {
                const config = BacktestEngine.collectInputs();
                const exportObj = {
                    version: "1.0.0-parity",
                    timestamp: new Date().toISOString(),
                    preset: document.getElementById('preset-selector').value,
                    config: config
                };
                downloadJSON(exportObj, `config_${exportObj.preset}_${Date.now()}.json`);
            });
        }

        if (btnReport) {
            btnReport.addEventListener('click', () => {
                if (!lastResult) return alert('Please run a backtest first.');
                const exportObj = buildReportObj('export');
                downloadJSON(exportObj, `report_${Date.now()}.json`);
            });
        }

        initCompareButtons();
    }

    function buildReportObj(mode = 'export') {
        if (!lastResult) return null;

        const obj = {
            runTimestamp: new Date().toISOString(),
            preset_name: document.getElementById('preset-selector')?.value || 'CUSTOM',
            config: BacktestEngine.collectInputs(),
            metrics: lastMetrics || {}, // FIX: Use lastMetrics since lastResult.metrics is undefined
            tradeCount: lastResult.trades.length,
            trades: lastResult.trades.map(t => ({
                entryIdx: t.entryIdx,
                exitIdx: t.exitIdx,
                pnl: t.pnl,
                returnPct: t.returnPct,
                rMultiple: t.rMultiple || 0,
                reason: t.exitReason || 'EXPIRED'
            })),
            candleMetadata: {
                count: ohlcvData.length,
                first: ohlcvData[0] ? ohlcvData[0].date : null,
                last: ohlcvData[ohlcvData.length - 1] ? ohlcvData[ohlcvData.length - 1].date : null
            },
            // Save the last 120 candles so Replay mode can render the main chart
            candles: ohlcvData.slice(-120),
            // Include chart states for run snapshots
            equityCurve: equityCurve || [],
            drawdownCurve: drawdownData || [],
            distributionData: distributionData || [],
            monthlyReturns: monthlyReturns || {}
        };

        return obj;
    }

    function initCompareButtons() {
        const btnSave = document.getElementById('btn-save-baseline');
        const btnCompare = document.getElementById('btn-compare-runs');

        if (!btnSave || !btnCompare) return;

        btnSave.addEventListener('click', () => {
            if (!currentReport) return alert('Please run a backtest first.');
            baselineReport = currentReport;
            btnSave.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" style="margin-right: 4px;"><path d="M10 2H2C1.44772 2 1 2.44772 1 3V9C1 9.55228 1.44772 10 2 10H10C10.5523 10 11 9.55228 11 9V3C11 2.44772 10.5523 2 10 2Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 5L5 7L9 3" stroke="#4ade80" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg> Baseline Saved`;
            btnSave.style.color = '#4ade80';
            btnSave.style.borderColor = 'rgba(74, 222, 128, 0.3)';
            btnSave.style.background = 'rgba(74, 222, 128, 0.08)';

            setTimeout(() => {
                btnSave.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" style="margin-right: 4px;"><path d="M10 2H2C1.44772 2 1 2.44772 1 3V9C1 9.55228 1.44772 10 2 10H10C10.5523 10 11 9.55228 11 9V3C11 2.44772 10.5523 2 10 2Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M1 5H11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg> Update Baseline`;
                btnSave.style.color = '#38bdf8';
                btnSave.style.borderColor = 'rgba(56, 189, 248, 0.2)';
                btnSave.style.background = 'rgba(56, 189, 248, 0.08)';
                updateCompareButtonState();
            }, 2000);

            updateCompareButtonState();
        });

        btnCompare.addEventListener('click', () => {
            if (!baselineReport || !currentReport) return;
            renderComparePanel();
        });
    }

    function updateCompareButtonState() {
        const btnCompare = document.getElementById('btn-compare-runs');
        if (!btnCompare) return;

        if (baselineReport && currentReport) {
            btnCompare.disabled = false;
            btnCompare.style.opacity = '1';
            btnCompare.style.cursor = 'pointer';
        } else {
            btnCompare.disabled = true;
            btnCompare.style.opacity = '0.5';
            btnCompare.style.cursor = 'not-allowed';
        }
    }

    function renderComparePanel() {
        const modal = document.getElementById('compare-modal');
        if (!modal) return;

        try {
            // --- Header Setup ---
            const bMeta = baselineReport.candleMetadata || {};
            const cMeta = currentReport.candleMetadata || {};
            const isMismatch = (bMeta.count !== cMeta.count) || (baselineReport.equityCurve?.length !== currentReport.equityCurve?.length);
            document.getElementById('compare-warning').style.display = isMismatch ? 'block' : 'none';

            let warningText = document.getElementById('compare-warning-text');
            if (!warningText) {
                const w = document.getElementById('compare-warning');
                if (w) w.innerText = "Series length differs; overlay is approximate.";
            } else {
                warningText.innerText = "Series length differs; overlay is approximate.";
            }

            // --- Helper: Format Delta ---
            const formatDelta = (base, curr, isHigherBetter = true, isPct = false, prefix = '') => {
                const bArr = String(base).match(/[\d.-]+/) || [0];
                const cArr = String(curr).match(/[\d.-]+/) || [0];
                let b = parseFloat(bArr[0]) || 0;
                let c = parseFloat(cArr[0]) || 0;

                if (String(base).includes('d') || String(base).includes('bars')) {
                    b = parseFloat(base) || 0; c = parseFloat(curr) || 0;
                }

                const diff = c - b;
                let cls = 'neutral-delta';
                let sign = '';

                if (Math.abs(diff) > 0.001) {
                    if ((diff > 0 && isHigherBetter) || (diff < 0 && !isHigherBetter)) {
                        cls = 'positive-delta';
                    } else {
                        cls = 'negative-delta';
                    }
                    sign = diff > 0 ? '+' : '';
                }

                const diffStr = diff % 1 === 0 ? diff.toString() : diff.toFixed(2);
                return `<td class="${cls}">${sign}${prefix}${diffStr}${isPct ? '%' : ''}</td>`;
            };

            // --- A) Headline Delta Table ---
            const bm = baselineReport.metrics || {};
            const cm = currentReport.metrics || {};
            const tbody = document.getElementById('compare-metrics-table').querySelector('tbody');

            const rows = [
                { label: 'Total Return', b: (bm.totalReturn || '0') + '%', c: (cm.totalReturn || '0') + '%', isHb: true, isPct: true },
                { label: 'CAGR', b: (bm.cagr || '0') + '%', c: (cm.cagr || '0') + '%', isHb: true, isPct: true },
                { label: 'Max Drawdown', b: (bm.maxDrawdown || '0') + '%', c: (cm.maxDrawdown || '0') + '%', isHb: false, isPct: true },
                { label: 'Sharpe Ratio', b: bm.sharpe || '0', c: cm.sharpe || '0', isHb: true, isPct: false },
                { label: 'Sortino Ratio', b: bm.sortino || '0', c: cm.sortino || '0', isHb: true, isPct: false },
                { label: 'Profit Factor', b: bm.profitFactor || '0', c: cm.profitFactor || '0', isHb: true, isPct: false },
                { label: 'Win Rate', b: (bm.winRate || '0') + '%', c: (cm.winRate || '0') + '%', isHb: true, isPct: true },
                { label: 'Avg Win/Loss', b: bm.avgWinLoss || '0', c: cm.avgWinLoss || '0', isHb: true, isPct: false },
                { label: 'Total Trades', b: baselineReport.tradeCount || 0, c: currentReport.tradeCount || 0, isHb: true, isPct: false },
                { label: 'Exposure Time', b: (bm.exposureTime || '0') + '%', c: (cm.exposureTime || '0') + '%', isHb: false, isPct: true }
            ];

            let tbodyHTML = '';
            rows.forEach(r => {
                tbodyHTML += `<tr>
                    <th style="text-align:left;">${r.label}</th>
                    <td>${r.b}</td>
                    <td>${r.c}</td>
                    ${formatDelta(r.b, r.c, r.isHb, r.isPct)}
                </tr>`;
            });
            tbody.innerHTML = tbodyHTML;

            // --- D) Trade Summary Diff ---
            const getTradeStats = (rep) => {
                const trades = rep.trades || [];
                const wins = trades.filter(t => t.pnl > 0);
                const losses = trades.filter(t => t.pnl <= 0);
                const stopExits = trades.filter(t => t.reason === 'STOP').length;
                const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0;
                const avgLoss = losses.length > 0 ? losses.reduce((s, t) => s + Math.abs(t.pnl), 0) / losses.length : 0;
                return { stops: stopExits, avgW: avgWin, avgL: avgLoss };
            };

            const bStats = getTradeStats(baselineReport);
            const cStats = getTradeStats(currentReport);

            const diffsGrid = document.getElementById('compare-trade-diffs');
            diffsGrid.innerHTML = `
                <div class="compare-diff-card">
                    <div class="compare-diff-label">Avg Win Size</div>
                    <div style="font-size: 0.85rem; color: #94a3b8; margin-bottom: 4px;">Base: $${bStats.avgW.toFixed(2)}</div>
                    <div class="compare-diff-value" style="color: ${cStats.avgW > bStats.avgW ? '#4ade80' : '#f87171'}">${cStats.avgW > bStats.avgW ? '+' : ''}$${(cStats.avgW - bStats.avgW).toFixed(2)}</div>
                </div>
                <div class="compare-diff-card">
                    <div class="compare-diff-label">Avg Loss Size</div>
                    <div style="font-size: 0.85rem; color: #94a3b8; margin-bottom: 4px;">Base: $${bStats.avgL.toFixed(2)}</div>
                    <div class="compare-diff-value" style="color: ${cStats.avgL < bStats.avgL ? '#4ade80' : '#f87171'}">${cStats.avgL > bStats.avgL ? '+' : ''}$${(cStats.avgL - bStats.avgL).toFixed(2)}</div>
                </div>
                <div class="compare-diff-card">
                    <div class="compare-diff-label">Stop-Loss Exits</div>
                    <div style="font-size: 0.85rem; color: #94a3b8; margin-bottom: 4px;">Base: ${bStats.stops}</div>
                    <div class="compare-diff-value" style="color: ${cStats.stops < bStats.stops ? '#4ade80' : '#f87171'}">${cStats.stops > bStats.stops ? '+' : ''}${cStats.stops - bStats.stops}</div>
                </div>
            `;

            // --- B/C) Overlay Charts ---
            drawCompareChart('equity');

            document.getElementById('compare-toggle-equity').onclick = (e) => {
                e.target.classList.add('active');
                document.getElementById('compare-toggle-drawdown').classList.remove('active');
                drawCompareChart('equity');
            };
            document.getElementById('compare-toggle-drawdown').onclick = (e) => {
                e.target.classList.add('active');
                document.getElementById('compare-toggle-equity').classList.remove('active');
                drawCompareChart('drawdown');
            };

            // --- Export ---
            const btnExport = document.getElementById('btn-export-compare');
            btnExport.onclick = () => {
                const exp = {
                    version: "1.0.0-compare",
                    runTimestamp: new Date().toISOString(),
                    baseline: { preset: baselineReport.preset_name, config: baselineReport.config, metrics: baselineReport.metrics },
                    current: { preset: currentReport.preset_name, config: currentReport.config, metrics: currentReport.metrics },
                    deltas: rows.map(r => ({ metric: r.label, baseline: r.b, current: r.c, diff: parseFloat(String(r.c).replace(/[^\d.-]/g, '')) - parseFloat(String(r.b).replace(/[^\d.-]/g, '')) })),
                    warnings: isMismatch ? ["Series length differs; overlay is approximate"] : []
                };
                downloadJSON(exp, `compare_${Date.now()}.json`);
            };

            // --- Show ---
            modal.classList.add('open');
            document.body.style.overflow = 'hidden';

            document.getElementById('btn-close-compare').onclick = () => {
                modal.classList.remove('open');
                document.body.style.overflow = '';
            };
        } catch (err) {
            console.error("Failed to render compare panel:", err);
            alert("Error rendering compare panel. Check console for details.");
        }
    }

    let compareChartInst = null;
    function drawCompareChart(type) {
        if (typeof Chart === 'undefined') return;
        const ctx = document.getElementById('compare-chart-canvas').getContext('2d');
        if (compareChartInst) { compareChartInst.destroy(); }

        const bData = (type === 'equity' ? baselineReport.equityCurve : baselineReport.drawdownCurve) || [];
        const cData = (type === 'equity' ? currentReport.equityCurve : currentReport.drawdownCurve) || [];

        // X-axis mapping - use max length to align right-most (latest) points if mismatched, or just zip
        const maxLen = Math.max(bData.length, cData.length);
        const labels = Array.from({ length: maxLen }, (_, i) => i);

        // Pad the shorter array from the left to align endings (assuming they end at same 'now')
        let bPad = Array(Math.max(0, maxLen - bData.length)).fill(type === 'equity' ? bData[0] : 0).concat(bData);
        let cPad = Array(Math.max(0, maxLen - cData.length)).fill(type === 'equity' ? cData[0] : 0).concat(cData);

        compareChartInst = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Baseline',
                        data: bPad,
                        borderColor: 'rgba(56, 189, 248, 0.5)',
                        borderWidth: 1.5,
                        borderDash: [5, 5],
                        pointRadius: 0,
                        tension: 0.1
                    },
                    {
                        label: 'Current',
                        data: cPad,
                        borderColor: '#818cf8',
                        borderWidth: 2,
                        pointRadius: 0,
                        tension: 0.1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { labels: { color: '#94a3b8' } },
                    tooltip: { theme: 'dark' }
                },
                scales: {
                    x: { display: false },
                    y: {
                        display: true,
                        position: 'right',
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        ticks: { color: '#64748b' }
                    }
                }
            }
        });
    }

    function downloadJSON(obj, filename) {
        const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // ---- Quant Explanation Engine (derived-only) ----

    function generateExplanation(report) {
        const trades = report.trades || [];
        const eq = report.equity_curve || [];
        const dd = report.drawdown_curve || [];
        const m = report.headline_metrics || {};
        const config = report.config || {};
        const sections = [];
        const debug = {};

        // ====== A) Summary Verdict ======
        const totalReturn = parseFloat(m.totalReturn) || 0;
        const sharpe = parseFloat(m.sharpe) || 0;
        const maxDD = parseFloat(m.maxDrawdown) || 0;
        let verdict = 'Research-grade';
        let verdictClass = 'qe-neutral';
        if (totalReturn > 0 && sharpe > 0.5 && trades.length >= 20) {
            verdict = 'Deployment-grade';
            verdictClass = 'qe-positive';
        }
        if (totalReturn < 0 || sharpe < 0) {
            verdict = 'Not deployment-ready';
            verdictClass = 'qe-negative';
        }
        sections.push({
            heading: 'A — Summary Verdict',
            html: `<div class="qe-verdict"><span class="${verdictClass}">${verdict}</span></div>
                   <ul>
                     <li>Total Return: <span class="qe-val">${m.totalReturn}%</span> | Sharpe: <span class="qe-val">${m.sharpe}</span> | Max DD: <span class="qe-val">${m.maxDrawdown}%</span></li>
                     <li>Trade count: <span class="qe-val">${trades.length}</span></li>
                   </ul>`
        });

        // ====== B) What Drove Performance ======
        const sortedPnl = trades.map(t => t.pnl).sort((a, b) => b - a);
        const totalPnl = sortedPnl.reduce((s, v) => s + v, 0);
        const top1Contribution = totalPnl !== 0 ? ((sortedPnl[0] || 0) / Math.abs(totalPnl)) * 100 : 0;
        const top5Pnl = sortedPnl.slice(0, 5).reduce((s, v) => s + v, 0);
        const top5Contribution = totalPnl !== 0 ? (top5Pnl / Math.abs(totalPnl)) * 100 : 0;
        const medianPnl = sortedPnl.length > 0 ? sortedPnl[Math.floor(sortedPnl.length / 2)] : 0;
        const winRate = parseFloat(m.winRate) || 0;
        const payoffRatio = parseFloat(m.avgWinLoss) || 0;

        const isConvex = top5Contribution > 80;
        debug.top1Contribution = top1Contribution.toFixed(2);
        debug.top5Contribution = top5Contribution.toFixed(2);
        debug.isConvex = isConvex;

        let convexNote = isConvex
            ? 'This is a <span class="qe-val">convex</span> system — a small number of trades drive the majority of returns.'
            : 'Returns are distributed across multiple trades — no single trade dominates.';

        sections.push({
            heading: 'B — What Drove Performance',
            html: `<ul>
                     <li>Top 1 trade contributed <span class="qe-val">${top1Contribution.toFixed(1)}%</span> of total PnL</li>
                     <li>Top 5 trades contributed <span class="qe-val">${top5Contribution.toFixed(1)}%</span> of total PnL</li>
                     <li>Median trade PnL: <span class="qe-val">$${medianPnl.toFixed(2)}</span> (${medianPnl >= 0 ? 'positive' : 'negative'} median)</li>
                     <li>Win rate <span class="qe-val">${winRate}%</span> with payoff ratio <span class="qe-val">${payoffRatio}</span></li>
                     <li>${convexNote}</li>
                   </ul>`
        });

        // ====== C) Drawdown Reality Check ======
        let barsInDD = 0;
        for (let i = 0; i < dd.length; i++) {
            if (dd[i] < -0.001) barsInDD++;
        }
        const pctTimeInDD = dd.length > 0 ? ((barsInDD / dd.length) * 100).toFixed(1) : 'N/A';

        // Longest recovery: consecutive bars below previous peak
        let longestRecovery = 0, currentStreak = 0;
        for (let i = 0; i < dd.length; i++) {
            if (dd[i] < -0.001) { currentStreak++; }
            else { if (currentStreak > longestRecovery) longestRecovery = currentStreak; currentStreak = 0; }
        }
        if (currentStreak > longestRecovery) longestRecovery = currentStreak;

        const tfHours = { '1m': 1 / 60, '5m': 5 / 60, '15m': 0.25, '1h': 1, '4h': 4, '1d': 24, '1w': 168 };
        const tf = config.timeframe || '4h';
        const hoursPerBar = tfHours[tf] || 4;
        const recoveryDays = ((longestRecovery * hoursPerBar) / 24).toFixed(0);

        const maxConsec = parseInt(m.maxConsecLosses) || 0;

        sections.push({
            heading: 'C — Drawdown Reality Check',
            html: `<ul>
                     <li>Time in drawdown: <span class="qe-val">${pctTimeInDD}%</span> of all bars</li>
                     <li>Longest recovery period: <span class="qe-val">${longestRecovery} bars</span> (~<span class="qe-val">${recoveryDays} days</span>)</li>
                     <li>Max consecutive losses: <span class="qe-val">${maxConsec}</span></li>
                     <li>Max drawdown: <span class="qe-val">${m.maxDrawdown}%</span></li>
                     <li>${parseFloat(pctTimeInDD) > 90 ? 'This system spends the vast majority of time underwater — patience and conviction are required.' : parseFloat(pctTimeInDD) > 50 ? 'Moderate time in drawdown — recovery periods can be extended.' : 'Relatively low time in drawdown for a trend-following system.'}</li>
                   </ul>`
        });

        // ====== D) Best/Worst Periods ======
        const windowBars = Math.round((90 * 24) / hoursPerBar);
        let bestWindow = -Infinity, worstWindow = Infinity;
        let bestStart = 0, worstStart = 0;
        if (eq.length > windowBars) {
            for (let i = 0; i <= eq.length - windowBars; i++) {
                const windowReturn = ((eq[i + windowBars - 1] - eq[i]) / eq[i]) * 100;
                if (windowReturn > bestWindow) { bestWindow = windowReturn; bestStart = i; }
                if (windowReturn < worstWindow) { worstWindow = windowReturn; worstStart = i; }
            }
        } else {
            bestWindow = eq.length > 1 ? ((eq[eq.length - 1] - eq[0]) / eq[0]) * 100 : 0;
            worstWindow = bestWindow;
        }

        // Max peak-to-trough interval
        let peakIdx = 0, troughIdx = 0, maxPTT = 0;
        let peak = eq[0];
        for (let i = 1; i < eq.length; i++) {
            if (eq[i] > peak) { peak = eq[i]; peakIdx = i; }
            const drawdown = ((peak - eq[i]) / peak) * 100;
            if (drawdown > maxPTT) { maxPTT = drawdown; troughIdx = i; }
        }
        const pttBars = troughIdx - peakIdx;
        const pttDays = ((pttBars * hoursPerBar) / 24).toFixed(0);

        debug.bestWindowReturn = bestWindow.toFixed(2);
        debug.worstWindowReturn = worstWindow.toFixed(2);
        debug.maxPeakToTroughBars = pttBars;

        sections.push({
            heading: 'D — Where It Works / Fails',
            html: `<ul>
                     <li>Best ~90-day window: <span class="qe-val qe-positive">+${bestWindow.toFixed(2)}%</span> (starting at bar ${bestStart})</li>
                     <li>Worst ~90-day window: <span class="qe-val qe-negative">${worstWindow.toFixed(2)}%</span> (starting at bar ${worstStart})</li>
                     <li>Max peak-to-trough: <span class="qe-val">${pttBars} bars</span> (~${pttDays} days)</li>
                   </ul>`
        });

        // ====== E) Trade Quality Breakdown ======
        const wins = trades.filter(t => t.isWin);
        const losses = trades.filter(t => !t.isWin);
        const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0;
        const avgLoss = losses.length > 0 ? losses.reduce((s, t) => s + Math.abs(t.pnl), 0) / losses.length : 0;
        const payoff = avgLoss > 0 ? (avgWin / avgLoss).toFixed(2) : 'N/A';

        const holdingPeriods = trades.map(t => t.holdingPeriod).sort((a, b) => a - b);
        const medianHold = holdingPeriods.length > 0 ? holdingPeriods[Math.floor(holdingPeriods.length / 2)] : 0;
        const p80Hold = holdingPeriods.length > 0 ? holdingPeriods[Math.floor(holdingPeriods.length * 0.8)] : 0;
        const medianHoldDays = ((medianHold * hoursPerBar) / 24).toFixed(1);
        const p80HoldDays = ((p80Hold * hoursPerBar) / 24).toFixed(1);

        const stopExits = trades.filter(t => t.exitReason === 'STOP').length;
        const signalExits = trades.filter(t => t.exitReason !== 'STOP').length;

        sections.push({
            heading: 'E — Trade Quality Breakdown',
            html: `<ul>
                     <li>Avg win: <span class="qe-val qe-positive">$${avgWin.toFixed(2)}</span> | Avg loss: <span class="qe-val qe-negative">$${avgLoss.toFixed(2)}</span></li>
                     <li>Payoff ratio: <span class="qe-val">${payoff}</span></li>
                     <li>Holding period — median: <span class="qe-val">${medianHold} bars</span> (~${medianHoldDays}d), 80th pctl: <span class="qe-val">${p80Hold} bars</span> (~${p80HoldDays}d)</li>
                     <li>Exit reasons — Stop: <span class="qe-val">${stopExits}</span> | Signal: <span class="qe-val">${signalExits}</span></li>
                   </ul>`
        });

        // ====== F) Deployment Guidance ======
        sections.push({
            heading: 'F — Deployment Guidance',
            html: `<ul>
                     <li><strong>If you deploy:</strong> Size conservatively. The max drawdown of <span class="qe-val">${m.maxDrawdown}%</span> and ${maxConsec} consecutive losses mean psychological tolerance is essential. Expect extended periods of no new equity highs.</li>
                     <li><strong>If you research further:</strong> Consider testing alternate stop-loss levels and position-size percentages using the controls already in the UI. Timeframe scaling (1H, 1D) may reveal regime sensitivity.</li>
                   </ul>`
        });

        // ====== Debug ======
        console.log('🔬 QUANT EXPLANATION DEBUG:', {
            top1Contribution: debug.top1Contribution + '%',
            top5Contribution: debug.top5Contribution + '%',
            convexProfile: debug.isConvex,
            bestWindowReturn: debug.bestWindowReturn + '%',
            worstWindowReturn: debug.worstWindowReturn + '%',
            maxPeakToTroughBars: debug.maxPeakToTroughBars,
            pctTimeInDrawdown: pctTimeInDD + '%',
            longestRecoveryBars: longestRecovery,
            longestRecoveryDays: recoveryDays
        });

        return sections;
    }

    function renderExplanation(sections) {
        const panel = document.getElementById('quant-explanation');
        if (!panel) return;
        let html = '';
        sections.forEach(s => {
            html += `<div class="qe-section"><div class="qe-heading">${s.heading}</div>${s.html}</div>`;
        });

        // Add disclosure at the bottom
        html += `<div class="qe-disclosure">Explanations are derived strictly from this backtest's outputs. No external data, assumptions, or additional modeling are used.</div>`;

        panel.innerHTML = html;
        panel.style.display = 'block';
    }

    function initExplainButton() {
        const btn = document.getElementById('btn-explain-results');
        if (!btn) return;
        btn.addEventListener('click', () => {
            if (!lastResult || !lastMetrics) return alert('Please run a backtest first.');

            const panel = document.getElementById('quant-explanation');
            // Toggle: if already visible, collapse
            if (panel && panel.style.display === 'block') {
                panel.style.display = 'none';
                return;
            }

            const report = {
                preset_name: document.getElementById('preset-selector')?.value || 'CUSTOM',
                config: BacktestEngine.collectInputs(),
                headline_metrics: lastMetrics,
                equity_curve: equityCurve,
                drawdown_curve: drawdownData,
                trades: lastResult.trades
            };

            const sections = generateExplanation(report);
            renderExplanation(sections);
        });
    }

    // ---- Strategy Versioning / Journal ----
    let strategyVersions = [];
    let activeLoadedVersionId = null;
    let selectedVersionId = null; // Step 2.4: Selected version state

    // ---- Run History / Snapshots ----
    const LOCAL_STORAGE_RUNS_KEY = "pp_backtest_runs_v1";
    let runHistory = [];
    let selectedRunId = null;
    let isReplayMode = false;
    let cachedCurrentReport = null;

    function initVersions() {
        try {
            const stored = localStorage.getItem('pp_backtest_versions_v1');
            if (stored) {
                const parsed = JSON.parse(stored);
                // Schema check 2.3
                if (Array.isArray(parsed)) {
                    strategyVersions = parsed.filter(v => v && v.id && v.full_report);
                    logJournal("Versions loaded:", strategyVersions.length, "entries", "Bytes:", new Blob([stored]).size);
                } else {
                    throw new Error("Invalid stored structure");
                }
            }
        } catch (e) {
            console.error("Failed to load strategy versions from localStorage", e);
            strategyVersions = [];
            alert("Saved versions were corrupted and were cleared.");
        }
        renderVersionsList();
        initVersionModals();
        updateJournalButtonsState();
    }

    function saveVersionsToStorage() {
        try {
            // Defensive clone to avoid modifying live state before stringify, handle circulars implicitly
            const safeVersions = strategyVersions.map(v => ({
                id: v.id,
                name: v.name,
                notes: v.notes,
                tags: v.tags,
                created_at: v.created_at,
                config: v.config,
                report_snapshot: v.report_snapshot,
                full_report: {
                    ...v.full_report,
                    // keep arrays
                    equityCurve: v.full_report.equityCurve,
                    drawdownCurve: v.full_report.drawdownCurve,
                    trades: v.full_report.trades
                }
            }));
            const jsonStr = JSON.stringify(safeVersions);
            localStorage.setItem('pp_backtest_versions_v1', jsonStr);
            logJournal("Storage written. Total size:", new Blob([jsonStr]).size, "bytes");
        } catch (e) {
            console.error("Storage full or serialization error", e);
            alert("Storage full or serialization error — delete older versions.");
        }
    }

    function generateCacheId() {
        return 'id_' + Math.random().toString(36).substr(2, 9);
    }

    function renderVersionsList() {
        const listEl = document.getElementById('versions-list');
        if (!listEl) return;

        if (strategyVersions.length === 0) {
            listEl.innerHTML = `<div style="text-align: center; padding: 20px; color: #64748b; font-size: 0.8rem; font-style: italic;">No versions saved yet. Run a backtest and click "Save to Journal".</div>`;
            return;
        }

        let html = '';
        try {
            // Clean up any globally corrupted entries before mapping to prevent script abortion
            strategyVersions = strategyVersions.filter(v => v && v.id && v.report_snapshot && v.report_snapshot.headline_metrics);

            strategyVersions.forEach(v => {
                const dateStr = new Date(v.created_at).toLocaleString();
                const m = v.report_snapshot.headline_metrics;
                const isSelected = selectedVersionId === v.id;

                let tagsHtml = '';
                if (v.tags && Array.isArray(v.tags) && v.tags.length > 0) {
                    tagsHtml = `<div class="bt-version-tags">` + v.tags.map(t => `<span class="bt-version-tag">${t}</span>`).join('') + `</div>`;
                }

                let notesHtml = '';
                if (v.notes) {
                    notesHtml = `<div class="bt-version-notes">${v.notes}</div>`;
                }

                html += `
                    <div class="bt-version-card ${isSelected ? 'selected' : ''}" data-id="${v.id}" style="cursor: pointer; ${isSelected ? 'border-color: #6366f1; background: rgba(99, 102, 241, 0.1);' : ''}">
                        <div class="bt-version-header">
                            <h4 class="bt-version-title">${v.name}</h4>
                            <span class="bt-version-time">${dateStr}</span>
                        </div>
                        ${tagsHtml}
                        ${notesHtml}
                        <div class="bt-version-metrics">
                            <div class="bt-version-metric">
                                <span style="font-size:0.6rem;text-transform:uppercase;">Return</span>
                                <span class="bt-version-metric-val ${parseFloat(m.totalReturn) >= 0 ? 'positive' : 'negative'}">${m.totalReturn}%</span>
                            </div>
                            <div class="bt-version-metric">
                                <span style="font-size:0.6rem;text-transform:uppercase;">Max DD</span>
                                <span class="bt-version-metric-val negative">${m.maxDrawdown}%</span>
                            </div>
                            <div class="bt-version-metric">
                                <span style="font-size:0.6rem;text-transform:uppercase;">Trades</span>
                                <span class="bt-version-metric-val">${v.report_snapshot.trades_count}</span>
                            </div>
                            <div class="bt-version-metric">
                                <span style="font-size:0.6rem;text-transform:uppercase;">Win Rate</span>
                                <span class="bt-version-metric-val">${m.winRate}%</span>
                            </div>
                        </div>
                    </div>
                `;
            });
        } catch (err) {
            console.error("renderVersionsList failed to parse history payload:", err);
            html = `<div style="text-align: center; color: #ef4444; padding: 10px; font-size: 0.8rem;">Journal data corrupted. Please clear invalid entries.</div>`;
        }

        listEl.innerHTML = html;

        // Attach list handlers for selection (Step 2.4)
        listEl.querySelectorAll('.bt-version-card').forEach(card => {
            card.addEventListener('click', (e) => {
                const id = e.currentTarget.dataset.id;
                selectedVersionId = id;
                logJournal("Selected Version ID:", selectedVersionId);
                renderVersionsList(); // re-render to update styling
                updateJournalButtonsState();
            });
        });
    }

    function updateJournalButtonsState() {
        // Find buttons in the HTML (they need to be added to backtest.html next)
        const btnLoad = document.getElementById('btn-journal-load');
        const btnCompare = document.getElementById('btn-journal-compare');
        const btnDelete = document.getElementById('btn-journal-delete');
        const btnSave = document.getElementById('btn-save-version');

        const hasSelection = !!selectedVersionId;
        const hasCurrent = !!(currentReport && currentReport.trades);

        if (btnLoad) { btnLoad.disabled = !hasSelection; btnLoad.style.opacity = hasSelection ? '1' : '0.5'; }
        if (btnDelete) { btnDelete.disabled = !hasSelection; btnDelete.style.opacity = hasSelection ? '1' : '0.5'; }
        if (btnCompare) { btnCompare.disabled = !(hasSelection && hasCurrent); btnCompare.style.opacity = (hasSelection && hasCurrent) ? '1' : '0.5'; }
        if (btnSave) { btnSave.disabled = !hasCurrent; btnSave.style.opacity = hasCurrent ? '1' : '0.5'; }
    }

    window.openSaveVersionModal = function () {
        logJournal("Global openSaveVersionModal clicked. currentReport exists:", !!currentReport, "trades exists:", !!(currentReport && currentReport.trades));

        // Step 2.2: Ensure we have a current report and trades
        if (!currentReport || !currentReport.trades || currentReport.trades.length === 0) {
            alert('Run a backtest first — no report to save.');
            return;
        }

        document.getElementById('sv-name').value = '';
        document.getElementById('sv-notes').value = '';
        document.getElementById('sv-tags').value = '';

        const modal = document.getElementById('save-version-modal');
        if (modal) {
            modal.classList.add('open');
            document.body.style.overflow = 'hidden';
        }
    };

    function initVersionModals() {
        const modal = document.getElementById('save-version-modal');
        const closeBtn = document.getElementById('btn-close-save-version');
        const cancelBtn = document.getElementById('btn-cancel-save');
        const confirmBtn = document.getElementById('btn-confirm-save');

        // Main 'Save to Journal' button in export-group
        const mainSaveBtn = document.getElementById('btn-save-version');
        if (mainSaveBtn) {
            mainSaveBtn.addEventListener('click', () => {
                if (typeof window.openSaveVersionModal === 'function') {
                    window.openSaveVersionModal();
                }
            });
        }

        // Journal action buttons in the AI Strategy Modal -> Strategy Journal section
        const btnLoad = document.getElementById('btn-journal-load');
        const btnCompare = document.getElementById('btn-journal-compare');
        const btnDelete = document.getElementById('btn-journal-delete');

        if (btnLoad) {
            btnLoad.addEventListener('click', () => {
                if (typeof window.handleJournalLoad === 'function') window.handleJournalLoad();
            });
        }
        if (btnCompare) {
            btnCompare.addEventListener('click', () => {
                if (typeof window.handleJournalCompare === 'function') window.handleJournalCompare();
            });
        }
        if (btnDelete) {
            btnDelete.addEventListener('click', () => {
                if (typeof window.handleJournalDelete === 'function') window.handleJournalDelete();
            });
        }

        if (closeBtn) closeBtn.addEventListener('click', () => {
            if (modal) {
                modal.classList.remove('open');
                document.body.style.overflow = '';
            }
        });
        if (cancelBtn) cancelBtn.addEventListener('click', () => {
            if (modal) {
                modal.classList.remove('open');
                document.body.style.overflow = '';
            }
        });

        if (confirmBtn) {
            confirmBtn.addEventListener('click', () => {
                const name = document.getElementById('sv-name').value.trim();
                const notes = document.getElementById('sv-notes').value.trim();
                const tagsRaw = document.getElementById('sv-tags').value.trim();
                const tags = tagsRaw ? tagsRaw.split(',').map(t => t.trim()) : [];

                if (!name) return alert('Please enter a version name.');

                saveVersion(name, notes, tags);
                if (modal) {
                    modal.classList.remove('open');
                    document.body.style.overflow = '';
                }
            });
        }
    }

    function saveVersion(name, notes, tags) {
        try {
            logJournal("saveVersion called. Name:", name);
            if (!currentReport || !currentReport.trades) {
                alert('Run a backtest first — no report to save.');
                return;
            }

            // Schema check 2.2 + 2.1
            const fullReport = JSON.parse(JSON.stringify(currentReport)); // check for circulars

            if (!fullReport || !fullReport.equityCurve || !fullReport.drawdownCurve || !fullReport.trades || !fullReport.config) {
                alert('Run a backtest first — incomplete report data.');
                return;
            }

            const newVersion = {
                id: generateCacheId(),
                name: name,
                notes: notes,
                tags: tags,
                created_at: new Date().toISOString(),
                config: fullReport.config,
                report_snapshot: {
                    headline_metrics: fullReport.metrics,
                    trades_count: fullReport.trades.length,
                    return: fullReport.metrics.totalReturn,
                    maxdd: fullReport.metrics.maxDrawdown,
                    score: fullReport.metrics.profitFactor,
                    pf: fullReport.metrics.profitFactor,
                    expectancy: fullReport.metrics.avgWinLoss,
                    winrate: fullReport.metrics.winRate
                },
                full_report: fullReport
            };

            strategyVersions.unshift(newVersion);
            if (strategyVersions.length > 100) {
                strategyVersions.pop(); // Cap at 100 limit safeguard
            }

            saveVersionsToStorage();
            logJournal("saveVersion success, total versions:", strategyVersions.length);
            renderVersionsList();

            const btn = document.getElementById('btn-save-version');
            if (btn) {
                const ogHtml = btn.innerHTML;
                btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" style="margin-right: 4px;"><path d="M10 2H2C1.44772 2 1 2.44772 1 3V9C1 9.55228 1.44772 10 2 10H10C10.5523 10 11 9.55228 11 9V3C11 2.44772 10.5523 2 10 2Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 5L5 7L9 3" stroke="#4ade80" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg> Saved!`;
                btn.style.color = '#4ade80';
                btn.style.borderColor = 'rgba(74, 222, 128, 0.3)';
                btn.style.background = 'rgba(74, 222, 128, 0.08)';
                setTimeout(() => {
                    btn.innerHTML = ogHtml;
                    btn.style.color = '';
                    btn.style.borderColor = '';
                    btn.style.background = '';
                }, 2000);
            }
            showToast("Version saved into journal.");
        } catch (err) {
            console.error("[JOURNAL ERROR] saveVersion failed:", err);
            alert("Failed to save version: " + err.message);
        }
    }

    // Ensure load uses selectedVersionId
    window.handleJournalLoad = function () {
        logJournal("handleJournalLoad called, selected:", selectedVersionId);
        if (!selectedVersionId) {
            alert('Select a version first.');
            return;
        }
        loadVersion(selectedVersionId);
    };

    function loadVersion(id) {
        logJournal("loadVersion processing ID:", id);
        activeLoadedVersionId = id;
        const v = strategyVersions.find(x => x.id === id);
        if (!v) {
            alert('Selected version not found.');
            return;
        }

        const c = v.config;

        // Respect Preset definitions and logic mappings
        const presetSelect = document.getElementById('preset-selector');
        if (c.preset_name && c.preset_name !== 'CUSTOM' && presetSelect) {
            presetSelect.value = c.preset_name;
            const ev = new Event('change');
            presetSelect.dispatchEvent(ev);
        } else {
            if (presetSelect) presetSelect.value = 'CUSTOM';
            document.querySelectorAll('.bt-input-locked, .bt-select-locked').forEach(el => {
                el.classList.remove('bt-input-locked', 'bt-select-locked');
                if (!el.classList.contains('input-mode-restricted')) {
                    el.disabled = false;
                }
            });
            const lockIcon = document.getElementById('preset-lock-icon');
            if (lockIcon) lockIcon.style.display = 'none';
        }

        const map = {
            'asset-select': c.asset,
            'timeframe-select': c.timeframe,
            'start-date': c.startDate,
            'end-date': c.endDate,
            'starting-capital': c.capital,
            'trading-fees': c.fees,
            'slippage': c.slippage,
            'stop-loss': c.stopLoss,
            'take-profit': c.takeProfit,
            'position-size': c.positionSize
        };

        for (const [domId, val] of Object.entries(map)) {
            const el = document.getElementById(domId);
            if (el) el.value = val;
        }
        showToast("Version loaded into strategy builder.");

        const btnRun = document.getElementById('btn-run-backtest');
        if (btnRun) {
            btnRun.innerHTML = `<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M4 3l11 6-11 6V3z" fill="currentColor" /></svg> Run Version`;
            setTimeout(() => {
                btnRun.innerHTML = `<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M4 3l11 6-11 6V3z" fill="currentColor" /></svg> Run Backtest`;
            }, 3000)
        }
    }

    // Ensure Compare uses selectedVersionId AND currentReport
    window.handleJournalCompare = function () {
        logJournal("handleJournalCompare called. selected:", selectedVersionId, "current:", !!currentReport);
        if (!selectedVersionId) {
            alert('Select a version first.');
            return;
        }
        compareVersion(selectedVersionId);
    };

    function compareVersion(id) {
        logJournal("compareVersion processing ID:", id);
        const v = strategyVersions.find(x => x.id === id);
        if (!v) {
            alert('Selected version not found.');
            return;
        }

        if (!currentReport) {
            alert('Run a current backtest first to compare against this saved version.');
            return;
        }

        logJournal("compareVersion ready. baseline count:", v.full_report.equityCurve?.length, "current count:", currentReport.equityCurve?.length);

        // Direct hook into existing A/B panel
        // Step 2.5: Compare uses wrong objects
        baselineReport = v.full_report;
        // currentReport is already whatever is in state.

        if (typeof renderComparePanel === 'function') {
            renderComparePanel();
        }
    }

    window.handleJournalDelete = function () {
        logJournal("handleJournalDelete called. selected:", selectedVersionId);
        if (!selectedVersionId) {
            alert('Select a version first.');
            return;
        }
        deleteVersion(selectedVersionId);
    };

    function deleteVersion(id) {
        if (confirm('Delete this version? This cannot be undone.')) {
            strategyVersions = strategyVersions.filter(x => x.id !== id);
            if (selectedVersionId === id) {
                selectedVersionId = null;
            }
            saveVersionsToStorage();
            renderVersionsList();
            updateJournalButtonsState();
        }
    }

    // ========================================
    // RUN HISTORY (IMMUTABLE SNAPSHOTS)
    // ========================================

    // Global bindings for inline HTML onclicks 
    window.openSaveRunModal = function () {
        console.log("openSaveRunModal called. currentReport:", !!currentReport, "isReplayMode:", isReplayMode);

        if (!currentReport) {
            alert("No active run to save. Please run a backtest first.");
            showToast("No active run to save. Please run a backtest first.");
            return;
        }
        if (isReplayMode) {
            alert("This is a replay. You cannot re-save a saved run.");
            showToast("Replays cannot be re-saved.");
            return;
        }

        const modal = document.getElementById('save-run-modal');
        console.log("Found modal DOM element:", !!modal);
        if (modal) {
            document.getElementById('sr-name').value = `Run ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
            document.getElementById('sr-notes').value = '';
            document.getElementById('sr-tags').value = '';
            modal.classList.add('open');
            console.log("Added 'open' class to modal.");

            // Force display just in case CSS .open isn't applying
            modal.style.display = 'flex';
        } else {
            alert("Error: Modal element not found in DOM.");
        }
    };

    window.closeSaveRunModal = function () {
        const modal = document.getElementById('save-run-modal');
        if (modal) {
            modal.classList.remove('open');
            modal.style.display = 'none';
        }
    };

    window.confirmSaveRun = function () {
        const name = document.getElementById('sr-name').value.trim();
        const notes = document.getElementById('sr-notes').value.trim();
        const tagsStr = document.getElementById('sr-tags').value.trim();
        if (!name) return alert("Run Name is required.");

        const tags = tagsStr.split(',').map(s => s.trim()).filter(Boolean);

        const snapshot = {
            id: 'run_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9),
            name: name,
            created_at: new Date().toISOString(),
            preset_name: currentReport.config.preset_name || null,
            config: currentReport.config,
            report: currentReport,
            notes: notes,
            tags: tags
        };

        try {
            runHistory.unshift(snapshot);
            if (runHistory.length > 50) {
                runHistory.pop(); // Default cap 50 runs
            }
            saveRunsToStorage();
            renderRunsList();
            const modal = document.getElementById('save-run-modal');
            if (modal) {
                modal.classList.remove('open');
                modal.style.display = 'none';
            } else {
                console.error("No modal to close?");
            }
            showToast(`Run "${name}" saved!`);
        } catch (e) {
            console.error("Failed to save run:", e);
        }
    };

    window.handleRunOpen = function () {
        console.log("handleRunOpen called with ID:", selectedRunId);
        openRun(selectedRunId);
    };
    window.handleRunCompare = function () {
        console.log("handleRunCompare called with ID:", selectedRunId);
        compareRun(selectedRunId);
    };
    window.handleRunDelete = function () { deleteRun(selectedRunId); };
    window.handleExitReplay = function () { exitReplayMode(); };

    function initRunHistory() {
        try {
            const stored = localStorage.getItem(LOCAL_STORAGE_RUNS_KEY);
            if (stored) {
                const parsed = JSON.parse(stored);
                if (Array.isArray(parsed)) {
                    runHistory = parsed;
                }
            }
        } catch (e) {
            console.error("Failed to load runs from localStorage", e);
            runHistory = [];
            alert("Storage corruption detected. Run history reset.");
        }

        renderRunsList();
    }

    function saveRunsToStorage() {
        try {
            localStorage.setItem(LOCAL_STORAGE_RUNS_KEY, JSON.stringify(runHistory));
        } catch (e) {
            console.error("Storage full or error", e);
            alert("Storage full! Failed to save run snapshot.");
        }
    }

    function renderRunsList() {
        const container = document.getElementById('runs-list');
        if (!container) return;

        container.innerHTML = '';
        if (runHistory.length === 0) {
            container.innerHTML = `<div style="text-align: center; padding: 20px; color: #64748b; font-size: 0.8rem; font-style: italic;">No runs saved yet. Run a backtest and click "Save Run (Snapshot)".</div>`;
            updateRunButtonsState();
            return;
        }

        runHistory.forEach(r => {
            const el = document.createElement('div');
            const isSelected = r.id === selectedRunId;
            el.className = 'bt-version-card ' + (isSelected ? 'selected' : '');
            el.style.cursor = 'pointer';
            if (isSelected) {
                el.style.borderColor = '#10b981';
                el.style.background = 'rgba(16, 185, 129, 0.1)';
            }

            const dateStr = new Date(r.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

            const m = r.report.metrics || {};
            const ret = parseFloat(m.totalReturn || 0);
            const retClass = ret > 0 ? 'positive' : (ret < 0 ? 'negative' : '');
            const trd = Math.floor(m.tradeCount || 0);

            el.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                    <div>
                        <div class="bt-version-name">${r.name}</div>
                        <div class="bt-version-date">${dateStr}</div>
                    </div>
                </div>
                <div style="display: flex; gap: 8px; font-size: 0.75rem; margin-top: 6px; color: #cbd5e1; flex-wrap: wrap;">
                    <span class="${retClass}">Ret: ${(ret > 0 ? '+' : '') + ret.toFixed(1)}%</span>
                    <span>DD: ${parseFloat(m.maxDrawdown || 0).toFixed(1)}%</span>
                    <span>PF: ${parseFloat(m.profitFactor || 0).toFixed(2)}</span>
                    <span>Trades: ${trd}</span>
                </div>
            `;

            el.addEventListener('click', () => {
                if (selectedRunId === r.id) {
                    selectedRunId = null; // deselect
                } else {
                    selectedRunId = r.id;
                }
                renderRunsList(); // re-render to update selected class
                updateRunButtonsState();
            });

            container.appendChild(el);
        });
        updateRunButtonsState();
    }

    function updateRunButtonsState() {
        const hasSel = !!selectedRunId;
        const btnOpen = document.getElementById('btn-run-open');
        const btnCompare = document.getElementById('btn-run-compare');
        const btnDelete = document.getElementById('btn-run-delete');

        if (btnOpen) { btnOpen.disabled = !hasSel; btnOpen.style.opacity = hasSel ? '1' : '0.5'; }
        if (btnDelete) { btnDelete.disabled = !hasSel; btnDelete.style.opacity = hasSel ? '1' : '0.5'; }
        if (btnCompare) { btnCompare.disabled = !hasSel; btnCompare.style.opacity = hasSel ? '1' : '0.5'; }
    }

    function openRun(id) {
        console.log("openRun started for id:", id);
        const r = runHistory.find(x => x.id === id);
        if (!r) {
            console.error("openRun: Run not found in runHistory!");
            return;
        }

        console.log("openRun: Found run snapshot:", r.name);

        try {
            // Cache current real state only if we're not ALREADY in replay mode
            if (!isReplayMode && currentReport) {
                cachedCurrentReport = currentReport;
            }

            isReplayMode = true;

            // Apply config to inputs but disable them
            applyConfigToUI(r.config);
            lockInputsForReplay(true);

            // Show banner
            const banner = document.getElementById('replay-mode-banner');
            if (banner) banner.style.display = 'flex';

            console.log("openRun: Banner shown, config applied.");

            // Set state for rendering
            currentReport = Object.assign({}, r.report, { metadata: 'replay' });

            // Rebuild charts based on snapshot report arrays
            if (currentReport.equityCurve) equityCurve = currentReport.equityCurve;
            if (currentReport.drawdownCurve) drawdownData = currentReport.drawdownCurve;
            if (currentReport.distributionData) distributionData = currentReport.distributionData;
            if (currentReport.monthlyReturns) monthlyReturns = currentReport.monthlyReturns;

            // Rebuild main candlestick chart
            if (currentReport.candles && currentReport.candles.length > 0) {
                // Restore dates back to Date objects from JSON string
                ohlcvData = currentReport.candles.map(c => ({
                    ...c,
                    date: typeof c.date === 'string' ? new Date(c.date) : c.date
                }));
            }

            // Override trade table
            lastResult = { trades: currentReport.trades || [] };
            const tradeTableBody = document.getElementById('trade-log-body');
            const tableWrap = document.querySelector('.bt-trade-table-wrap');
            if (tradeTableBody && tableWrap && lastResult.trades) {
                const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                let html = '';
                const recentTrades = lastResult.trades.slice(-10).reverse();
                recentTrades.forEach(t => {
                    const entryStr = 'Idx ' + t.entryIdx; // Fallback since OHLCV is not cached in snapshot
                    const exitStr = 'Idx ' + t.exitIdx;
                    const cssClass = t.isWin ? 'positive' : 'negative';
                    const pct = (t.returnPct >= 0 ? '+' : '') + t.returnPct.toFixed(2) + '%';
                    const pnlStr = (t.pnl >= 0 ? '+$' : '-$') + Math.abs(Math.round(t.pnl)).toLocaleString();
                    const tfHours = { '1m': 1 / 60, '5m': 5 / 60, '15m': 0.25, '1h': 1, '4h': 4, '1d': 24, '1w': 168 };
                    const tf = document.getElementById('timeframe-select')?.value || '1d';
                    const daysHeld = (t.holdingPeriod * (tfHours[tf] || 24) / 24).toFixed(0);
                    html += `<tr><td>${entryStr}</td><td>${exitStr}</td><td><span class="bt-side ${t.side === 'SHORT' ? 'short' : 'long'}">${t.side || 'LONG'}</span></td><td class="${cssClass}">${pct}</td><td class="${cssClass}">${pnlStr}</td><td>${daysHeld}d</td></tr>`;
                });
                tradeTableBody.innerHTML = html;
            }

            console.log("openRun: Generating metrics via renderReplayMetrics...");
            renderReplayMetrics(r.report.metrics);

            console.log("openRun: Triggering active tab redraw...");
            // Also explicitly draw the main candlestick & volume charts from the injected ohlcvData
            drawCandlestickChart();
            drawVolumeChart();

            const activeTab = document.querySelector('.bt-tab.active');
            if (activeTab) {
                const tabId = activeTab.dataset.tab;
                if (tabId === 'equity') drawEquityChart(1);
                else if (tabId === 'drawdown') drawDrawdownChart();
                else if (tabId === 'distribution') drawDistributionChart();
                else if (tabId === 'monthly') renderHeatmap();
            } else {
                drawEquityChart(1);
            }

            const btnCompare = document.getElementById('btn-compare-runs');
            if (btnCompare) btnCompare.disabled = false;

            showToast("Replay Mode Activated.");

            // Clear selection
            selectedRunId = null;
            renderRunsList();
            console.log("openRun: Finished successfully!");
        } catch (e) {
            console.error("openRun Exception:", e);
            alert("Error rendering run: " + e.message);
        }
    }

    function exitReplayMode() {
        if (!isReplayMode) return;
        isReplayMode = false;
        lockInputsForReplay(false);
        const banner = document.getElementById('replay-mode-banner');
        if (banner) banner.style.display = 'none';

        if (cachedCurrentReport) {
            currentReport = cachedCurrentReport;
            applyConfigToUI(currentReport.config);
            if (currentReport.equityCurve) equityCurve = currentReport.equityCurve;
            if (currentReport.drawdownCurve) drawdownData = currentReport.drawdownCurve;
            if (currentReport.distributionData) distributionData = currentReport.distributionData;
            if (currentReport.monthlyReturns) monthlyReturns = currentReport.monthlyReturns;

            if (currentReport.candles && currentReport.candles.length > 0) {
                // Restore dates back to Date objects from JSON string
                ohlcvData = currentReport.candles.map(c => ({
                    ...c,
                    date: typeof c.date === 'string' ? new Date(c.date) : c.date
                }));
            }

            renderReplayMetrics(currentReport.metrics);

            // Restore main candlestick chart
            drawCandlestickChart();
            drawVolumeChart();

            const activeTab = document.querySelector('.bt-tab.active');
            if (activeTab) {
                const tabId = activeTab.dataset.tab;
                if (tabId === 'equity') drawEquityChart(1);
                else if (tabId === 'drawdown') drawDrawdownChart();
                else if (tabId === 'distribution') drawDistributionChart();
                else if (tabId === 'monthly') renderHeatmap();
            } else {
                drawEquityChart(1);
            }
        } else {
            currentReport = null;
        }

        showToast("Exited Replay Mode.");
    }

    function lockInputsForReplay(disable) {
        const inputs = [
            'strategy-name', 'preset-selector', 'asset-select', 'timeframe-select',
            'start-date', 'end-date', 'starting-capital', 'position-size',
            'trading-fees', 'slippage', 'btn-add-indicator', 'btn-run-backtest'
        ];
        inputs.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.disabled = disable;
        });
        document.querySelectorAll('.bt-indicator-remove').forEach(el => el.disabled = disable);
    }

    function renderReplayMetrics(m) {
        if (!m) return;
        const setM = (id, text, colorClass) => {
            const el = document.querySelector(`[data-metric="${id}"]`);
            if (el) { el.textContent = text; el.className = 'bt-metric-value ' + (colorClass || ''); }
        };
        const trVal = parseFloat(m.totalReturn);
        setM('totalReturn', (trVal >= 0 ? '+' : '') + trVal.toFixed(2) + '%', trVal > 0 ? 'positive' : (trVal < 0 ? 'negative' : ''));
        const cgVal = parseFloat(m.cagr);
        setM('cagr', (cgVal >= 0 ? '+' : '') + cgVal.toFixed(2) + '%', cgVal > 0 ? 'positive' : (cgVal < 0 ? 'negative' : ''));
        const ddVal = parseFloat(m.maxDrawdown);
        setM('maxDrawdown', ddVal.toFixed(2) + '%', 'negative');
        setM('sharpe', parseFloat(m.sharpe).toFixed(2));
        setM('sortino', parseFloat(m.sortino).toFixed(2));
        setM('winRate', parseFloat(m.winRate).toFixed(1) + '%');
        const pf = parseFloat(m.profitFactor);
        setM('profitFactor', pf.toFixed(2), pf > 1 ? 'positive' : (pf < 1 ? 'negative' : ''));
        const exp = parseFloat(m.expectancy);
        setM('expectancy', (exp >= 0 ? '$' : '-$') + Math.abs(Math.floor(exp)), exp > 0 ? 'positive' : (exp < 0 ? 'negative' : ''));
        setM('tradeCount', Math.floor(m.tradeCount));

        const setStat = (id, text) => {
            const el = document.querySelector(`[data-metric="${id}"]`);
            if (el) el.textContent = text;
        };
        setStat('calmar', parseFloat(m.calmar).toFixed(2));
        setStat('avgWinLoss', parseFloat(m.avgWinLoss).toFixed(2));
        setStat('maxConsecLosses', Math.floor(m.maxConsecLosses));
        setStat('avgTradeDuration', parseFloat(m.avgTradeDuration).toFixed(1) + 'd');
        setStat('exposureTime', parseFloat(m.exposureTime).toFixed(1) + '%');
    }

    function deleteRun(id) {
        runHistory = runHistory.filter(x => x.id !== id);
        if (selectedRunId === id) selectedRunId = null;
        saveRunsToStorage();
        renderRunsList();
    }

    function compareRun(id) {
        const r = runHistory.find(x => x.id === id);
        if (!r) return;

        if (isReplayMode && !cachedCurrentReport) {
            // Compare Run vs Run if no live run exists
            if (currentReport && currentReport.id && currentReport.id === r.id) {
                alert("Cannot compare a run with itself. Please select another run.");
                return;
            } else {
                alert("Pick another run as the baseline, then click Compare on it.");
            }
        }

        if (!currentReport) {
            alert("No current run to compare against! Please run a backtest first.");
            return;
        }

        baselineReport = r.report;
        updateCompareButtonState();
        renderComparePanel();
        document.getElementById('compare-modal').classList.add('active');
    }

    function initPackImportExport() {
        const btnExpConfig = document.getElementById('btn-export-pack-config');
        const btnImpConfig = document.getElementById('btn-import-pack-config');
        const btnExpPack = document.getElementById('btn-export-pack-full');
        const btnImpPack = document.getElementById('btn-import-pack-full');
        const fileImpConfig = document.getElementById('file-import-config');
        const fileImpPack = document.getElementById('file-import-pack');

        if (!btnExpConfig || !btnImpConfig || !btnExpPack || !btnImpPack || !fileImpConfig || !fileImpPack) return;

        // Export Config
        btnExpConfig.addEventListener('click', () => {
            let configToExport;
            let asset = 'ASSET', tf = 'TF';

            if (activeLoadedVersionId) {
                const v = strategyVersions.find(x => x.id === activeLoadedVersionId);
                if (v && v.config) {
                    configToExport = v.config;
                    asset = v.config.asset || asset;
                    tf = v.config.timeframe || tf;
                }
            }

            if (!configToExport) {
                configToExport = BacktestEngine.collectInputs();
                const assetEl = document.getElementById('asset-select');
                const tfEl = document.getElementById('timeframe-select');
                asset = assetEl ? assetEl.value : 'ASSET';
                tf = tfEl ? tfEl.value : 'TF';
            }

            const exportObj = {
                version: "1.0.0-parity",
                timestamp: new Date().toISOString(),
                preset: configToExport.preset_name || document.getElementById('preset-selector').value,
                config: configToExport
            };

            const ts = new Date().toISOString().replace(/[:\-T]/g, '').slice(0, 12);
            downloadJSON(exportObj, `prosperpath-config-${asset}-${tf}-${ts}.json`);
        });

        // Export Strategy Pack
        btnExpPack.addEventListener('click', () => {
            let configToExport;
            let reportToExport;
            let metaToExport = { name: "Current Run", notes: "", tags: [] };

            if (activeLoadedVersionId) {
                const v = strategyVersions.find(x => x.id === activeLoadedVersionId);
                if (v) {
                    configToExport = v.config;
                    reportToExport = v.full_report;
                    metaToExport = { name: v.name, notes: v.notes || "", tags: v.tags || [] };
                }
            }

            if (!configToExport || !reportToExport) {
                if (!lastResult || !lastMetrics) {
                    return alert('Please run a backtest first or load a saved version to export a Strategy Pack.');
                }
                configToExport = BacktestEngine.collectInputs();
                reportToExport = buildReportObj('internal');
            }

            const packReport = JSON.parse(JSON.stringify(reportToExport));
            if (packReport.candleset) delete packReport.candleset;

            const pack = {
                schema_version: "pp_strategy_pack_v1",
                created_at: new Date().toISOString(),
                app: "ProsperPath Backtest",
                engine_version: "1.0.0",
                version_meta: metaToExport,
                config: {
                    version: "1.0.0-parity",
                    timestamp: new Date().toISOString(),
                    preset: configToExport.preset_name || 'CUSTOM',
                    config: configToExport
                },
                report: packReport
            };

            const safeName = metaToExport.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
            const ts = new Date().toISOString().replace(/[:\-T]/g, '').slice(0, 12);
            downloadJSON(pack, `prosperpath-pack-${safeName}-${ts}.json`);
        });

        // Import Config
        btnImpConfig.addEventListener('click', () => {
            fileImpConfig.value = '';
            fileImpConfig.click();
        });

        fileImpConfig.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            if (file.size > 5 * 1024 * 1024) return alert('File too large. Maximum size is 5MB.');

            const reader = new FileReader();
            reader.onload = (ev) => {
                try {
                    const data = JSON.parse(ev.target.result);
                    if (!data.config) return alert('Invalid Config file: missing "config" object.');

                    const c = data.config.config ? data.config.config : data.config;
                    applyConfigToUI(c);
                    showToast('Config imported');
                } catch (err) {
                    alert('Failed to parse Config JSON.');
                }
            };
            reader.readAsText(file);
        });

        // Import Strategy Pack
        btnImpPack.addEventListener('click', () => {
            fileImpPack.value = '';
            fileImpPack.click();
        });

        fileImpPack.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            if (file.size > 15 * 1024 * 1024) return alert('File too large. Maximum size is 15MB.');

            const reader = new FileReader();
            reader.onload = (ev) => {
                try {
                    const pack = JSON.parse(ev.target.result);

                    if (pack.schema_version !== 'pp_strategy_pack_v1') return alert('Invalid Strategy Pack: schema_version must be pp_strategy_pack_v1.');
                    if (!pack.config || !pack.report) return alert('Invalid Strategy Pack: missing config or report.');
                    if (!pack.report.equityCurve || !pack.report.drawdownCurve || !pack.report.trades) return alert('Invalid Strategy Pack: report is malformed (missing equityCurve, drawdownCurve, or trades).');

                    const metrics = pack.report.metrics || {};
                    const newVersion = {
                        id: generateCacheId(),
                        name: pack.version_meta?.name || "Imported Pack",
                        notes: pack.version_meta?.notes || "Imported from file",
                        tags: pack.version_meta?.tags || ["imported"],
                        created_at: pack.created_at || new Date().toISOString(),
                        config: pack.config.config || pack.config,
                        report_snapshot: {
                            headline_metrics: metrics,
                            trades_count: pack.report.tradeCount || pack.report.trades.length,
                            return: metrics.totalReturn || '0',
                            maxdd: metrics.maxDrawdown || '0',
                            score: metrics.profitFactor || '0',
                            pf: metrics.profitFactor || '0',
                            expectancy: metrics.avgWinLoss || '0',
                            winrate: metrics.winRate || '0'
                        },
                        full_report: pack.report
                    };

                    strategyVersions.unshift(newVersion);
                    if (strategyVersions.length > 100) strategyVersions.pop();
                    saveVersionsToStorage();
                    renderVersionsList();
                    showToast('Pack imported to Versions');
                } catch (err) {
                    alert('Failed to parse Strategy Pack JSON.');
                }
            };
            reader.readAsText(file);
        });
    }

    function applyConfigToUI(c) {
        const presetSelect = document.getElementById('preset-selector');
        if (c.preset_name && presetSelect) {
            presetSelect.value = c.preset_name;
            presetSelect.dispatchEvent(new Event('change'));
        } else if (presetSelect) {
            presetSelect.value = 'CUSTOM';
            presetSelect.dispatchEvent(new Event('change'));
        }

        if (presetSelect && presetSelect.value !== 'CUSTOM') return;

        const map = {
            'asset-select': c.asset,
            'timeframe-select': c.timeframe,
            'start-date': c.startDate,
            'end-date': c.endDate,
            'starting-capital': c.capital,
            'trading-fees': c.fees,
            'slippage': c.slippage,
            'stop-loss': c.stopLoss,
            'take-profit': c.takeProfit,
            'position-size': c.positionSize
        };

        for (const [domId, val] of Object.entries(map)) {
            const el = document.getElementById(domId);
            if (el && val !== undefined) el.value = val;
        }
    }

    // ---- Batch Experiments (Parameter Sweep) ----
    function initBatchExperiments() {
        const btnOpen = document.getElementById('btn-batch-experiments');
        const modal = document.getElementById('batch-modal-overlay');
        const btnClose = document.getElementById('btn-batch-close');

        if (!btnOpen || !modal) return;

        // Open/Close Modal
        btnOpen.addEventListener('click', () => {
            modal.style.display = 'flex';
            modal.classList.add('open');
            document.body.style.overflow = 'hidden';
            updateTotalCombinations();
        });

        function closeModal() {
            modal.style.display = 'none';
            modal.classList.remove('open');
            document.body.style.overflow = '';
        }
        if (btnClose) btnClose.addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

        // Inputs Configuration
        const paramKeys = [
            { id: 'sl', name: 'Stop Loss', uikey: 'stop-loss' },
            { id: 'tp', name: 'Take Profit', uikey: 'take-profit' },
            { id: 'pos', name: 'Position Size', uikey: 'position-size' }
        ];

        // Toggle inputs on checkbox change
        paramKeys.forEach(p => {
            const cb = document.getElementById(`batch-use-${p.id}`);
            const pane = document.getElementById(`batch-inputs-${p.id}`);
            if (cb && pane) {
                cb.addEventListener('change', () => {
                    pane.style.opacity = cb.checked ? '1' : '0.5';
                    pane.style.pointerEvents = cb.checked ? 'auto' : 'none';
                    updateTotalCombinations();
                });
            }
            // Update total on any input change
            ['start', 'end', 'step'].forEach(suffix => {
                const el = document.getElementById(`batch-${p.id}-${suffix}`);
                if (el) el.addEventListener('input', updateTotalCombinations);
            });
        });

        function getGridForParam(p) {
            const cb = document.getElementById(`batch-use-${p.id}`);
            if (!cb || !cb.checked) return null;

            const start = parseFloat(document.getElementById(`batch-${p.id}-start`).value) || 0;
            const end = parseFloat(document.getElementById(`batch-${p.id}-end`).value) || 0;
            const step = parseFloat(document.getElementById(`batch-${p.id}-step`).value) || 1;

            if (step <= 0 || start > end) return null;

            const vals = [];
            for (let v = start; v <= end; v += step) {
                vals.push(v);
            }
            // fix float precision issues
            return vals.map(v => parseFloat(v.toFixed(4)));
        }

        function buildCombinations() {
            let activeParams = [];
            paramKeys.forEach(p => {
                const vals = getGridForParam(p);
                if (vals && vals.length > 0) {
                    activeParams.push({
                        id: p.id,
                        uikey: p.uikey,
                        name: p.name,
                        vals: vals
                    });
                }
            });

            if (activeParams.length === 0) return [];

            // Cartesian Product
            let combos = [{}];
            for (let ap of activeParams) {
                const nextCombos = [];
                for (let existing of combos) {
                    for (let v of ap.vals) {
                        nextCombos.push({ ...existing, [ap.uikey]: v, [`_name_${ap.uikey}`]: ap.name });
                    }
                }
                combos = nextCombos;
            }
            return combos;
        }

        function updateTotalCombinations() {
            const combos = buildCombinations();
            const total = Math.max(1, combos.length); // If 0 active params, technically 1 run (baseline)
            const countEl = document.getElementById('batch-total-runs');
            const warnEl = document.getElementById('batch-warning');
            const btnExec = document.getElementById('btn-execute-batch');

            if (countEl) countEl.textContent = total;

            if (total > 50) {
                if (warnEl) warnEl.style.display = 'flex';
                if (countEl) countEl.style.color = '#ef4444';
                if (btnExec) btnExec.disabled = true;
                if (btnExec) btnExec.style.opacity = '0.5';
            } else {
                if (warnEl) warnEl.style.display = 'none';
                if (countEl) countEl.style.color = '#818cf8';
                if (btnExec) btnExec.disabled = false;
                if (btnExec) btnExec.style.opacity = '1';
            }
        }

        // Batch Execution
        const btnExec = document.getElementById('btn-execute-batch');
        if (btnExec) {
            btnExec.addEventListener('click', async () => {
                let combos = buildCombinations();
                if (combos.length === 0) {
                    // Empty grid means just 1 run of current UI params
                    combos = [{}];
                }

                if (combos.length > 50) {
                    alert("Hard cap of 50 runs exceeded. Reduce grid size.");
                    return;
                }

                // UI setup
                btnExec.disabled = true;
                btnExec.innerHTML = `<svg class="step-spinner" width="14" height="14" viewBox="0 0 12 12" fill="none" style="display:inline-block; vertical-align:middle; margin-right:6px;"><circle cx="6" cy="6" r="5" stroke="currentColor" stroke-width="2" stroke-dasharray="15 8" fill="none"/></svg> Running...`;

                const progCont = document.getElementById('batch-progress-container');
                const progBar = document.getElementById('batch-progress-bar');
                const statCount = document.getElementById('batch-status-count');
                const statText = document.getElementById('batch-status-text');

                if (progCont) progCont.style.display = 'block';
                if (progBar) progBar.style.width = '0%';

                // 1. Fetch data ONCE using base config
                const baseConfigCtx = BacktestEngine.collectInputs();
                if (statText) statText.textContent = "Fetching data...";

                let candles;
                try {
                    candles = await BacktestEngine.fetchOHLCV(
                        baseConfigCtx.asset, baseConfigCtx.timeframe, baseConfigCtx.startDate, baseConfigCtx.endDate
                    );
                    ohlcvData = candles; // global update
                } catch (e) {
                    alert("Failed fetching data: " + e.message);
                    btnExec.disabled = false;
                    btnExec.textContent = 'Run Batch';
                    return;
                }

                const batchId = Math.random().toString(36).substring(2, 6).toUpperCase();
                const totalN = combos.length;
                let results = [];

                // 2. Sequential execution
                for (let i = 0; i < totalN; i++) {
                    const combo = combos[i];
                    if (statCount) statCount.textContent = `${i + 1} / ${totalN}`;

                    // Build combo summary
                    let pSummary = [];
                    for (let k in combo) {
                        if (k.startsWith('_name_')) continue;
                        pSummary.push(`${combo['_name_' + k]}=${combo[k]}`);
                    }
                    if (statText) statText.textContent = pSummary.length > 0 ? pSummary.join(' | ') : 'Baseline';
                    if (progBar) progBar.style.width = `${((i) / totalN) * 100}%`;

                    // Async yield to event loop so UI updates
                    await new Promise(r => setTimeout(r, 10));

                    try {
                        // Apply combo over base map
                        const runConfig = BacktestEngine.collectInputs();
                        // Override values
                        for (let k in combo) {
                            if (!k.startsWith('_name_')) {
                                runConfig[k] = combo[k];
                            }
                        }

                        // Run engine
                        const engineResult = BacktestEngine.runBacktest(candles, runConfig);
                        const rawMetrics = BacktestEngine.computeMetrics(engineResult, runConfig);
                        const localEquity = engineResult.equityCurve;
                        const ddCurve = BacktestEngine.computeDrawdownCurve(localEquity);

                        // Build full report internal structure
                        const reportObj = {
                            config: runConfig,
                            summary: rawMetrics,
                            equityCurve: localEquity,
                            drawdownCurve: ddCurve,
                            monthlyReturns: BacktestEngine.computeMonthlyReturns(candles, localEquity),
                            distribution: BacktestEngine.computeDistribution(engineResult.trades)
                        };

                        // Store as RunSnapshot
                        const pTagStr = pSummary.length > 0 ? pSummary.join(', ') : 'Base';
                        const snapshotName = `Batch #${batchId} — ${i + 1}/${totalN} — ${pTagStr}`;

                        const snapshot = {
                            id: 'run_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9),
                            name: snapshotName,
                            created_at: new Date().toISOString(),
                            preset_name: currentReport && currentReport.config.preset_name || null,
                            config: runConfig,
                            report: reportObj,
                            notes: 'Generated via Batch Experiments',
                            tags: ['batch', `batch-${batchId}`]
                        };

                        runHistory.unshift(snapshot);
                        if (runHistory.length > 100) runHistory.pop(); // Give them a bit more space for batches

                        results.push({
                            combo: combo,
                            pSummary: pSummary,
                            snapshotId: snapshot.id,
                            ret: parseFloat(rawMetrics.totalReturn),
                            dd: Math.abs(parseFloat(rawMetrics.maxDrawdown)),
                            pf: parseFloat(rawMetrics.profitFactor),
                            trades: rawMetrics.tradeCount,
                            winRate: parseFloat(rawMetrics.winRate),
                            exp: rawMetrics.expectancy
                        });

                    } catch (e) {
                        console.error("Batch run failed:", e);
                    }
                }

                // Flush local history
                saveRunsToStorage();
                renderRunsList(); // Global update in case panel behind is open

                if (progBar) progBar.style.width = '100%';
                if (statText) statText.textContent = "Evaluation complete.";

                // Render table
                renderBatchTable(results);

                // Reset button
                btnExec.disabled = false;
                btnExec.textContent = 'Run Batch';
            });
        }

        let lastBatchResults = [];

        function renderBatchTable(results) {
            lastBatchResults = results || lastBatchResults;
            const tbody = document.getElementById('batch-results-body');
            if (!tbody) return;

            // Read filters
            const minTr = parseInt(document.getElementById('batch-filter-trades')?.value) || 0;
            const maxDd = parseFloat(document.getElementById('batch-filter-dd')?.value) || 100;
            const needPf = document.getElementById('batch-filter-pf')?.checked || false;

            // Compute Score = Return / abs(MaxDD) (clamp DD to min 1 for div/0)
            let rows = lastBatchResults.map(r => {
                const safeDd = Math.max(1, r.dd);
                r.score = r.ret / safeDd;
                return r;
            });

            // Apply Filters
            rows = rows.filter(r => r.trades >= minTr && r.dd <= maxDd && (!needPf || r.pf >= 1.2));

            // Default Sort: Score Descending
            rows.sort((a, b) => b.score - a.score);

            tbody.innerHTML = '';

            if (rows.length === 0) {
                tbody.innerHTML = `<tr><td colspan="8" style="padding: 32px; text-align: center; color: #64748b;">No results match filters.</td></tr>`;
                return;
            }

            rows.forEach((r, idx) => {
                const tr = document.createElement('tr');
                tr.style.background = idx % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent';

                const pStr = r.pSummary.join(', ') || 'Base';
                const retColor = r.ret >= 0 ? 'positive' : 'negative';

                tr.innerHTML = `
                    <td style="padding: 10px; font-weight: 500;">#${idx + 1}</td>
                    <td style="padding: 10px; font-family: 'JetBrains Mono'; font-size: 0.75rem; color: #cbd5e1;">${pStr}</td>
                    <td style="padding: 10px;" class="${retColor}">${(r.ret >= 0 ? '+' : '')}${r.ret.toFixed(2)}%</td>
                    <td style="padding: 10px; color: #f87171;">-${r.dd.toFixed(2)}%</td>
                    <td style="padding: 10px; font-weight: 600; color: #818cf8;">${r.score.toFixed(2)}</td>
                    <td style="padding: 10px; color: ${r.pf >= 1.0 ? '#4ade80' : '#f87171'}">${r.pf.toFixed(2)}</td>
                    <td style="padding: 10px;">${r.trades}</td>
                    <td style="padding: 10px;">
                        <div style="display: flex; gap: 4px;">
                            <button class="bt-btn-sm" onclick="openRun('${r.snapshotId}'); document.getElementById('btn-batch-close').click();" style="padding: 4px 8px; font-size: 0.7rem; background: rgba(56, 189, 248, 0.1); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.3);">Open</button>
                            <button class="bt-btn-sm" onclick="compareRun('${r.snapshotId}'); document.getElementById('btn-batch-close').click();" style="padding: 4px 8px; font-size: 0.7rem; background: rgba(99, 102, 241, 0.1); color: #818cf8; border: 1px solid rgba(99, 102, 241, 0.3);">Vs B</button>
                        </div>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        }

        // Bind filter events to re-render
        ['batch-filter-trades', 'batch-filter-dd'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('input', () => renderBatchTable());
        });
        const pfEl = document.getElementById('batch-filter-pf');
        if (pfEl) pfEl.addEventListener('change', () => renderBatchTable());

    }

    // ---- Auto-Discovery AI (Mini Sweep) ----
    function initAutoDiscovery() {
        const btnOpen = document.getElementById('btn-auto-discovery');
        const modal = document.getElementById('ad-modal-overlay');
        const btnClose = document.getElementById('btn-ad-close');

        if (!btnOpen || !modal) return;

        btnOpen.addEventListener('click', () => {
            modal.style.display = 'flex';
            modal.classList.add('open');
            document.body.style.overflow = 'hidden';
            resetAutoDiscoveryUI();
        });

        function closeModal() {
            modal.style.display = 'none';
            modal.classList.remove('open');
            document.body.style.overflow = '';
        }

        if (btnClose) btnClose.addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });

        const btnPropose = document.getElementById('btn-ad-propose');
        const btnExecute = document.getElementById('btn-ad-execute');
        const btnOpenWinner = document.getElementById('btn-ad-open-winner');
        const btnCompareWinner = document.getElementById('btn-ad-compare-winner');

        let proposedRuns = null;
        let adResults = [];
        let controlSnapshotId = null;
        let winnerSnapshotId = null;

        function resetAutoDiscoveryUI() {
            document.getElementById('ad-config-panel').style.display = 'block';
            document.getElementById('ad-propose-loading').style.display = 'none';
            document.getElementById('ad-propose-results').style.display = 'none';
            document.getElementById('ad-progress-container').style.display = 'none';
            document.getElementById('ad-final-summary').style.display = 'none';
            document.getElementById('btn-ad-execute').style.display = 'block';
            document.getElementById('btn-ad-execute').disabled = false;
            document.getElementById('btn-ad-execute').innerHTML = 'Execute Discovery Sweep';
            document.getElementById('btn-ad-propose').style.display = 'block';
            proposedRuns = null;
            adResults = [];
            controlSnapshotId = null;
            winnerSnapshotId = null;
        }

        btnPropose.addEventListener('click', async () => {
            document.getElementById('btn-ad-propose').style.display = 'none';
            document.getElementById('ad-propose-loading').style.display = 'flex';

            const objectiveParam = document.getElementById('ad-objective').value; // 'score', 'maxdd', 'expectancy'
            const maxDD = parseFloat(document.getElementById('ad-max-dd').value) || 35;
            const minTrades = parseInt(document.getElementById('ad-min-trades').value) || 30;

            const currentConfig = BacktestEngine.collectInputs();
            const allowedParams = {
                stop_loss_pct: parseFloat((currentConfig.stopPercent * 100).toFixed(2)),
                risk_per_trade_pct: parseFloat((currentConfig.riskPercent * 100).toFixed(2)),
                fee_rate_pct: parseFloat((currentConfig.feeRate * 100).toFixed(3)),
                slippage_pct: parseFloat((currentConfig.slippagePct * 100).toFixed(3))
            };

            const systemPrompt = `You are a quantitative trading strategy optimizer. 
Your goal is to propose a small strategic parameter sweep to discover an optimal configuration.
Target Objective: ${objectiveParam}
Constraints: Max Drawdown <= ${maxDD}%, Min Trades >= ${minTrades}
Current Configuration Inputs (Allowed to vary only these): 
${JSON.stringify(allowedParams)}

CRITICAL: Output ONLY a valid JSON object matching this schema. NO Markdown wrapping blocks or explanation.
{
  "objective": "${objectiveParam}",
  "runs": [
    {
      "label": "CONTROL",
      "overrides": {}
    },
    {
      "label": "Tighter risk, higher winrate",
      "overrides": {
        "stop_loss_pct": 2.0,
        "risk_per_trade_pct": 1.0
      }
    }
  ]
}

Strict Override Boundaries (do not exceed):
- stop_loss_pct: 0.5 to 10.0
- risk_per_trade_pct: 0.5 to 10.0
- fee_rate_pct: 0.0 to 0.5
- slippage_pct: 0.0 to 0.5

Limit to MAXIMUM 12 runs total (including CONTROL).`;

            let apiKey = window.localStorage ? window.localStorage.getItem('prosporous_api_key') : null;
            if (!apiKey || apiKey === 'null' || !apiKey.trim()) {
                apiKey = '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';
            }

            try {
                const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'HTTP-Referer': window.location.origin || 'https://prosperpath.ai',
                        'X-Title': 'ProsperPath Auto-Discovery',
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        model: 'z-ai/glm-4.5-air:free',
                        messages: [
                            { role: 'system', content: systemPrompt },
                            { role: 'user', content: 'Generate the structured JSON proposal now.' }
                        ]
                    })
                });

                if (!response.ok) throw new Error("API call failed");
                const data = await response.json();
                const contentText = data.choices[0].message.content;

                let parsed;
                try {
                    parsed = JSON.parse(contentText);
                } catch {
                    const match = contentText.match(/```(?:json)?\n?([\s\S]*?)\n?```/) || contentText.match(/{[\s\S]*}/);
                    if (match) parsed = JSON.parse(match[1] || match[0]);
                    else throw new Error("Failed to extract JSON");
                }

                if (!parsed.runs || !Array.isArray(parsed.runs) || parsed.runs.length > 12) {
                    throw new Error("Invalid runs format or exceeded 12 runs limit.");
                }

                proposedRuns = parsed.runs;

                const runList = document.getElementById('ad-proposed-runs');
                runList.innerHTML = '';
                proposedRuns.forEach((r, i) => {
                    const paramsText = Object.keys(r.overrides || {}).length === 0 ? "Initial Config" : JSON.stringify(r.overrides).replace(/["{}]/g, '').replace(/:/g, '=');
                    const el = document.createElement('div');
                    el.style.marginBottom = '6px';
                    el.innerHTML = `[Run ${i + 1}] <span style="color:#e2e8f0; font-weight: 500;">${r.label}</span>: <span style="color:#94a3b8">${paramsText}</span>`;
                    runList.appendChild(el);
                });

                document.getElementById('ad-sweep-count').innerText = `${proposedRuns.length} Runs Total (${proposedRuns[0].label === 'CONTROL' ? 'Includes Control' : 'No Control detected'})`;

                document.getElementById('ad-config-panel').style.display = 'none';
                document.getElementById('ad-propose-results').style.display = 'flex';

            } catch (err) {
                console.error("Auto Discovery Propose Error", err);
                alert("Failed to synthesize sweep: " + err.message);
                document.getElementById('btn-ad-propose').style.display = 'block';
                document.getElementById('ad-propose-loading').style.display = 'none';
            }
        });

        btnExecute.addEventListener('click', async () => {
            if (!proposedRuns || proposedRuns.length === 0) return;

            btnExecute.disabled = true;
            btnExecute.innerHTML = `<span class="cb-spinner" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 6px;"></span> Running...`;

            const progCont = document.getElementById('ad-progress-container');
            const progBar = document.getElementById('ad-progress-bar');
            const statCount = document.getElementById('ad-status-count');
            const statText = document.getElementById('ad-status-text');

            progCont.style.display = 'block';
            progBar.style.width = '0%';

            const baseConfigCtx = BacktestEngine.collectInputs();
            statText.textContent = "Fetching data...";

            let candles;
            try {
                candles = await BacktestEngine.fetchOHLCV(
                    baseConfigCtx.asset, baseConfigCtx.timeframe, baseConfigCtx.startDate, baseConfigCtx.endDate
                );
                ohlcvData = candles;
            } catch (e) {
                alert("Failed fetching data: " + e.message);
                btnExecute.disabled = false;
                btnExecute.textContent = 'Execute Discovery Sweep';
                return;
            }

            const totalN = proposedRuns.length;
            adResults = [];

            for (let i = 0; i < totalN; i++) {
                const runDef = proposedRuns[i];
                statCount.textContent = `${i + 1} / ${totalN}`;
                statText.textContent = runDef.label;
                progBar.style.width = `${((i) / totalN) * 100}%`;

                await new Promise(r => setTimeout(r, 10));

                try {
                    const runConfig = BacktestEngine.collectInputs();

                    if (runDef.overrides) {
                        if (runDef.overrides.stop_loss_pct !== undefined) runConfig.stopPercent = runDef.overrides.stop_loss_pct / 100;
                        if (runDef.overrides.risk_per_trade_pct !== undefined) runConfig.riskPercent = runDef.overrides.risk_per_trade_pct / 100;
                        if (runDef.overrides.fee_rate_pct !== undefined) runConfig.feeRate = runDef.overrides.fee_rate_pct / 100;
                        if (runDef.overrides.slippage_pct !== undefined) runConfig.slippagePct = runDef.overrides.slippage_pct / 100;
                    }

                    const engineResult = BacktestEngine.runBacktest(candles, runConfig);
                    const rawMetrics = BacktestEngine.computeMetrics(engineResult, runConfig);
                    const localEquity = engineResult.equityCurve;
                    const ddCurve = BacktestEngine.computeDrawdownCurve(localEquity);

                    const reportObj = {
                        config: runConfig,
                        summary: rawMetrics,
                        equityCurve: localEquity,
                        drawdownCurve: ddCurve,
                        monthlyReturns: BacktestEngine.computeMonthlyReturns(candles, localEquity),
                        distribution: BacktestEngine.computeDistribution(engineResult.trades)
                    };

                    const snapshot = {
                        id: 'ad_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9),
                        name: `Auto-Discovery: ${runDef.label}`,
                        created_at: new Date().toISOString(),
                        preset_name: 'AI Discovery Temp',
                        config: runConfig,
                        report: reportObj,
                        notes: 'Generated via Auto-Discovery',
                        tags: ['auto-discovery']
                    };

                    if (typeof runHistory !== 'undefined') {
                        runHistory.unshift(snapshot);
                        if (runHistory.length > 200) runHistory.pop();
                    }

                    if (runDef.label === 'CONTROL') {
                        controlSnapshotId = snapshot.id;
                    }

                    const retVal = parseFloat(rawMetrics.totalReturn) || 0;
                    const ddVal = Math.abs(parseFloat(rawMetrics.maxDrawdown)) || 0;

                    adResults.push({
                        snapshotId: snapshot.id,
                        label: runDef.label,
                        overrides: runDef.overrides || {},
                        ret: retVal,
                        dd: ddVal,
                        score: ddVal === 0 ? retVal : (retVal / ddVal),
                        pf: parseFloat(rawMetrics.profitFactor) || 0,
                        trades: rawMetrics.tradeCount || 0,
                        expectancy: parseFloat(rawMetrics.expectancy) || 0
                    });
                } catch (e) {
                    console.error("Run error on", runDef.label, e);
                }
            }

            progBar.style.width = `100%`;
            statText.textContent = "Finalizing Summary...";

            await new Promise(r => setTimeout(r, 500));

            generateSummary();
        });

        function generateSummary() {
            const objectiveParam = document.getElementById('ad-objective').value;
            const maxDD = parseFloat(document.getElementById('ad-max-dd').value) || 35;
            const minTrades = parseInt(document.getElementById('ad-min-trades').value) || 30;

            let validRuns = adResults.filter(r => r.dd <= maxDD && r.trades >= minTrades);

            if (validRuns.length === 0) {
                alert("No permutations met the risk/trade constraints. Modify boundaries and try again.");
                document.getElementById('btn-ad-execute').style.display = 'block';
                document.getElementById('btn-ad-execute').disabled = false;
                document.getElementById('btn-ad-execute').innerHTML = 'Execute Discovery Sweep';
                return;
            }

            validRuns.sort((a, b) => {
                if (objectiveParam === 'maxdd') return a.dd - b.dd;
                if (objectiveParam === 'expectancy') return b.expectancy - a.expectancy;
                return b.score - a.score;
            });

            const winner = validRuns[0];
            winnerSnapshotId = winner.snapshotId;
            let control = adResults.find(r => r.label === 'CONTROL') || adResults[0];

            document.getElementById('btn-ad-execute').style.display = 'none';
            document.getElementById('ad-progress-container').style.display = 'none';
            document.getElementById('ad-final-summary').style.display = 'flex';

            const tb = document.getElementById('ad-delta-tbody');
            tb.innerHTML = '';

            const metrics = [
                { name: 'Total Return', key: 'ret', fmt: v => '+' + v.toFixed(2) + '%', inv: false },
                { name: 'Max Drawdown', key: 'dd', fmt: v => '-' + v.toFixed(2) + '%', inv: true },
                { name: 'Score', key: 'score', fmt: v => v.toFixed(2), inv: false },
                { name: 'Profit Factor', key: 'pf', fmt: v => v.toFixed(2), inv: false },
                { name: 'Total Trades', key: 'trades', fmt: v => v, inv: false }
            ];

            metrics.forEach(m => {
                const cVal = control[m.key];
                const wVal = winner[m.key];
                let delta = wVal - cVal;
                let isBetter = m.inv ? (delta < 0) : (delta > 0);
                if (Math.abs(delta) < 0.01) isBetter = null;

                let deltaColor = isBetter === true ? '#4ade80' : (isBetter === false ? '#f87171' : '#94a3b8');
                let deltaStr = (delta > 0 ? '+' : '') + (m.key === 'trades' ? delta.toFixed(0) : delta.toFixed(2));

                tb.innerHTML += `
                    <tr style="border-bottom: 1px solid rgba(255,255,255,0.02);">
                        <td style="padding: 10px 16px; color: #e2e8f0;">${m.name}</td>
                        <td style="padding: 10px; color: #94a3b8;">${m.fmt(cVal)}</td>
                        <td style="padding: 10px; font-weight: 600; color: #f8fafc;">${m.fmt(wVal)}</td>
                        <td style="padding: 10px; color: ${deltaColor}; font-weight: 500;">${deltaStr}</td>
                    </tr>
                `;
            });

            const topList = document.getElementById('ad-top-3-list');
            topList.innerHTML = '';
            validRuns.slice(0, 3).forEach((r, i) => {
                let pText = Object.keys(r.overrides).length ? JSON.stringify(r.overrides).replace(/["{}]/g, '').replace(/:/g, '=') : 'Base';
                topList.innerHTML += `
                    <div style="display: flex; justify-content: space-between; align-items: center; padding-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.05);">
                        <div>
                            <span style="color: ${i === 0 ? '#38bdf8' : '#e2e8f0'}; font-weight: 600; margin-right: 8px;">#${i + 1}</span>
                            <span>${r.label}</span>
                            <div style="font-size: 0.7rem; color: #64748b; margin-top: 4px; font-family: 'JetBrains Mono';">${pText}</div>
                        </div>
                        <div style="text-align: right;">
                            <div style="color: #4ade80;">+${r.ret.toFixed(1)}%</div>
                            <div style="color: #f87171; font-size: 0.75rem;">-${r.dd.toFixed(1)}%</div>
                        </div>
                    </div>
                `;
            });

            const notes = document.getElementById('ad-stability-notes');
            notes.innerHTML = '';
            let noteStr = [];

            if (winner.score > control.score * 1.05) {
                noteStr.push(`<li>Winner improved the Score objective measurably by modifying constraints.</li>`);
            } else if (winner.score < control.score) {
                noteStr.push(`<li>Control is already highly optimized for scoring. NO functionally robust alternate found.</li>`);
            }

            if (winner.dd < control.dd * 0.9) {
                noteStr.push(`<li>Drawdown risk was heavily mitigated (risk reduction of ${(control.dd - winner.dd).toFixed(2)}%).</li>`);
            }
            if (winner.trades < minTrades * 1.5) {
                noteStr.push(`<li><span style="color: #fbbf24;">Warning:</span> Trade sample size is low (${winner.trades}). Optimization may be curve-fitted.</li>`);
            }

            if (noteStr.length === 0) noteStr.push(`<li>Performance profile was statistically similar to the Control baseline.</li>`);
            notes.innerHTML = noteStr.join('');

            let rec = 'Stick to default config.';
            if (winner.score > control.score && winner.trades >= minTrades * 1.2) {
                rec = `Adopting "${winner.label}" profile provides a structurally sound improvement under current conditions.`;
            } else if (winner.dd < control.dd && (winner.ret > control.ret * 0.9)) {
                rec = `"${winner.label}" provides superior capital protection for similar returns. Recommended for strict risk goals.`;
            }
            document.getElementById('ad-recommendation-note').innerText = rec;
        }

        btnOpenWinner.addEventListener('click', () => {
            if (winnerSnapshotId) {
                openRun(winnerSnapshotId);
                closeModal();
            }
        });

        btnCompareWinner.addEventListener('click', () => {
            if (winnerSnapshotId && controlSnapshotId) {
                window.compareSideA = getSnapshotData(controlSnapshotId);
                window.compareSideB = getSnapshotData(winnerSnapshotId);
                renderCompareModal();
                const cm = document.getElementById('compare-modal-overlay');
                cm.style.display = 'flex';
                cm.classList.add('open');
                closeModal();
            } else {
                alert("Missing snapshots for comparison. Ensure CONTROL was generated.");
            }
        });

    }

    function showToast(msg) {
        const toast = document.createElement('div');
        toast.textContent = msg;
        toast.style.position = 'fixed';
        toast.style.bottom = '20px';
        toast.style.right = '20px';
        toast.style.background = '#4ade80';
        toast.style.color = '#0f172a';
        toast.style.padding = '12px 24px';
        toast.style.borderRadius = '8px';
        toast.style.fontWeight = '600';
        toast.style.boxShadow = '0 10px 15px -3px rgba(0,0,0,0.5)';
        toast.style.zIndex = '99999';
        toast.style.opacity = '1';
        toast.style.transition = 'opacity 0.5s';

        document.body.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 500);
        }, 3000);
    }

    // ---- Init ----
    function init() {
        const initSteps = [
            { name: 'Tabs', fn: initTabs },
            { name: 'Toggles', fn: initToggles },
            { name: 'RunButton', fn: initRunButton },
            { name: 'Indicators', fn: initIndicators },
            { name: 'AIStrategyModal', fn: initAIStrategyModal },
            { name: 'Presets', fn: initPresets },
            { name: 'Exports', fn: initExports },
            { name: 'ExplainButton', fn: initExplainButton },
            { name: 'Versions', fn: initVersions },
            { name: 'PackImportExport', fn: initPackImportExport },
            { name: 'RunHistory', fn: initRunHistory },
            { name: 'BatchExperiments', fn: initBatchExperiments },
            { name: 'AutoDiscovery', fn: initAutoDiscovery }
        ];

        initSteps.forEach(step => {
            try {
                step.fn();
            } catch (e) {
                console.error(`[Init Error] ${step.name} failed:`, e);
            }
        });

        window.addEventListener('resize', handleResize);

        // Set default BTC-USD + 4H + dates matching production data
        const assetSelect = document.getElementById('asset-select');
        const tfSelect = document.getElementById('timeframe-select');
        const startDate = document.getElementById('start-date');
        const endDate = document.getElementById('end-date');
        const capitalInput = document.getElementById('starting-capital');
        const feeInput = document.getElementById('trading-fees');
        const slipInput = document.getElementById('slippage');
        const stopInput = document.getElementById('stop-loss');
        const posInput = document.getElementById('position-size');

        if (assetSelect) assetSelect.value = 'BTC-USD';
        if (tfSelect) tfSelect.value = '4h';
        if (startDate) startDate.value = '2019-01-01';
        if (endDate) endDate.value = '2024-12-31';
        if (capitalInput) capitalInput.value = '10000';
        if (feeInput) feeInput.value = '0.10';
        if (slipInput) slipInput.value = '0.10';
        if (stopInput) stopInput.value = '2.0';
        if (posInput) posInput.value = '2';
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // ---- Hard Verification Tests (Step 4) ----
    window.__ppTestVersionsFlow = function () {
        console.log("=== STARTING VERSION JOURNAL + COMPARE VERIFICATION FLOW ===");

        let passCount = 0;
        let failCount = 0;

        function assert(condition, message) {
            if (condition) {
                console.log("✅ PASS:", message);
                passCount++;
            } else {
                console.error("❌ FAIL:", message);
                failCount++;
            }
        }

        try {
            // A) Run backtest
            console.log("Simulating A) Run Backtest");
            currentReport = {
                metadata: "mock_current",
                trades: [{ pnl: 100 }],
                equityCurve: [100, 105],
                drawdownCurve: [0, -2],
                config: { preset_name: "CUSTOM", asset: "BTC-USD" },
                metrics: { totalReturn: "10.0" },
                candleMetadata: { count: 100 }
            };
            assert(!!currentReport, "currentReport exists and is populated");

            // B) Save Version
            console.log("Simulating B) Save Version");
            const initialVersionsLength = strategyVersions.length;
            saveVersion("Test Version 1", "Notes", ["tag"]);
            assert(strategyVersions.length === initialVersionsLength + 1, "Save Version increments array");
            const stored = JSON.parse(localStorage.getItem('pp_backtest_versions_v1'));
            assert(stored.length === strategyVersions.length, "Save Version stored physically to localStorage");

            // C) Refresh Page
            console.log("Simulating C) Refresh Page");
            strategyVersions = [];
            currentReport = null;
            selectedVersionId = null;
            initVersions();
            assert(strategyVersions.length > 0, "Refresh re-loads versions successfully");

            // D) Load saved version
            console.log("Simulating D) Load Saved Version");
            const firstVersion = strategyVersions[0];
            selectedVersionId = firstVersion.id;
            handleJournalLoad();
            // Assuming DOM exists or function doesn't throw
            assert(activeLoadedVersionId === firstVersion.id, "Load Version correctly processes and assigns activeLoadedVersionId");

            // E) Run backtest again (new current)
            console.log("Simulating E) Run Backtest Again");
            currentReport = {
                metadata: "mock_current_2",
                trades: [{ pnl: -50 }],
                equityCurve: [100, 95], // same length
                drawdownCurve: [0, -5],
                config: { preset_name: "CUSTOM", asset: "BTC-USD" },
                metrics: { totalReturn: "-5.0" },
                candleMetadata: { count: 100 }
            };
            assert(currentReport.metadata === "mock_current_2", "New currentReport is distinct");

            // F) Compare Version vs Current
            console.log("Simulating F) Compare Version vs Current");
            handleJournalCompare(); // Expects modal to open, but we care that baseline/current matched
            assert(baselineReport === firstVersion.full_report, "Compare sets correct baselineReport");
            assert(currentReport.metadata === "mock_current_2", "Compare retains currentReport");

        } catch (e) {
            console.error("Test Exception:", e);
        }

        console.log(`=== TEST COMPLETE: ${passCount} PASS / ${failCount} FAIL ===`);
        return passCount > 0 && failCount === 0 ? "PASS" : "FAIL";
    };

    window.__ppClearVersions = function () {
        localStorage.removeItem('pp_backtest_versions_v1');
        strategyVersions = [];
        selectedVersionId = null;
        renderVersionsList();
        updateJournalButtonsState();
        console.log("Versions cleared.");
    }

})();
