/**
 * portfolio-aggregator.js
 *
 * Pure function: compute aggregate metrics across all connected portfolios.
 * Output shape is fixed and extensible — all 14 fields always present.
 *
 * Exposed as: window.PortfolioAggregator
 */
'use strict';

(function () {
    const EMPTY = {
        totalPortfolioValueUsd: 0,
        totalPnlValue: 0,
        totalPnlPercent: 0,
        connectedPortfoliosCount: 0,
        totalAssetsCount: 0,
        totalChainsCount: 0,
        pricedAssetsCount: 0,
        unpricedAssetsCount: 0,
        pricingCoveragePercent: 0,
        largestPortfolio: null,
        largestHoldingOverall: null,
        combinedAllocation: {},
        combinedChainExposure: {},
        combinedMarketExposure: {},
        combinedSourceExposure: {},
    };

    function compute(portfolios) {
        if (!Array.isArray(portfolios) || portfolios.length === 0) {
            return { ...EMPTY };
        }

        let totalPortfolioValueUsd = 0;
        let totalPnlValue = 0;
        let totalAssetsCount = 0;
        let pricedAssetsCount = 0;
        let unpricedAssetsCount = 0;
        const chainSet = new Set();
        const combinedAllocation = {};
        const combinedChainExposure = {};
        const combinedMarketExposure = {};
        const combinedSourceExposure = {};
        let largestPortfolio = null;
        let largestHoldingOverall = null;
        let largestHoldingValue = 0;

        portfolios.forEach(pf => {
            const pfValue = pf.totalValueUsd || 0;
            totalPortfolioValueUsd += pfValue;
            totalPnlValue += pf.pnlValue || 0;
            totalAssetsCount += pf.totalAssetsCount || 0;
            pricedAssetsCount += pf.pricedAssetsCount || 0;
            unpricedAssetsCount += pf.unpricedAssetsCount || 0;

            if (!largestPortfolio || pfValue > (largestPortfolio.totalValueUsd || 0)) {
                largestPortfolio = pf;
            }

            // Source exposure
            const src = pf.sourceType || 'unknown';
            combinedSourceExposure[src] = (combinedSourceExposure[src] || 0) + pfValue;

            // Holdings-level aggregation
            const holdings = pf.holdings || [];
            holdings.forEach(h => {
                const symbol = h.symbol || h.security?.ticker_symbol || 'Unknown';
                const valueUsd = h.valueUsd != null ? h.valueUsd
                    : (+(h.formattedBalance ?? h.quantity ?? 0)) * (h.priceUsd || h.institution_price || 0);
                const chain = h.chainName || h.chain || null;
                const assetClass = h.security?.type || null;

                if (valueUsd > 0) {
                    combinedAllocation[symbol] = (combinedAllocation[symbol] || 0) + valueUsd;
                }
                if (chain && valueUsd > 0) {
                    combinedChainExposure[chain] = (combinedChainExposure[chain] || 0) + valueUsd;
                    chainSet.add(chain);
                }
                if (assetClass && valueUsd > 0) {
                    combinedMarketExposure[assetClass] = (combinedMarketExposure[assetClass] || 0) + valueUsd;
                }
                if (valueUsd > largestHoldingValue) {
                    largestHoldingValue = valueUsd;
                    largestHoldingOverall = { ...h, valueUsd };
                }
            });

            // Fallback: count chains from portfolio metadata if no holdings had chain info
            if (chainSet.size === 0 && pf.totalChainsCount > 0) {
                for (let i = 0; i < pf.totalChainsCount; i++) chainSet.add(`${pf.id}#${i}`);
            }
        });

        const costBasis = totalPortfolioValueUsd - totalPnlValue;
        const totalPnlPercent = costBasis > 0 ? (totalPnlValue / costBasis) * 100 : 0;
        const pricingCoveragePercent = totalAssetsCount > 0
            ? Math.round((pricedAssetsCount / totalAssetsCount) * 100)
            : 0;

        return {
            totalPortfolioValueUsd,
            totalPnlValue,
            totalPnlPercent,
            connectedPortfoliosCount: portfolios.length,
            totalAssetsCount,
            totalChainsCount: chainSet.size,
            pricedAssetsCount,
            unpricedAssetsCount,
            pricingCoveragePercent,
            largestPortfolio,
            largestHoldingOverall,
            combinedAllocation,
            combinedChainExposure,
            combinedMarketExposure,
            combinedSourceExposure,
        };
    }

    window.PortfolioAggregator = { compute };
    console.info('[PortfolioAggregator] Loaded.');
})();
