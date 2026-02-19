/* ========================================
   BACKTEST ENGINE — Chart Rendering & Interactivity
   Mock data only, no backend calls
   ======================================== */

(function () {
    'use strict';

    // ---- Mock OHLCV Data (SPY-like) ----
    function generateMockOHLCV(numBars) {
        const data = [];
        let price = 420;
        const startDate = new Date('2023-01-03');
        for (let i = 0; i < numBars; i++) {
            const d = new Date(startDate);
            d.setDate(d.getDate() + i);
            if (d.getDay() === 0 || d.getDay() === 6) continue;
            const change = (Math.random() - 0.48) * 4;
            const open = price;
            const close = price + change;
            const high = Math.max(open, close) + Math.random() * 2;
            const low = Math.min(open, close) - Math.random() * 2;
            const volume = Math.floor(40000000 + Math.random() * 30000000);
            data.push({ date: new Date(d), open, high, low, close, volume });
            price = close;
        }
        return data;
    }

    let ohlcvData = generateMockOHLCV(800);

    // ---- Mock Equity Curve ----
    function generateEquityCurve() {
        const pts = [];
        let equity = 100000;
        for (let i = 0; i < 500; i++) {
            equity += (Math.random() - 0.42) * 600;
            equity = Math.max(equity, 80000);
            pts.push(equity);
        }
        return pts;
    }
    let equityCurve = generateEquityCurve();

    // ---- Mock Drawdown ----
    function generateDrawdown() {
        let peak = 100000;
        return equityCurve.map(eq => {
            if (eq > peak) peak = eq;
            return ((eq - peak) / peak) * 100;
        });
    }
    let drawdownData = generateDrawdown();

    // ---- Mock Distribution ----
    function generateDistribution() {
        const bins = [];
        for (let i = -8; i <= 8; i++) {
            let count;
            const abs = Math.abs(i);
            if (abs <= 1) count = 20 + Math.floor(Math.random() * 10);
            else if (abs <= 3) count = 10 + Math.floor(Math.random() * 8);
            else if (abs <= 5) count = 4 + Math.floor(Math.random() * 5);
            else count = Math.floor(Math.random() * 3);
            bins.push({ label: (i >= 0 ? '+' : '') + i + '%', value: count, pct: i });
        }
        return bins;
    }
    let distributionData = generateDistribution();

    // ---- Monthly Returns Heatmap Data ----
    const monthlyReturns = {
        2023: [2.1, -0.8, 3.4, 1.2, -1.5, 2.8, 0.4, -2.1, 1.6, 3.2, -0.3, 1.9],
        2024: [1.4, 2.7, -0.6, 0.9, 3.1, -1.2, 2.3, 1.1, -0.9, 2.5, 1.8, -0.4],
        2025: [-0.3, 1.8, 2.4, -1.7, 0.6, 3.5, 1.2, -0.5, 2.1, 1.4, 2.9, 0.8]
    };

    // ---- Canvas Rendering ----

    function initCanvas(canvasId, parentId) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return null;
        const parent = parentId ? document.getElementById(parentId) : canvas.parentElement;
        if (!parent) return null;
        const rect = parent.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        canvas.style.width = rect.width + 'px';
        canvas.style.height = rect.height + 'px';
        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);
        return { ctx, w: rect.width, h: rect.height };
    }

    // Candlestick Chart
    function drawCandlestickChart() {
        const r = initCanvas('candlestick-canvas', 'main-chart');
        if (!r) return;
        const { ctx, w, h } = r;
        const data = ohlcvData.slice(-120);
        const padding = { top: 30, right: 60, bottom: 30, left: 10 };
        const chartW = w - padding.left - padding.right;
        const chartH = h - padding.top - padding.bottom;

        const highs = data.map(d => d.high);
        const lows = data.map(d => d.low);
        let maxP = Math.max(...highs);
        let minP = Math.min(...lows);
        const range = maxP - minP;
        maxP += range * 0.05;
        minP -= range * 0.05;

        const barW = chartW / data.length;
        const bodyW = Math.max(barW * 0.65, 2);

        // Grid lines
        ctx.strokeStyle = 'rgba(255,255,255,0.04)';
        ctx.lineWidth = 1;
        const gridLines = 8;
        for (let i = 0; i <= gridLines; i++) {
            const y = padding.top + (i / gridLines) * chartH;
            ctx.beginPath();
            ctx.moveTo(padding.left, y);
            ctx.lineTo(w - padding.right, y);
            ctx.stroke();

            // Price labels
            const price = maxP - (i / gridLines) * (maxP - minP);
            ctx.fillStyle = '#475569';
            ctx.font = '10px "JetBrains Mono", monospace';
            ctx.textAlign = 'left';
            ctx.fillText('$' + price.toFixed(0), w - padding.right + 8, y + 3);
        }

        // SMA line
        const smaPeriod = 20;
        const smaValues = [];
        for (let i = 0; i < data.length; i++) {
            if (i < smaPeriod - 1) { smaValues.push(null); continue; }
            let sum = 0;
            for (let j = i - smaPeriod + 1; j <= i; j++) sum += data[j].close;
            smaValues.push(sum / smaPeriod);
        }

        ctx.beginPath();
        ctx.strokeStyle = 'rgba(96, 165, 250, 0.6)';
        ctx.lineWidth = 1.5;
        let started = false;
        for (let i = 0; i < data.length; i++) {
            if (smaValues[i] === null) continue;
            const x = padding.left + (i + 0.5) * barW;
            const y = padding.top + ((maxP - smaValues[i]) / (maxP - minP)) * chartH;
            if (!started) { ctx.moveTo(x, y); started = true; }
            else ctx.lineTo(x, y);
        }
        ctx.stroke();

        // Candlesticks
        for (let i = 0; i < data.length; i++) {
            const d = data[i];
            const x = padding.left + (i + 0.5) * barW;
            const yOpen = padding.top + ((maxP - d.open) / (maxP - minP)) * chartH;
            const yClose = padding.top + ((maxP - d.close) / (maxP - minP)) * chartH;
            const yHigh = padding.top + ((maxP - d.high) / (maxP - minP)) * chartH;
            const yLow = padding.top + ((maxP - d.low) / (maxP - minP)) * chartH;
            const bullish = d.close >= d.open;

            // Wick
            ctx.beginPath();
            ctx.strokeStyle = bullish ? 'rgba(34, 197, 94, 0.7)' : 'rgba(239, 68, 68, 0.7)';
            ctx.lineWidth = 1;
            ctx.moveTo(x, yHigh);
            ctx.lineTo(x, yLow);
            ctx.stroke();

            // Body
            const bodyTop = Math.min(yOpen, yClose);
            const bodyH = Math.max(Math.abs(yClose - yOpen), 1);
            ctx.fillStyle = bullish ? 'rgba(34, 197, 94, 0.85)' : 'rgba(239, 68, 68, 0.85)';
            ctx.fillRect(x - bodyW / 2, bodyTop, bodyW, bodyH);
        }

        // Trade markers (mock)
        const trades = [
            { idx: 15, type: 'buy' }, { idx: 22, type: 'sell' },
            { idx: 40, type: 'buy' }, { idx: 52, type: 'sell' },
            { idx: 65, type: 'buy' }, { idx: 78, type: 'sell' },
            { idx: 90, type: 'buy' }, { idx: 105, type: 'sell' }
        ];

        trades.forEach(t => {
            if (t.idx >= data.length) return;
            const d = data[t.idx];
            const x = padding.left + (t.idx + 0.5) * barW;
            const isBuy = t.type === 'buy';
            const y = isBuy ?
                padding.top + ((maxP - d.low) / (maxP - minP)) * chartH + 12 :
                padding.top + ((maxP - d.high) / (maxP - minP)) * chartH - 12;

            ctx.beginPath();
            if (isBuy) {
                ctx.moveTo(x, y);
                ctx.lineTo(x - 5, y + 8);
                ctx.lineTo(x + 5, y + 8);
            } else {
                ctx.moveTo(x, y);
                ctx.lineTo(x - 5, y - 8);
                ctx.lineTo(x + 5, y - 8);
            }
            ctx.closePath();
            ctx.fillStyle = isBuy ? 'rgba(34, 197, 94, 0.9)' : 'rgba(239, 68, 68, 0.9)';
            ctx.fill();
        });
    }

    // Volume Chart
    function drawVolumeChart() {
        const r = initCanvas('volume-canvas', 'volume-chart');
        if (!r) return;
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
        if (!r) return;
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
        if (!r) return;
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
        if (!r) return;
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
            const bH = (d.value / maxVal) * chartH;
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
            monthlyReturns[year].forEach(val => {
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
            });

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

            // Run Sequence
            (async () => {
                await addStep('Loading historical data...', 100);
                await addStep('Computing indicators...', 800);
                await addStep('Executing trades...', 800);
                await addStep('Calculating performance metrics...', 600);
                const lastStep = await addStep('Generating performance report...', 600);

                // Final wait
                setTimeout(() => {
                    // Mark last step done
                    lastStep.classList.add('complete');
                    lastStep.querySelector('.step-icon').innerHTML = `<span class="step-check">✓</span>`;

                    // Finish
                    finishBacktest();
                }, 500);
            })();
        });

        function finishBacktest() {
            // Updated Data Generation
            equityCurve = generateEquityCurve(); // New random curve
            drawdownData = generateDrawdown();
            distributionData = generateDistribution();

            // Random Metrics (Target Values)
            const rawMetrics = {
                totalReturn: (Math.random() * 60 + 10).toFixed(2),
                cagr: (Math.random() * 20 + 5).toFixed(2),
                maxDrawdown: '-' + (Math.random() * 15 + 2).toFixed(2),
                sharpe: (Math.random() * 1.5 + 1.2).toFixed(2),
                sortino: (Math.random() * 2 + 1.5).toFixed(2),
                winRate: (Math.random() * 20 + 50).toFixed(1),
                profitFactor: (Math.random() * 1 + 1.5).toFixed(2),
                expectancy: Math.floor(Math.random() * 400 + 100),
                tradeCount: Math.floor(Math.random() * 100 + 50),
                calmar: (Math.random() * 2 + 0.5).toFixed(2),
                avgWinLoss: (Math.random() * 1.5 + 1).toFixed(2),
                maxConsecLosses: Math.floor(Math.random() * 6 + 1),
                avgTradeDuration: (Math.random() * 5 + 1).toFixed(1),
                exposureTime: (Math.random() * 40 + 40).toFixed(1)
            };

            // Prepare UI for Animation
            overlay.classList.remove('active');

            // Generate mock trades content but hide table initially
            const tradeTableBody = document.getElementById('trade-log-body');
            const tableWrap = document.querySelector('.bt-trade-table-wrap');
            if (tradeTableBody && tableWrap) {
                // ... (generate simulated trade rows logic below) ...
                const sides = ['LONG', 'SHORT'];
                let html = '';
                const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                for (let i = 0; i < 10; i++) {
                    const isWin = Math.random() > 0.4;
                    const side = sides[Math.floor(Math.random() * 2)];
                    const pnl = isWin ? Math.floor(Math.random() * 4000 + 500) : -Math.floor(Math.random() * 2000 + 100);
                    const pct = (isWin ? '+' : '') + (Math.random() * 5).toFixed(2) + '%';
                    const cssClass = isWin ? 'positive' : 'negative';
                    const day = Math.floor(Math.random() * 28) + 1;
                    const month = months[Math.floor(Math.random() * 12)];
                    html += `<tr><td>${month} ${day}</td><td>${month} ${day + 2}</td><td><span class="bt-side ${side.toLowerCase()}">${side}</span></td><td class="${cssClass}">${pct}</td><td class="${cssClass}">${pnl < 0 ? '-' : '+'}$${Math.abs(pnl)}</td><td>3d</td></tr>`;
                }
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

                if (status) {
                    status.querySelector('.bt-status-dot').style.background = '#22c55e';
                    status.querySelector('.bt-status-dot').style.boxShadow = '0 0 8px rgba(34, 197, 94, 0.5)';
                    status.querySelector('span:last-child').textContent = 'Ready';
                }
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

    // ---- Init ----
    function init() {
        drawCandlestickChart();
        drawVolumeChart();
        drawEquityChart();
        renderHeatmap();
        initTabs();
        initToggles();
        initRunButton();
        initIndicators();
        initAIStrategyModal();
        window.addEventListener('resize', handleResize);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
