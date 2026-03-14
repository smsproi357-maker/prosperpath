window.PortfolioDistributionChart = {
    render: function(canvasId, holdingsFlat, totalPortfolioValueUsd) {
        const chartCanvas = document.getElementById(canvasId);
        if (!chartCanvas) return;

        // Ensure Chart.js is available
        if (typeof Chart === 'undefined') return;

        // Calculate distribution by asset
        let assetMap = {};
        holdingsFlat.forEach(h => {
             const val = h.valueUsd ?? (h.quantity * (h.institution_price || h.priceUsd || h.usdValue || 0)) ?? 0;
             if (val > 0) {
                 const symbol = h.symbol || h.security?.ticker_symbol || 'Unknown';
                 assetMap[symbol] = (assetMap[symbol] || 0) + val;
             }
        });

        const threshold = totalPortfolioValueUsd * 0.03;
        let otherValue = 0;
        let sortedData = [];

        Object.entries(assetMap).forEach(([symbol, val]) => {
            if (val < threshold) {
                otherValue += val;
            } else {
                sortedData.push({ symbol, val });
            }
        });

        // Sort largest first
        sortedData.sort((a, b) => b.val - a.val);

        // Keep Top 5, move rest to Other
        const top5 = sortedData.slice(0, 5);
        const remaining = sortedData.slice(5);
        remaining.forEach(item => {
             otherValue += item.val;
        });

        let finalData = [...top5];
        if (otherValue > 0) {
            finalData.push({ symbol: 'Other', val: otherValue });
        }

        const labels = finalData.map(d => d.symbol);
        const values = finalData.map(d => d.val);

        const PALETTE = [
            '#D4AF37', // ProsperPath gold
            '#a855f7', '#22c55e', '#3b82f6',
            '#f97316', '#ef4444', '#06b6d4', '#84cc16', '#64748b'
        ];
        
        const colorsUsed = PALETTE.slice(0, Math.max(labels.length, PALETTE.length));

        if (window._walletPieChart) {
            try { window._walletPieChart.destroy(); } catch (_) {}
            window._walletPieChart = null;
        }

        window._walletPieChart = new Chart(chartCanvas, {
            type: 'doughnut',
            data: {
                labels,
                datasets: [{
                    data: values,
                    backgroundColor: colorsUsed,
                    borderColor: 'rgba(0,0,0,0.2)',
                    borderWidth: 2,
                    hoverOffset: 6,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: {
                    animateScale: true,
                    animateRotate: true,
                    duration: 1200,
                    easing: 'easeOutQuart'
                },
                cutout: '70%',
                plugins: {
                    legend: {
                        display: false, // Disable default legend
                    },
                    tooltip: {
                        callbacks: {
                            label(ctx) {
                                const val = ctx.parsed;
                                const pct = totalPortfolioValueUsd > 0
                                    ? ((val / totalPortfolioValueUsd) * 100).toFixed(1)
                                    : '0';
                                return ` $${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${pct}%)`;
                            },
                        },
                    },
                },
            },
        });

        // Generate Custom 2-Column HTML Legend
        let legendContainer = document.getElementById(canvasId + '-legend');
        if (!legendContainer) {
             legendContainer = document.createElement('div');
             legendContainer.id = canvasId + '-legend';
             legendContainer.style.marginTop = '24px';
             legendContainer.style.display = 'grid';
             legendContainer.style.gridTemplateColumns = '1fr 1fr';
             legendContainer.style.gap = '12px 24px';
             chartCanvas.parentNode.parentNode.appendChild(legendContainer);
        }

        let legendHtml = '';
        finalData.forEach((item, i) => {
             const color = colorsUsed[i % colorsUsed.length];
             const pct = totalPortfolioValueUsd > 0 ? Math.round((item.val / totalPortfolioValueUsd) * 100) : 0;
             legendHtml += `
                 <div style="display:flex; justify-content:space-between; align-items:center;">
                     <div style="display:flex; align-items:center; gap:8px;">
                         <div style="width:12px; height:12px; border-radius:3px; background:${color};"></div>
                         <span style="color:#e2e8f0; font-size:0.85rem; font-weight:600;">${item.symbol}</span>
                     </div>
                     <span style="color:#D4AF37; font-size:0.85rem; font-weight:700;">${pct}%</span>
                 </div>
             `;
        });
        legendContainer.innerHTML = legendHtml;
        
        // Make the chart container larger as requested
        chartCanvas.parentNode.style.maxWidth = '360px'; 
    }
};
