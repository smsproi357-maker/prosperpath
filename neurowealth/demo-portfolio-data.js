/**
 * demo-portfolio-data.js
 *
 * Dedicated demo portfolio dataset for ProsperPath sandbox/demo mode.
 *
 * STRICT RULE: This module ONLY activates when the app is in demo mode
 * (guidedSandbox or sandboxFreeExplore). It NEVER affects normal usage.
 *
 * Provides:
 *   - isDemoMode()           — checks current ProsperDemo appMode
 *   - getDemoPortfolios()    — returns 3 realistic demo portfolio objects
 *   - injectDemoPortfolios() — adds demo portfolios to PortfolioStore
 *   - clearDemoPortfolios()  — removes all demo:* entries from PortfolioStore
 *
 * Exposed as: window.DemoPortfolioData
 */
'use strict';

(function () {
    const LOG = '[DemoPortfolioData]';
    const DEMO_ID_PREFIX = 'demo:';

    // =========================================================================
    // Mode Gate
    // =========================================================================

    function isDemoMode() {
        // Check the live ProsperDemo state first
        const mode = window.ProsperDemo?.appMode;
        if (mode === 'guidedSandbox' || mode === 'sandboxFreeExplore') return true;

        // Fallback: check sessionStorage directly.
        // portfolio-hub.js initializes BEFORE guided-demo-controller.js in the
        // script load order, so ProsperDemo.appMode may not be populated yet.
        // The demo controller persists state to sessionStorage before navigation,
        // so this read is reliable.
        try {
            const raw = sessionStorage.getItem('pp_demo_state');
            if (raw) {
                const saved = JSON.parse(raw);
                return saved.appMode === 'guidedSandbox' || saved.appMode === 'sandboxFreeExplore';
            }
        } catch (e) { /* private browsing / parse error — treat as not demo */ }

        return false;
    }

    // =========================================================================
    // Demo Holdings Data
    // =========================================================================

    const NOW_ISO = new Date().toISOString();

    /**
     * Long-Term Holdings — traditional equities + ETF portfolio.
     * ~$24,500 total across 5 positions.
     */
    const LONG_TERM_HOLDINGS = [
        {
            symbol: 'SPY',
            name: 'SPDR S&P 500 ETF Trust',
            quantity: 18.5,
            priceUsd: 542.30,
            valueUsd: 10032.55,
            isPriced: true,
            chainName: 'Traditional',
            formattedBalance: 18.5,
        },
        {
            symbol: 'AAPL',
            name: 'Apple Inc.',
            quantity: 22,
            priceUsd: 227.45,
            valueUsd: 5003.90,
            isPriced: true,
            chainName: 'Traditional',
            formattedBalance: 22,
        },
        {
            symbol: 'MSFT',
            name: 'Microsoft Corporation',
            quantity: 10,
            priceUsd: 428.50,
            valueUsd: 4285.00,
            isPriced: true,
            chainName: 'Traditional',
            formattedBalance: 10,
        },
        {
            symbol: 'NVDA',
            name: 'NVIDIA Corporation',
            quantity: 5,
            priceUsd: 875.40,
            valueUsd: 4377.00,
            isPriced: true,
            chainName: 'Traditional',
            formattedBalance: 5,
        },
        {
            symbol: 'CASH',
            name: 'Cash & Equivalents',
            quantity: 812.50,
            priceUsd: 1.00,
            valueUsd: 812.50,
            isPriced: true,
            chainName: 'Traditional',
            formattedBalance: 812.50,
        },
    ];

    /**
     * Growth Portfolio — tech-heavy with some crypto exposure.
     * ~$8,200 total across 5 positions.
     */
    const GROWTH_HOLDINGS = [
        {
            symbol: 'NVDA',
            name: 'NVIDIA Corporation',
            quantity: 3,
            priceUsd: 875.40,
            valueUsd: 2626.20,
            isPriced: true,
            chainName: 'Traditional',
            formattedBalance: 3,
        },
        {
            symbol: 'AAPL',
            name: 'Apple Inc.',
            quantity: 8,
            priceUsd: 227.45,
            valueUsd: 1819.60,
            isPriced: true,
            chainName: 'Traditional',
            formattedBalance: 8,
        },
        {
            symbol: 'MSFT',
            name: 'Microsoft Corporation',
            quantity: 4,
            priceUsd: 428.50,
            valueUsd: 1714.00,
            isPriced: true,
            chainName: 'Traditional',
            formattedBalance: 4,
        },
        {
            symbol: 'BTC',
            name: 'Bitcoin',
            quantity: 0.0155,
            priceUsd: 87250.00,
            valueUsd: 1352.38,
            isPriced: true,
            chainName: 'Ethereum',
            formattedBalance: 0.0155,
        },
        {
            symbol: 'ETH',
            name: 'Ethereum',
            quantity: 0.35,
            priceUsd: 1962.80,
            valueUsd: 686.98,
            isPriced: true,
            chainName: 'Ethereum',
            formattedBalance: 0.35,
        },
    ];

    /**
     * Crypto Portfolio — pure digital assets.
     * ~$5,800 total across 5 positions.
     */
    const CRYPTO_HOLDINGS = [
        {
            symbol: 'BTC',
            name: 'Bitcoin',
            quantity: 0.028,
            priceUsd: 87250.00,
            valueUsd: 2443.00,
            isPriced: true,
            isNative: false,
            chainName: 'Bitcoin',
            formattedBalance: 0.028,
        },
        {
            symbol: 'ETH',
            name: 'Ethereum',
            quantity: 0.72,
            priceUsd: 1962.80,
            valueUsd: 1413.22,
            isPriced: true,
            isNative: true,
            chainName: 'Ethereum',
            formattedBalance: 0.72,
        },
        {
            symbol: 'SOL',
            name: 'Solana',
            quantity: 6.5,
            priceUsd: 148.60,
            valueUsd: 965.90,
            isPriced: true,
            isNative: true,
            chainName: 'Solana',
            formattedBalance: 6.5,
        },
        {
            symbol: 'MATIC',
            name: 'Polygon',
            quantity: 850,
            priceUsd: 0.58,
            valueUsd: 493.00,
            isPriced: true,
            isNative: true,
            chainName: 'Polygon',
            formattedBalance: 850,
        },
        {
            symbol: 'USDC',
            name: 'USD Coin',
            quantity: 485.75,
            priceUsd: 1.00,
            valueUsd: 485.75,
            isPriced: true,
            isNative: false,
            chainName: 'Ethereum',
            formattedBalance: 485.75,
        },
    ];

    // =========================================================================
    // Portfolio Object Builder
    // =========================================================================

    function sumValue(holdings) {
        return holdings.reduce((s, h) => s + (h.valueUsd || 0), 0);
    }

    function countChains(holdings) {
        const chains = new Set();
        holdings.forEach(h => { if (h.chainName) chains.add(h.chainName); });
        return chains.size;
    }

    function buildMultichainData(holdings) {
        const totalValueUsd = sumValue(holdings);
        const chains = new Set();
        const chainGroupedHoldings = {};
        const chainTotals = {};

        holdings.forEach(h => {
            const chain = h.chainName || 'Other';
            chains.add(chain);
            if (!chainGroupedHoldings[chain]) chainGroupedHoldings[chain] = [];
            chainGroupedHoldings[chain].push(h);
            chainTotals[chain] = (chainTotals[chain] || 0) + (h.valueUsd || 0);
        });

        const topHoldings = [...holdings]
            .sort((a, b) => (b.valueUsd || 0) - (a.valueUsd || 0))
            .slice(0, 5)
            .map(h => ({
                symbol: h.symbol,
                name: h.name,
                chain: h.chainName,
                valueUsd: h.valueUsd,
                pct: totalValueUsd > 0 ? ((h.valueUsd / totalValueUsd) * 100).toFixed(1) : '0',
            }));

        const pricedCount = holdings.filter(h => h.isPriced).length;
        const unpricedCount = holdings.length - pricedCount;

        return {
            allHoldingsFlat: holdings,
            chainGroupedHoldings,
            chainTotals,
            totalPortfolioValueUsd: totalValueUsd,
            pricedHoldingsCount: pricedCount,
            unpricedHoldingsCount: unpricedCount,
            activeChains: chains.size,
            scannedChains: chains.size,
            topHoldings,
            failedChains: [],
        };
    }

    function buildPortfolio(id, displayName, accountLabel, providerName, holdings) {
        const totalValueUsd = sumValue(holdings);
        const pricedCount = holdings.filter(h => h.isPriced).length;
        const multichainData = buildMultichainData(holdings);

        // Build metadata matching the shape expected by _renderDetail() in portfolio-hub.js
        const metadata = {
            multichainData,
            holdings: { holdings: holdings, accounts: [] },
            transactions: { investment_transactions: [], securities: [] },
            walletSource: {
                address: 'demo-' + id,
                chainId: 1,
                isMultichain: true,
            },
            cryptoSummary: {
                totalValueUsd,
                activeChains: multichainData.activeChains,
                walletAddress: 'demo-' + id,
                chainConcentration: multichainData.chainTotals,
                topHoldings: multichainData.topHoldings,
                isMultichain: true,
                pricedHoldingsCount: pricedCount,
                unpricedHoldingsCount: holdings.length - pricedCount,
            },
        };

        return {
            id: DEMO_ID_PREFIX + id,
            sourceType: 'wallet',     // always wallet — detail renderer handles this path
            providerName: providerName,
            displayName: displayName,
            accountLabel: accountLabel,
            totalValueUsd: totalValueUsd,
            pnlValue: +(totalValueUsd * (0.02 + Math.random() * 0.06)).toFixed(2),
            pnlPercent: +(2 + Math.random() * 6).toFixed(1),
            pricedAssetsCount: pricedCount,
            unpricedAssetsCount: holdings.length - pricedCount,
            totalAssetsCount: holdings.length,
            totalChainsCount: countChains(holdings),
            syncStatus: 'synced',
            lastUpdatedAt: NOW_ISO,
            holdings: holdings,
            metadata: metadata,
            portfolioHash: 'demo-' + id,
        };
    }

    // =========================================================================
    // Public API
    // =========================================================================

    function getDemoPortfolios() {
        return [
            buildPortfolio(
                'long-term',
                'Long-Term Holdings',
                'Sample Brokerage',
                'ProsperPath Demo',
                LONG_TERM_HOLDINGS
            ),
            buildPortfolio(
                'growth',
                'Growth Portfolio',
                'Sample Brokerage',
                'ProsperPath Demo',
                GROWTH_HOLDINGS
            ),
            buildPortfolio(
                'crypto',
                'Crypto Portfolio',
                'Sample Wallet',
                'ProsperPath Demo',
                CRYPTO_HOLDINGS
            ),
        ];
    }

    function injectDemoPortfolios() {
        if (!isDemoMode()) {
            console.warn(LOG, 'Not in demo mode — skipping injection.');
            return;
        }

        const store = window.PortfolioStore;
        if (!store) {
            console.warn(LOG, 'PortfolioStore not available.');
            return;
        }

        // Always clear stale demo data first, then inject fresh copies.
        // This ensures any code-level changes to demo data shape are applied.
        const existing = store.getAllPortfolios();
        const oldDemoIds = existing.filter(p => p.id && p.id.startsWith(DEMO_ID_PREFIX)).map(p => p.id);
        oldDemoIds.forEach(id => store.removePortfolio(id));

        const demos = getDemoPortfolios();
        demos.forEach(pf => store.addPortfolio(pf));

        console.info(LOG, `Injected ${demos.length} demo portfolios (replaced ${oldDemoIds.length} stale).`);
    }

    function clearDemoPortfolios() {
        const store = window.PortfolioStore;
        if (!store) return;

        const all = store.getAllPortfolios();
        const demoIds = all.filter(p => p.id && p.id.startsWith(DEMO_ID_PREFIX)).map(p => p.id);

        if (demoIds.length === 0) {
            console.info(LOG, 'No demo portfolios to clear.');
            return;
        }

        demoIds.forEach(id => store.removePortfolio(id));
        console.info(LOG, `Cleared ${demoIds.length} demo portfolio(s).`);
    }

    // =========================================================================
    // Expose
    // =========================================================================

    window.DemoPortfolioData = {
        isDemoMode,
        getDemoPortfolios,
        injectDemoPortfolios,
        clearDemoPortfolios,
    };

    console.info(LOG, 'Loaded.');
})();
