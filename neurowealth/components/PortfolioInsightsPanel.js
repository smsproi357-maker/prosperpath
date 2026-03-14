window.PortfolioInsightsPanel = {
    render: function(containerId, data) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const {
            allHoldingsFlat,
            totalPortfolioValueUsd,
            activeChains,
            unpricedHoldingsCount
        } = data;

        // Calculate largest holding
        let largestHolding = null;
        let maxVal = 0;
        
        allHoldingsFlat.forEach(h => {
             const val = h.valueUsd ?? (h.quantity * (h.institution_price || h.priceUsd || h.usdValue || 0)) ?? 0;
             if (val > maxVal) {
                 maxVal = val;
                 largestHolding = h;
             }
        });

        let largestHoldingStr = "None";
        if (largestHolding && totalPortfolioValueUsd > 0) {
            const sym = largestHolding.symbol || largestHolding.security?.ticker_symbol || 'Unknown';
            const pct = ((maxVal / totalPortfolioValueUsd) * 100).toFixed(1);
            largestHoldingStr = `${sym} (${pct}% of portfolio)`;
        }

        // Liquidity risk checking
        let liquidityRisk = false;
        allHoldingsFlat.forEach(h => {
            if (h.pricingSource === 'dexscreener_fallback' || h.isFallbackPriced) {
                liquidityRisk = true;
            }
        });

        const rowStyle = "margin-bottom: 16px;";
        const labelStyle = "font-size: 0.85rem; color: #94a3b8; margin-bottom: 4px;";
        const valueStyle = "font-size: 1.05rem; font-weight: 600; color: #fff;";

        let html = `
            <h3 style="margin-bottom: var(--space-4); font-size: 1.25rem; font-weight: 700; color: #fff;">Portfolio Insights</h3>
            
            <div style="${rowStyle}">
                <div style="${labelStyle}">Largest Holding</div>
                <div style="${valueStyle}">${largestHoldingStr}</div>
            </div>
            
            <div style="${rowStyle}">
                <div style="${labelStyle}">Chain Exposure</div>
                <div style="${valueStyle}">${activeChains || 1} chain${(activeChains || 1) > 1 ? 's' : ''}</div>
            </div>
        `;

        // Unpriced Assets
        if (unpricedHoldingsCount > 0) {
            html += `
            <div style="${rowStyle}">
                <div style="${labelStyle}">Unpriced Assets</div>
                <div style="${valueStyle}; color: #fbbf24;">${unpricedHoldingsCount} token${unpricedHoldingsCount > 1 ? 's lack' : ' lacks'} reliable price data</div>
            </div>
            `;
        } else {
            html += `
            <div style="${rowStyle}">
                <div style="${labelStyle}">Unpriced Assets</div>
                <div style="${valueStyle}; color: #a3e635;">All assets priced</div>
            </div>
            `;
        }

        // Liquidity Quality
        if (liquidityRisk) {
             html += `
             <div style="${rowStyle}">
                 <div style="${labelStyle}">Liquidity Quality</div>
                 <div style="${valueStyle}; color: #fbbf24;">Risk detected in low-cap assets</div>
             </div>
             `;
        } else {
             html += `
             <div style="${rowStyle}">
                 <div style="${labelStyle}">Liquidity Quality</div>
                 <div style="${valueStyle}; color: #a3e635;">Good across priced assets</div>
             </div>
             `;
        }

        container.innerHTML = html;
    }
};
