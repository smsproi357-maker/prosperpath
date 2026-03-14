window.PortfolioPerformanceChart = {
    chartInstance: null,
    historyKey: 'prosperpath_portfolio_history',
    
    render: function(containerId, currentTotalValueUsd) {
        const container = document.getElementById(containerId);
        if (!container) {
            console.warn('[PortfolioPerformanceChart] Container ' + containerId + ' not found.');
            return;
        }

        // Only record history if we have a valid value
        if (currentTotalValueUsd !== undefined && currentTotalValueUsd !== null && currentTotalValueUsd > 0) {
            this.recordValue(currentTotalValueUsd);
        }

        const history = this.getHistory();
        
        // Build UI
        container.innerHTML = `
            <div class="premium-card performance-chart-card" style="max-width: 100%; padding: var(--space-8);">
                <div class="performance-header">
                    <div>
                        <h3 style="text-align: left; margin-bottom: var(--space-2); color: #fff;">Portfolio Performance</h3>
                        <div class="performance-value-display" style="text-align: left;">
                            <span class="current-value" style="font-size: 2rem; font-weight: 700; color: var(--accent-gold);">
                                $${(currentTotalValueUsd || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                            <span class="performance-change" id="performance-change-indicator" style="margin-left: var(--space-4); font-size: 1rem; font-weight: 600;"></span>
                        </div>
                    </div>
                    <div class="time-range-controls">
                        <button class="range-btn" data-range="1D">1D</button>
                        <button class="range-btn" data-range="7D">7D</button>
                        <button class="range-btn" data-range="1M">1M</button>
                        <button class="range-btn" data-range="3M">3M</button>
                        <button class="range-btn" data-range="1Y">1Y</button>
                        <button class="range-btn active" data-range="ALL">ALL</button>
                    </div>
                </div>
                
                <div class="chart-container" style="position: relative; height: 300px; width: 100%; margin-top: var(--space-6);">
                    ${history.length < 2 
                        ? '<div class="fallback-state" style="position: absolute; top:0; left:0; width:100%; height:100%; display:flex; align-items:center; justify-content:center; color: var(--color-text-secondary); font-style: italic; background: rgba(255,255,255,0.02); border-radius: var(--radius-md); border: 1px dashed rgba(255,255,255,0.1);">Performance tracking starting. More data will appear as your portfolio history builds.</div>' 
                        : '<canvas id="portfolio-performance-canvas"></canvas>'}
                </div>
            </div>
        `;

        container.classList.remove('hidden');

        if (history.length >= 2) {
            this.initChart(history, 'ALL', currentTotalValueUsd);
            this.attachEventListeners(history, currentTotalValueUsd);
        }
    },

    recordValue: function(value) {
        let history = this.getHistory();
        const now = Date.now();
        
        // Prevent recording too many points exactly at the same time (e.g. multiple renders)
        if (history.length > 0) {
            const lastEntry = history[history.length - 1];
            // If last record was less than 5 minutes ago, just update it
            if (now - lastEntry.timestamp < 5 * 60 * 1000) {
                lastEntry.value = value;
                lastEntry.timestamp = now;
                localStorage.setItem(this.historyKey, JSON.stringify(history));
                return;
            }
        }
        
        history.push({ timestamp: now, value: value });
        localStorage.setItem(this.historyKey, JSON.stringify(history));
    },

    getHistory: function() {
        try {
            const data = localStorage.getItem(this.historyKey);
            return data ? JSON.parse(data) : [];
        } catch(e) {
            console.error('Error parsing portfolio history from localStorage', e);
            return [];
        }
    },

    filterHistory: function(history, range) {
        const now = Date.now();
        let cutoff = 0;
        
        switch(range) {
            case '1D': cutoff = now - (24 * 60 * 60 * 1000); break;
            case '7D': cutoff = now - (7 * 24 * 60 * 60 * 1000); break;
            case '1M': cutoff = now - (30 * 24 * 60 * 60 * 1000); break;
            case '3M': cutoff = now - (90 * 24 * 60 * 60 * 1000); break;
            case '1Y': cutoff = now - (365 * 24 * 60 * 60 * 1000); break;
            case 'ALL': default: return history;
        }
        
        return history.filter(item => item.timestamp >= cutoff);
    },

    updateChangeIndicator: function(filteredData, currentValue) {
        const changeIndicator = document.getElementById('performance-change-indicator');
        if (!changeIndicator) return;

        if (filteredData.length < 2) {
            changeIndicator.textContent = '';
            return;
        }

        const firstValue = filteredData[0].value;
        const diff = currentValue - firstValue;
        const pct = (diff / firstValue) * 100;
        
        if (diff >= 0) {
            changeIndicator.innerHTML = `<span style="color: #4ade80;">+$${diff.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})} (+${pct.toFixed(2)}%)</span>`;
        } else {
            changeIndicator.innerHTML = `<span style="color: #f87171;">-$${Math.abs(diff).toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})} (${pct.toFixed(2)}%)</span>`;
        }
    },

    attachEventListeners: function(history, currentValue) {
        const buttons = document.querySelectorAll('.range-btn');
        const self = this;
        
        buttons.forEach(btn => {
            btn.addEventListener('click', function() {
                buttons.forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                const range = this.getAttribute('data-range');
                self.initChart(history, range, currentValue);
            });
        });
    },

    initChart: function(history, range, currentValue) {
        const filteredData = this.filterHistory(history, range);
        this.updateChangeIndicator(filteredData, currentValue);

        // If not enough data in the specific range but we have a canvas, clear it.
        const canvas = document.getElementById('portfolio-performance-canvas');
        if (!canvas) return;

        if (filteredData.length < 2) {
            // Show a temporary message in the canvas area if filtered is too small
            // We just let the chart render with 1 point which usually just shows a dot.
        }

        const labels = filteredData.map(d => {
            const date = new Date(d.timestamp);
            if (range === '1D') {
                return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            }
            return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
        });
        
        const values = filteredData.map(d => d.value);

        const ctx = canvas.getContext('2d');

        // Create gradient fill
        const gradient = ctx.createLinearGradient(0, 0, 0, 300);
        gradient.addColorStop(0, 'rgba(212, 175, 55, 0.2)');
        gradient.addColorStop(1, 'rgba(212, 175, 55, 0)');

        if (this.chartInstance) {
            this.chartInstance.destroy();
        }

        this.chartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Portfolio Value',
                    data: values,
                    borderColor: '#D4AF37',
                    backgroundColor: gradient,
                    borderWidth: 2,
                    pointRadius: 0,
                    pointHoverRadius: 6,
                    pointBackgroundColor: '#fff',
                    pointBorderColor: '#D4AF37',
                    pointBorderWidth: 2,
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        backgroundColor: 'rgba(15, 23, 42, 0.9)',
                        titleColor: '#94a3b8',
                        bodyColor: '#fff',
                        borderColor: 'rgba(255,255,255,0.1)',
                        borderWidth: 1,
                        padding: 10,
                        displayColors: false,
                        callbacks: {
                            label: function(context) {
                                return '$' + context.parsed.y.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: {
                            display: false,
                            drawBorder: false
                        },
                        ticks: {
                            color: '#64748b',
                            maxTicksLimit: Math.min(8, labels.length)
                        }
                    },
                    y: {
                        grid: {
                            color: 'rgba(255, 255, 255, 0.05)',
                            drawBorder: false
                        },
                        ticks: {
                            color: '#64748b',
                            callback: function(value) {
                                if (value >= 1000) {
                                    return '$' + (value / 1000).toFixed(1) + 'k';
                                }
                                return '$' + value;
                            }
                        }
                    }
                }
            }
        });
    }
};
