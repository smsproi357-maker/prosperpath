/**
 * portfolio-analysis.js
 *
 * Deterministic portfolio metrics engine.
 * Accepts normalized holdings from window.portfolioData (wallet or Plaid source).
 * Returns a structured metrics object used as input to the AI report generator.
 *
 * STRICT RULES:
 * - Does NOT call any API.
 * - Does NOT modify window.portfolioData.
 * - Does NOT rely on AI for calculations.
 *
 * Exposed as: window.PortfolioAnalysis = { compute }
 */

'use strict';

(function () {

    // ─────────────────────────────────────────────────────────────────────────
    // Symbol classification maps
    // ─────────────────────────────────────────────────────────────────────────

    const BTC_SYMBOLS = new Set(['BTC', 'BTCB', 'WBTC', 'BTCBSC', 'HBTC', 'RENBTC', 'SBTC', 'TBTC', 'BBTC']);
    const ETH_SYMBOLS = new Set(['ETH', 'WETH', 'STETH', 'RETH', 'CBETH', 'FRXETH', 'OETH', 'ANKRETH', 'WEETH', 'SWETH', 'METH']);
    const STABLE_SYMBOLS = new Set(['USDT', 'USDC', 'DAI', 'BUSD', 'TUSD', 'FRAX', 'LUSD', 'USDD', 'GUSD', 'PYUSD', 'FDUSD', 'USDE', 'USDP', 'EURC', 'CRVUSD', 'SUSD', 'CUSD', 'AUSD', 'XUSD', 'ALUSD', 'DOLA', 'MKUSD', 'EURS', 'AGEUR', 'GRAI', 'RAI', 'USDB', 'USDX', 'USDV', 'VUSDC', 'VUSDT']);
    const RWA_SYMBOLS = new Set(['ONDO', 'PAXG', 'XAUT', 'DGX', 'CACHE', 'OUSG', 'STBT', 'BUIDL', 'TBT', 'USDY', 'USDM', 'WUSDR']);
    const LAYER1_ALT_SYMBOLS = new Set(['BNB', 'SOL', 'ADA', 'AVAX', 'DOT', 'MATIC', 'POL', 'ATOM', 'NEAR', 'FTM', 'ONE', 'ALGO', 'EGLD', 'XTZ', 'ICP', 'FLOW', 'APT', 'SUI', 'SEI', 'INJ', 'TIA', 'KAVA', 'CRO', 'XLM', 'VET', 'TRX', 'TON', 'HBAR', 'EOS', 'XRP', 'LTC', 'BCH', 'BSV', 'ZEC', 'DASH', 'DCR']);

    /**
     * Classify a holding's symbol into a market exposure category.
     * Returns one of: 'btc' | 'eth' | 'stablecoin' | 'rwa' | 'layer1Alt' | 'other'
     */
    function classifySymbol(symbol) {
        const sym = (symbol || '').toUpperCase().replace(/^W/, ''); // unwrap WBTC→BTC style
        const raw = (symbol || '').toUpperCase();

        if (BTC_SYMBOLS.has(raw)) return 'btc';
        if (ETH_SYMBOLS.has(raw)) return 'eth';
        if (STABLE_SYMBOLS.has(raw)) return 'stablecoin';
        if (RWA_SYMBOLS.has(raw)) return 'rwa';
        if (LAYER1_ALT_SYMBOLS.has(raw)) return 'layer1Alt';
        return 'other';
    }

    /**
     * Infer liquidity tier from pricing source metadata.
     * Returns one of: 'high' | 'medium' | 'low' | 'unknown'
     */
    function inferLiquidityTier(holding) {
        if (!holding.isPriced && !holding.priceUsd && !(holding.valueUsd > 0)) {
            return 'unknown';
        }
        const src = (holding.pricingSource || '').toLowerCase();
        if (src === 'plaid') return 'high';
        if (src === 'coingecko_onchain' || src === 'coingecko_simple') return 'high';
        if (src === 'dexscreener_fallback') {
            // If the fallback metadata has decent liquidity, treat as medium
            const liq = holding.pricingMeta?.liquidityUsd || 0;
            return liq >= 50000 ? 'medium' : 'low';
        }
        // Has a price but no explicit source tag — treat as medium
        if (holding.isPriced || holding.valueUsd > 0) return 'medium';
        return 'unknown';
    }

    /**
     * Normalize window.portfolioData into a flat holdings array.
     * Handles both wallet (allHoldingsFlat) and Plaid (holdings.holdings) shapes.
     */
    function normalizeHoldings(portfolioData) {
        if (!portfolioData) return [];

        // Wallet source — multichain flat array already available
        if (portfolioData.multichainData?.allHoldingsFlat) {
            return portfolioData.multichainData.allHoldingsFlat.map(h => ({
                ...h,
                // Normalize: ensure valueUsd is always set
                valueUsd: h.valueUsd ?? h.usdValue ?? 0,
            }));
        }

        // Wallet source — direct flat array (single-chain fallback shape)
        if (portfolioData.holdings?.holdings && Array.isArray(portfolioData.holdings.holdings)) {
            const holdings = portfolioData.holdings.holdings;
            // Check if it looks like a wallet shape (has `isPriced` or native wallet fields)
            if (holdings.length > 0 && (holdings[0].isPriced !== undefined || holdings[0].walletAddress !== undefined)) {
                return holdings.map(h => ({ ...h, valueUsd: h.valueUsd ?? h.usdValue ?? 0 }));
            }
            // Plaid shape — convert
            return holdings.map(h => ({
                symbol: h.security?.ticker_symbol || 'Unknown',
                name: h.security?.name || 'Unknown',
                valueUsd: (h.quantity || 0) * (h.institution_price || 0),
                priceUsd: h.institution_price || 0,
                quantity: h.quantity || 0,
                isPriced: (h.institution_price || 0) > 0,
                pricingSource: 'plaid',
                isNative: false,
                chain: 'Plaid',
            }));
        }

        return [];
    }

    /**
     * Extract chain exposure from wallet data (chainTotals) or infer from holdings.
     */
    function extractChainExposure(portfolioData, totalValueUsd) {
        const chainExposure = {};

        // Wallet multichain — use pre-computed chainTotals
        if (portfolioData?.multichainData?.chainTotals) {
            const totals = portfolioData.multichainData.chainTotals;
            for (const [chain, val] of Object.entries(totals)) {
                if (val > 0) {
                    chainExposure[chain] = {
                        valueUsd: val,
                        percent: totalValueUsd > 0 ? parseFloat(((val / totalValueUsd) * 100).toFixed(2)) : 0,
                    };
                }
            }
            return chainExposure;
        }

        // Plaid — single virtual chain
        if (totalValueUsd > 0) {
            chainExposure['Plaid (Brokerage)'] = {
                valueUsd: totalValueUsd,
                percent: 100,
            };
        }

        return chainExposure;
    }

    /**
     * Main compute function.
     * @param {object} portfolioData — window.portfolioData
     * @returns {object} metrics
     */
    function compute(portfolioData) {
        const allHoldings = normalizeHoldings(portfolioData);
        const pricedHoldings = allHoldings.filter(h => h.isPriced || (h.valueUsd || 0) > 0);
        const unpricedHoldings = allHoldings.filter(h => !h.isPriced && !(h.valueUsd > 0));
        const fallbackPriced = allHoldings.filter(h => h.pricingSource === 'dexscreener_fallback');

        // ── Core metrics ──────────────────────────────────────────────────────
        const totalPortfolioValueUsd = pricedHoldings.reduce((s, h) => s + (h.valueUsd || 0), 0);
        const totalAssets = allHoldings.length;
        const pricedAssetsCount = pricedHoldings.length;
        const unpricedAssetsCount = unpricedHoldings.length;
        const pricingCoveragePercent = totalAssets > 0
            ? parseFloat(((pricedAssetsCount / totalAssets) * 100).toFixed(1))
            : 0;

        // Source type detection
        const portfolioSource = portfolioData?.walletSource ? 'wallet' : 'plaid';
        const isMultichain = portfolioData?.walletSource?.isMultichain || false;

        // ── Chain metrics ─────────────────────────────────────────────────────
        const chainExposure = extractChainExposure(portfolioData, totalPortfolioValueUsd);
        const chains = Object.keys(chainExposure);
        const totalChains = chains.length || (portfolioSource === 'plaid' ? 1 : 0);

        let dominantChain = '';
        let dominantChainPercent = 0;
        for (const [chain, data] of Object.entries(chainExposure)) {
            if (data.percent > dominantChainPercent) {
                dominantChain = chain;
                dominantChainPercent = data.percent;
            }
        }

        // ── Sorting by value ──────────────────────────────────────────────────
        const holdingsByValue = [...pricedHoldings].sort((a, b) => (b.valueUsd || 0) - (a.valueUsd || 0));

        // ── Concentration metrics ─────────────────────────────────────────────
        let largestHolding = null;
        if (holdingsByValue.length > 0) {
            const h = holdingsByValue[0];
            const val = h.valueUsd || 0;
            largestHolding = {
                symbol: h.symbol || h.security?.ticker_symbol || 'Unknown',
                name: h.name || h.security?.name || 'Unknown',
                valueUsd: val,
                percent: totalPortfolioValueUsd > 0
                    ? parseFloat(((val / totalPortfolioValueUsd) * 100).toFixed(2))
                    : 0,
                pricingSource: h.pricingSource || 'unknown',
                chain: h.chain || '',
                isNative: h.isNative || false,
            };
        }

        function sumTopN(n) {
            if (totalPortfolioValueUsd <= 0) return 0;
            const top = holdingsByValue.slice(0, n);
            const sum = top.reduce((s, h) => s + (h.valueUsd || 0), 0);
            return parseFloat(((sum / totalPortfolioValueUsd) * 100).toFixed(2));
        }
        const top3ConcentrationPercent = sumTopN(3);
        const top5ConcentrationPercent = sumTopN(5);

        // ── Liquidity buckets ─────────────────────────────────────────────────
        let highLiquidityAssetsCount = 0;
        let mediumLiquidityAssetsCount = 0;
        let lowLiquidityAssetsCount = 0;
        let unknownLiquidityAssetsCount = 0;

        for (const h of allHoldings) {
            const tier = inferLiquidityTier(h);
            if (tier === 'high') highLiquidityAssetsCount++;
            else if (tier === 'medium') mediumLiquidityAssetsCount++;
            else if (tier === 'low') lowLiquidityAssetsCount++;
            else unknownLiquidityAssetsCount++;
        }

        // ── Market exposure classification ─────────────────────────────────────
        const exposureUsd = { btc: 0, eth: 0, stablecoin: 0, rwa: 0, layer1Alt: 0, other: 0 };

        for (const h of pricedHoldings) {
            const sym = h.symbol || h.security?.ticker_symbol || '';
            const cat = classifySymbol(sym);
            exposureUsd[cat] += (h.valueUsd || 0);
        }

        function pct(val) {
            if (totalPortfolioValueUsd <= 0) return 0;
            return parseFloat(((val / totalPortfolioValueUsd) * 100).toFixed(2));
        }

        const marketExposure = {
            btcExposurePercent: pct(exposureUsd.btc),
            ethExposurePercent: pct(exposureUsd.eth),
            stablecoinExposurePercent: pct(exposureUsd.stablecoin),
            rwaExposurePercent: pct(exposureUsd.rwa),
            layer1AltExposurePercent: pct(exposureUsd.layer1Alt),
            otherExposurePercent: pct(exposureUsd.other),
            btcExposureUsd: parseFloat(exposureUsd.btc.toFixed(2)),
            ethExposureUsd: parseFloat(exposureUsd.eth.toFixed(2)),
            stablecoinExposureUsd: parseFloat(exposureUsd.stablecoin.toFixed(2)),
            rwaExposureUsd: parseFloat(exposureUsd.rwa.toFixed(2)),
            layer1AltExposureUsd: parseFloat(exposureUsd.layer1Alt.toFixed(2)),
            otherExposureUsd: parseFloat(exposureUsd.other.toFixed(2)),
        };

        // ── Top holdings for report context ──────────────────────────────────
        const topHoldings = holdingsByValue.slice(0, 10).map(h => ({
            symbol: h.symbol || h.security?.ticker_symbol || 'Unknown',
            name: h.name || h.security?.name || 'Unknown',
            chain: h.chain || '',
            valueUsd: parseFloat((h.valueUsd || 0).toFixed(2)),
            pricingSource: h.pricingSource || 'unknown',
            percent: pct(h.valueUsd || 0),
            isNative: h.isNative || false,
        }));

        return {
            // Meta
            portfolioSource,
            isMultichain,
            generatedAt: new Date().toISOString(),
            walletAddress: portfolioData?.walletSource?.address || null,

            // Core
            totalPortfolioValueUsd: parseFloat(totalPortfolioValueUsd.toFixed(2)),
            totalAssets,
            totalChains,
            pricedAssetsCount,
            unpricedAssetsCount,
            pricingCoveragePercent,
            fallbackPricedCount: fallbackPriced.length,

            // Concentration
            largestHolding,
            top3ConcentrationPercent,
            top5ConcentrationPercent,

            // Chain
            chainExposure,
            dominantChain,
            dominantChainPercent,

            // Liquidity
            liquiditySummary: {
                highLiquidityAssetsCount,
                mediumLiquidityAssetsCount,
                lowLiquidityAssetsCount,
                unknownLiquidityAssetsCount,
            },

            // Market exposure
            marketExposure,

            // Holdings
            topHoldings,
            pricedHoldingSymbols: pricedHoldings.map(h => h.symbol || h.security?.ticker_symbol || '?').join(', '),
            unpricedHoldingSymbols: unpricedHoldings.map(h => h.symbol || h.security?.ticker_symbol || '?').join(', '),
        };
    }

    window.PortfolioAnalysis = { compute };

    console.info('[PortfolioAnalysis] Deterministic metrics engine loaded.');

})();
