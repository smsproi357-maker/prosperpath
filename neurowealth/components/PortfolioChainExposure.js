window.PortfolioChainExposure = {
    render: function(containerId, data) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const { chainTotals, totalPortfolioValueUsd } = data;
        
        if (!chainTotals || Object.keys(chainTotals).length === 0 || totalPortfolioValueUsd === 0) {
            container.innerHTML = '';
            return;
        }

        // Sort chains by value
        const sortedChains = Object.entries(chainTotals)
            .map(([chain, val]) => ({ chain, val }))
            .sort((a, b) => b.val - a.val);

        const PALETTE = [
            '#D4AF37', // Gold for largest
            '#a855f7', '#22c55e', '#3b82f6',
            '#f97316', '#ef4444', '#06b6d4', '#84cc16'
        ];

        let rowsHtml = '';
        sortedChains.forEach((c, index) => {
             const pct = ((c.val / totalPortfolioValueUsd) * 100).toFixed(1);
             const chainName = c.chain === 'eth' ? 'Ethereum' :
                               c.chain === 'bsc' ? 'BNB Chain' :
                               c.chain === 'matic' ? 'Polygon' :
                               c.chain === 'optimism' ? 'Optimism' :
                               c.chain === 'arbitrum' ? 'Arbitrum' :
                               c.chain.charAt(0).toUpperCase() + c.chain.slice(1);
             const color = PALETTE[index % PALETTE.length];

             rowsHtml += `
                 <div style="margin-bottom: 12px; font-size: 0.95rem;">
                     <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                         <span style="color: #64748b;">${chainName}</span>
                         <span style="color: #fff; font-weight: 700;">${pct}%</span>
                     </div>
                     <div style="width: 100%; height: 6px; background: rgba(255,255,255,0.05); border-radius: 4px; overflow: hidden;">
                         <div style="width: ${pct}%; height: 100%; background: ${color}; border-radius: 4px;"></div>
                     </div>
                 </div>
             `;
        });

        container.innerHTML = `
            <div class="card" style="padding: var(--space-6); margin-top: var(--space-4);">
                <h3 style="margin-bottom: var(--space-4); font-size: 1.25rem; font-weight: 700; color: #fff;">Chain Exposure</h3>
                ${rowsHtml}
            </div>
        `;
    }
};
