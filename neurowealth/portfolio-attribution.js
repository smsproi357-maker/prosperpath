/**
 * PROSPERPATH — PORTFOLIO ATTRIBUTION + DIAGNOSTICS (v1)
 * Computes attribution metrics, correlation, and operator diagnostics.
 */

(function () {
    'use strict';

    const PortfolioAttribution = {
        /**
         * Compute all attribution and diagnostic metrics.
         */
        computeAttribution(portfolio, eq) {
            if (!portfolio || !eq || !eq.strategyResults) return null;

            const results = eq.strategyResults;
            const metrics = {
                slots: [],
                portfolio: {},
                timestamp: new Date().toISOString(),
                portfolio_id: portfolio.portfolio_id
            };

            // 1. Per-slot metrics
            results.forEach(res => {
                const slotMetrics = this.calculatePerSlotMetrics(res, eq);
                metrics.slots.push(slotMetrics);
            });

            // 2. Portfolio diagnostics
            metrics.portfolio = this.calculatePortfolioDiagnostics(metrics.slots, eq);

            // 3. Correlation Matrix
            if (metrics.slots.length >= 2) {
                metrics.portfolio.correlation = this.computeCorrelationMatrix(results);
                metrics.portfolio.dd_overlap = this.computeDrawdownOverlap(results);
            }

            // 4. Problem Detector
            metrics.portfolio.bullets = this.generateProblemBullets(metrics);

            return metrics;
        },

        calculatePerSlotMetrics(res, eq) {
            const curve = res.equityCurve || [];
            const startingCapital = eq.startingCapital || 100000;

            // Contribution Return % (weighted PnL / portfolio start)
            const contribReturnPct = startingCapital > 0 ? res.pnl / startingCapital : 0;

            // DD computation for slot
            let peak = res.allocatedCapital || 0;
            let maxDD = 0;
            let currentDD = 0;
            let timeInDDCount = 0;
            let lastPeakIndex = 0;

            const ddCurve = curve.map((p, i) => {
                if (p.value > peak) {
                    peak = p.value;
                    lastPeakIndex = i;
                }
                const dd = peak > 0 ? (peak - p.value) / peak : 0;
                if (dd > maxDD) maxDD = dd;
                if (dd > 0.001) timeInDDCount++;
                if (i === curve.length - 1) currentDD = dd;
                return dd;
            });

            // Rolling momentum (last 30 bars)
            const n = 30;
            const lastNBarsReturn = curve.length >= n
                ? (curve[curve.length - 1].value / curve[curve.length - n].value) - 1
                : (curve.length > 1 ? (curve[curve.length - 1].value / curve[0].value) - 1 : 0);

            // Contribution to MaxDD (approx: avg slot DD during portfolio DD windows)
            // For now, simpler: % of total slot DD vs sum of all slot DDs
            // (v2 could weight it by temporal overlap with portfolio DD)

            const status = this.deriveStatus(currentDD, curve.length - 1 - lastPeakIndex, lastNBarsReturn);

            return {
                slot_id: res.slot.slot_id,
                label: res.slot.label,
                weight: res.slot.target_weight,
                pnl: res.pnl,
                contribReturnPct: contribReturnPct,
                maxDD: maxDD,
                currentDD: currentDD,
                timeInDD: curve.length > 0 ? timeInDDCount / curve.length : 0,
                lastPeakAge: curve.length - 1 - lastPeakIndex,
                rollingReturn: lastNBarsReturn,
                status: status
            };
        },

        deriveStatus(currentDD, peakAge, momentum) {
            const DD_THRESHOLD = 0.15; // 15%
            const AGE_THRESHOLD = 100; // 100 bars

            if (currentDD > DD_THRESHOLD || peakAge > AGE_THRESHOLD) return 'CRITICAL';
            if (momentum < 0 && currentDD > 0.05) return 'DRAGGING';
            return 'HEALTHY';
        },

        calculatePortfolioDiagnostics(slots, eq) {
            if (slots.length === 0) return {};

            const best = [...slots].sort((a, b) => b.contribReturnPct - a.contribReturnPct)[0];
            const worst = [...slots].sort((a, b) => a.contribReturnPct - b.contribReturnPct)[0];
            const mostUnderwater = [...slots].sort((a, b) => b.currentDD - a.currentDD)[0];

            // Stability: simple rank (higher return, lower maxDD)
            const mostStable = [...slots].sort((a, b) => {
                const scoreA = (a.contribReturnPct || 0) - (a.maxDD || 0);
                const scoreB = (b.contribReturnPct || 0) - (b.maxDD || 0);
                return scoreB - scoreA;
            })[0];

            return {
                top_contributor: best,
                worst_drag: worst,
                most_underwater: mostUnderwater,
                most_stable: mostStable,
                risk_concentration: worst ? (worst.maxDD > 0 ? worst.maxDD / slots.reduce((s, x) => s + x.maxDD, 0) : 0) : 0
            };
        },

        computeCorrelationMatrix(results) {
            // Cap at 10 strategies
            const data = results.slice(0, 10).map(r => {
                const curve = r.equityCurve || [];
                // Compute returns series
                const returns = [];
                for (let i = 1; i < curve.length; i++) {
                    returns.push((curve[i].value / curve[i - 1].value) - 1);
                }
                return { label: r.slot.label, returns };
            });

            const matrix = [];
            const labels = data.map(d => d.label);

            for (let i = 0; i < data.length; i++) {
                const row = [];
                for (let j = 0; j < data.length; j++) {
                    if (i === j) row.push(1.0);
                    else row.push(this.pearsonCorrelation(data[i].returns, data[j].returns));
                }
                matrix.push(row);
            }

            // Average correlation (off-diagonal)
            let sum = 0, count = 0;
            for (let i = 0; i < matrix.length; i++) {
                for (let j = i + 1; j < matrix.length; j++) {
                    sum += matrix[i][j];
                    count++;
                }
            }

            return { labels, matrix, avg: count > 0 ? sum / count : 0 };
        },

        pearsonCorrelation(x, y) {
            const n = Math.min(x.length, y.length);
            if (n < 2) return 0;

            let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
            for (let i = 0; i < n; i++) {
                sumX += x[i];
                sumY += y[i];
                sumXY += x[i] * y[i];
                sumX2 += x[i] * x[i];
                sumY2 += y[i] * y[i];
            }

            const num = (n * sumXY) - (sumX * sumY);
            const den = Math.sqrt(((n * sumX2) - (sumX * sumX)) * ((n * sumY2) - (sumY * sumY)));

            if (den === 0) return 0;
            return num / den;
        },

        computeDrawdownOverlap(results) {
            if (results.length < 2) return null;
            const data = results.slice(0, 10).map(r => {
                const curve = r.equityCurve || [];
                let peak = r.allocatedCapital || 0;
                return curve.map(p => {
                    if (p.value > peak) peak = p.value;
                    return peak > 0 && (peak - p.value) / peak > 0.01; // 1% DD threshold
                });
            });

            const matrix = [];
            const labels = results.slice(0, 10).map(r => r.slot.label);

            for (let i = 0; i < data.length; i++) {
                const row = [];
                for (let j = 0; j < data.length; j++) {
                    if (i === j) row.push(1.0);
                    else {
                        const len = Math.min(data[i].length, data[j].length);
                        if (len === 0) { row.push(0); continue; }
                        let bothInDD = 0;
                        for (let k = 0; k < len; k++) {
                            if (data[i][k] && data[j][k]) bothInDD++;
                        }
                        row.push(bothInDD / len);
                    }
                }
                matrix.push(row);
            }

            return { labels, matrix };
        },

        generateProblemBullets(metrics) {
            const bullets = [];
            const p = metrics.portfolio;

            // 1. DD Concentration
            if (p.risk_concentration > 0.6) {
                bullets.push(`Drawdown is concentrated: ${p.worst_drag.label} explains ${(p.risk_concentration * 100).toFixed(0)}% of DD.`);
            }

            // 2. High Correlation
            if (p.correlation && p.correlation.avg > 0.5) {
                bullets.push(`High correlation detected (avg ${p.correlation.avg.toFixed(2)}) → diversification is weak.`);
            }

            // 3. Persistent Underperformer
            metrics.slots.forEach(s => {
                if (s.timeInDD > 0.8) {
                    bullets.push(`${s.label} is underwater for ${(s.timeInDD * 100).toFixed(0)}% of bars; consider disabling.`);
                }
            });

            // 4. Critical status
            const criticals = metrics.slots.filter(s => s.status === 'CRITICAL');
            if (criticals.length > 0) {
                bullets.push(`${criticals.length} strategies are in CRITICAL state due to deep drawdown or stagnation.`);
            }

            // Fallback
            if (bullets.length === 0) {
                bullets.push("Portfolio risk distribution appears healthy and diversified.");
            }

            return bullets.slice(0, 5);
        },

        exportDiagnostics(metrics) {
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(metrics, null, 2));
            const downloadAnchorNode = document.createElement('a');
            downloadAnchorNode.setAttribute("href", dataStr);
            downloadAnchorNode.setAttribute("download", `prosperpath_diagnostics_${metrics.portfolio_id}_${Date.now()}.json`);
            document.body.appendChild(downloadAnchorNode);
            downloadAnchorNode.click();
            downloadAnchorNode.remove();
        }
    };

    window.PortfolioAttribution = PortfolioAttribution;
})();
