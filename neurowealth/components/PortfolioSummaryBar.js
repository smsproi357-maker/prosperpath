window.PortfolioSummaryBar = {
    render: function (containerId, result) {
        const container = document.getElementById(containerId);
        if (!container) {
            console.warn('[PortfolioSummaryBar] Container ' + containerId + ' not found.');
            return;
        }

        // Extract required data
        const totalValue = result.totalPortfolioValueUsd || 0;
        const allHoldings = result.allHoldingsFlat || [];
        const chainsCount = result.activeChains || 1;
        
        let pricedCount = result.pricedHoldingsCount;
        if (pricedCount === undefined) {
            pricedCount = allHoldings.filter(h => h.isPriced).length;
        }

        const assetsCount = allHoldings.length;
        const coveragePct = assetsCount > 0 ? Math.round((pricedCount / assetsCount) * 100) : 0;

        let largestPosition = null;
        let largestValue = -1;

        allHoldings.forEach(h => {
            const val = h.valueUsd ?? (h.quantity * (h.priceUsd || h.institution_price || h.usdValue || 0)) ?? 0;
            if (val > largestValue) {
                largestValue = val;
                largestPosition = h;
            }
        });

        let largestPositionDisplay = 'N/A';
        if (largestPosition && totalValue > 0) {
            const symbol = largestPosition.symbol || largestPosition.security?.ticker_symbol || 'Unknown';
            const pct = ((largestValue / totalValue) * 100).toFixed(0);
            largestPositionDisplay = `${symbol} <span style="font-size:0.8rem; color:var(--color-text-secondary);">${pct}%</span>`;
        } else if (largestPosition && totalValue === 0) {
            const symbol = largestPosition.symbol || largestPosition.security?.ticker_symbol || 'Unknown';
            largestPositionDisplay = symbol;
        }

        const formattedTotalValue = '$' + totalValue.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });

        // 24H change is not implemented yet in the backend, static display
        const changeIndicator = '<span style="color:var(--color-text-secondary); font-size:0.85rem; font-style:italic;">Coming Soon</span>';

        container.innerHTML = `
            <div class="portfolio-summary-bar">
                <div class="summary-card">
                    <div class="summary-value hl-gold">${formattedTotalValue}</div>
                    <div class="summary-label">Total Value</div>
                </div>
                <div class="summary-card">
                    <div class="summary-value">${changeIndicator}</div>
                    <div class="summary-label">24h Change</div>
                </div>
                <div class="summary-card">
                    <div class="summary-value hl-white">${assetsCount} <span style="font-size: 0.8rem; font-weight: 500; color:var(--color-text-secondary);">Assets</span></div>
                    <div class="summary-label">Holdings</div>
                </div>
                <div class="summary-card">
                    <div class="summary-value hl-white">${chainsCount} <span style="font-size: 0.8rem; font-weight: 500; color:var(--color-text-secondary);">Chain${chainsCount !== 1 ? 's' : ''}</span></div>
                    <div class="summary-label">Networks</div>
                </div>
                <div class="summary-card">
                    <div class="summary-value hl-white">${pricedCount} <span style="font-size: 0.8rem; font-weight: 500; color:var(--color-text-secondary);">/ ${assetsCount} Priced</span></div>
                    <div class="summary-label">Coverage (${coveragePct}%)</div>
                </div>
                <div class="summary-card">
                    <div class="summary-value hl-white">${largestPositionDisplay}</div>
                    <div class="summary-label">Largest Position</div>
                </div>
            </div>
        `;
        container.classList.remove('hidden');
    }
};
