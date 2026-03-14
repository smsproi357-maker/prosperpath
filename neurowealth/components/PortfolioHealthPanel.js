window.PortfolioHealthPanel = {
    render: function(containerId, data) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const {
            allHoldingsFlat,
            totalPortfolioValueUsd,
            activeChains,
            unpricedHoldingsCount
        } = data;

        let largestHoldingVal = 0;
        let fallbackPricedCount = 0;

        allHoldingsFlat.forEach(h => {
             const val = h.valueUsd ?? (h.quantity * (h.institution_price || h.priceUsd || h.usdValue || 0)) ?? 0;
             if (val > largestHoldingVal) {
                 largestHoldingVal = val;
             }
             if (h.pricingSource === 'dexscreener_fallback' || h.isFallbackPriced) {
                 fallbackPricedCount++;
             }
        });

        let divScore = "High";
        // Default to gold for positive/neutral states as requested
        let divColor = "#D4AF37"; 
        if (totalPortfolioValueUsd > 0) {
             const pct = largestHoldingVal / totalPortfolioValueUsd;
             if (pct > 0.5) {
                 divScore = "Low";
                 divColor = "#ef4444";
             } else if (pct >= 0.3) {
                 divScore = "Medium";
                 divColor = "#fbbf24";
             }
        }

        let liqScore = "High";
        let liqColor = "#D4AF37";
        if (fallbackPricedCount > 0) {
             if (fallbackPricedCount > 3) {
                 liqScore = "Low";
                 liqColor = "#ef4444";
             } else {
                 liqScore = "Medium";
                 liqColor = "#fbbf24";
             }
        }

        const rowStyle = "display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; font-size: 0.95rem;";
        const labelStyle = "color: #94a3b8;";
        const valueStyle = "color: #fff; font-weight: 700; font-size: 1.05rem;";

        container.innerHTML = `
            <h3 style="margin-bottom: var(--space-4); font-size: 1.25rem; font-weight: 700; color: #fff;">Portfolio Health</h3>
            
            <div style="${rowStyle}">
                <span style="${labelStyle}">Assets</span>
                <span style="${valueStyle}">${allHoldingsFlat.length}</span>
            </div>
            <div style="${rowStyle}">
                <span style="${labelStyle}">Chains</span>
                <span style="${valueStyle}">${activeChains || 1}</span>
            </div>
            <div style="${rowStyle} margin-bottom: 24px;">
                <span style="${labelStyle}">Unpriced Tokens</span>
                <span style="${valueStyle}">${unpricedHoldingsCount || 0}</span>
            </div>

            <div style="${rowStyle} padding-top: 16px; border-top: 1px solid rgba(255,255,255,0.05);">
                <span style="${labelStyle}">Diversification Score</span>
                <span style="padding: 4px 10px; border-radius: 6px; background: ${divColor}15; border: 1px solid ${divColor}40; color: ${divColor}; font-size: 0.8rem; font-weight: 700; letter-spacing: 0.5px;">${divScore}</span>
            </div>
            <div style="${rowStyle} margin-bottom: 0;">
                <span style="${labelStyle}">Liquidity Quality</span>
                <span style="padding: 4px 10px; border-radius: 6px; background: ${liqColor}15; border: 1px solid ${liqColor}40; color: ${liqColor}; font-size: 0.8rem; font-weight: 700; letter-spacing: 0.5px;">${liqScore}</span>
            </div>
        `;
    }
};
