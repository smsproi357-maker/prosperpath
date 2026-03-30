/* ================================================================
   MARKET PULSE — Clarity Box Scroll Section
   Standalone module. Does NOT modify script.js.
   Reuses: simpleCache, CurrencyConverter (globals from script.js)
   ================================================================ */

(function () {
    'use strict';

    // ─── Config ────────────────────────────────────────────────────────────────

    const COINGECKO_MARKETS_URL =
        'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd' +
        '&ids=bitcoin,ethereum,solana,ripple,binancecoin,cardano,avalanche-2,dogecoin,chainlink,polkadot,sui,near' +
        '&order=market_cap_desc&sparkline=false&price_change_percentage=24h';

    const CACHE_KEY_CRYPTO = 'mp_crypto_chips';
    const CACHE_KEY_STOCKS = 'mp_stocks_chips';
    const CACHE_KEY_COMMODITIES = 'mp_commodities_chips';
    const CACHE_TTL = 90 * 1000; // 90 seconds

    // Curated top stocks for Market Pulse chips
    const STOCK_SYMBOLS = [
        'AAPL', 'NVDA', 'MSFT', 'AMZN', 'TSLA',
        'META', 'GOOGL', 'JPM', 'AMD', 'NFLX',
        'ASML', 'TSM'
    ];

    // Curated commodities for Market Pulse chips
    const COMMODITY_SYMBOLS = [
        'GC=F',  // Gold
        'CL=F',  // Crude Oil
        'SI=F',  // Silver
        'NG=F',  // Natural Gas
        'HG=F',  // Copper
        'ZW=F',  // Wheat
        'ZC=F',  // Corn
        'PL=F',  // Platinum
        'KC=F',  // Coffee
        'CT=F',  // Cotton
        'SB=F',  // Sugar
        'OJ=F',  // Orange Juice
    ];

    // Human-readable labels for commodity futures symbols
    const COMMODITY_LABELS = {
        'GC=F': 'GOLD',
        'CL=F': 'OIL',
        'SI=F': 'SILVER',
        'NG=F': 'NAT GAS',
        'HG=F': 'COPPER',
        'ZW=F': 'WHEAT',
        'ZC=F': 'CORN',
        'PL=F': 'PLATINUM',
        'KC=F': 'COFFEE',
        'CT=F': 'COTTON',
        'SB=F': 'SUGAR',
        'OJ=F': 'OJ',
    };

    // Explore-more links per category
    const EXPLORE_LINKS = {
        crypto: 'crypto-tracker.html',
        stocks: 'stocks.html',
        commodities: 'commodities.html',
    };

    // ─── State ──────────────────────────────────────────────────────────────────

    let currentCategory = 'crypto';
    let hasLoaded = { crypto: false, stocks: false, commodities: false };

    // ─── DOM refs (resolved after DOMContentLoaded) ─────────────────────────────

    let grid, skeleton, exploreLink, categoryBtns;

    // ─── Utilities ──────────────────────────────────────────────────────────────

    function formatPrice(price) {
        if (price === null || price === undefined || isNaN(price)) return '—';
        if (typeof CurrencyConverter !== 'undefined' && CurrencyConverter.format) {
            try { return CurrencyConverter.format(price); } catch (e) { /* fall through */ }
        }
        if (price >= 1000) return '$' + price.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
        if (price >= 1) return '$' + price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        if (price >= 0.01) return '$' + price.toFixed(4);
        return '$' + price.toPrecision(4);
    }

    function changeClass(pct) {
        if (pct > 0.05) return 'mp-up';
        if (pct < -0.05) return 'mp-down';
        return 'mp-neutral';
    }

    function changeLabel(pct) {
        if (pct === null || pct === undefined || isNaN(pct)) return '—';
        const sign = pct > 0 ? '+' : '';
        return `${sign}${pct.toFixed(2)}%`;
    }

    function getCache(key) {
        if (typeof simpleCache !== 'undefined') return simpleCache.get(key);
        try {
            const item = localStorage.getItem(key);
            if (!item) return null;
            const rec = JSON.parse(item);
            if (Date.now() - rec.timestamp > rec.ttl) { localStorage.removeItem(key); return null; }
            return rec.data;
        } catch (e) { return null; }
    }

    function setCache(key, data, ttl) {
        if (typeof simpleCache !== 'undefined') return simpleCache.set(key, data, ttl);
        try {
            localStorage.setItem(key, JSON.stringify({ timestamp: Date.now(), ttl, data }));
        } catch (e) { /* ignore quota errors */ }
    }

    // ─── Chip Builder ────────────────────────────────────────────────────────────

    function buildChip({ symbol, price, change, href, delay }) {
        const cls = changeClass(change);
        const chip = document.createElement('a');
        chip.className = 'mp-chip';
        chip.href = href || '#';
        chip.setAttribute('role', 'listitem');
        chip.setAttribute('aria-label', `${symbol}: ${formatPrice(price)}, ${changeLabel(change)}`);
        chip.style.setProperty('--mp-delay', `${delay}s`);
        chip.innerHTML = `
            <span class="mp-chip-symbol">${symbol}</span>
            <span class="mp-chip-price">${formatPrice(price)}</span>
            <span class="mp-chip-change ${cls}">${changeLabel(change)}</span>
        `;
        return chip;
    }

    // ─── Rendering ───────────────────────────────────────────────────────────────

    function showSkeleton() {
        if (!grid) return;
        grid.innerHTML = '';
        const skeletonGrid = document.createElement('div');
        skeletonGrid.className = 'mp-skeleton-grid';
        skeletonGrid.id = 'mp-skeleton';
        for (let i = 0; i < 9; i++) {
            const s = document.createElement('div');
            s.className = 'mp-chip mp-chip--skeleton';
            skeletonGrid.appendChild(s);
        }
        grid.appendChild(skeletonGrid);
    }

    function showError(msg) {
        if (!grid) return;
        grid.innerHTML = `<p class="mp-error">${msg}</p>`;
    }

    function renderChips(chips) {
        if (!grid) return;
        grid.innerHTML = '';
        if (!chips || chips.length === 0) {
            showError('No data available right now.');
            return;
        }
        chips.forEach((chip, i) => {
            grid.appendChild(buildChip({ ...chip, delay: (i % 9) * 0.35 }));
        });
    }

    // ─── Data Fetchers ───────────────────────────────────────────────────────────

    async function loadCrypto() {
        const cached = getCache(CACHE_KEY_CRYPTO);
        if (cached) { renderChips(cached); return; }

        // Opportunistically reuse the main dashboard data if already fetched
        if (window.latestCryptoData && window.latestCryptoData.length > 0) {
            const chips = window.latestCryptoData.slice(0, 12).map(c => ({
                symbol: c.symbol.toUpperCase(),
                price: c.current_price,
                change: c.price_change_percentage_24h,
                href: `crypto-detail.html#id=${c.id}`,
            }));
            setCache(CACHE_KEY_CRYPTO, chips, CACHE_TTL);
            renderChips(chips);
            return;
        }

        try {
            const res = await fetch(COINGECKO_MARKETS_URL);
            if (!res.ok) throw new Error('API error');
            const data = await res.json();
            const chips = data.map(c => ({
                symbol: c.symbol.toUpperCase(),
                price: c.current_price,
                change: c.price_change_percentage_24h,
                href: `crypto-detail.html#id=${c.id}`,
            }));
            setCache(CACHE_KEY_CRYPTO, chips, CACHE_TTL);
            renderChips(chips);
        } catch (e) {
            // Static fallback
            const fallback = [
                { symbol: 'BTC', price: 96500, change: 1.2, href: 'crypto-detail.html#id=bitcoin' },
                { symbol: 'ETH', price: 3450, change: -0.5, href: 'crypto-detail.html#id=ethereum' },
                { symbol: 'SOL', price: 185, change: 3.2, href: 'crypto-detail.html#id=solana' },
                { symbol: 'XRP', price: 2.45, change: 4.5, href: 'crypto-detail.html#id=ripple' },
                { symbol: 'BNB', price: 620, change: 1.8, href: 'crypto-detail.html#id=binancecoin' },
                { symbol: 'ADA', price: 0.95, change: 2.1, href: 'crypto-detail.html#id=cardano' },
                { symbol: 'AVAX', price: 42, change: 2.9, href: 'crypto-detail.html#id=avalanche-2' },
                { symbol: 'DOGE', price: 0.32, change: 5.6, href: 'crypto-detail.html#id=dogecoin' },
                { symbol: 'LINK', price: 22.5, change: 1.5, href: 'crypto-detail.html#id=chainlink' },
            ];
            renderChips(fallback);
        }
    }

    async function loadStocks() {
        const cached = getCache(CACHE_KEY_STOCKS);
        if (cached) { renderChips(cached); return; }

        // Static fallback shown immediately while fetching live
        const fallback = [
            { symbol: 'AAPL', price: 185.5, change: 0.8 },
            { symbol: 'NVDA', price: 905, change: 2.1 },
            { symbol: 'MSFT', price: 420, change: 0.5 },
            { symbol: 'AMZN', price: 196, change: 1.3 },
            { symbol: 'TSLA', price: 240, change: -1.2 },
            { symbol: 'META', price: 510, change: 1.8 },
            { symbol: 'GOOGL', price: 180, change: 0.6 },
            { symbol: 'JPM', price: 202, change: 0.4 },
            { symbol: 'AMD', price: 175, change: 3.2 },
        ];

        // Show fallback immediately
        const fallbackChips = fallback.map(s => ({ ...s, href: `market-detail.html?symbol=${s.symbol}` }));
        renderChips(fallbackChips);

        // Try to get live data if fetchSingleQuote is available (from script.js)
        if (typeof fetchSingleQuote !== 'function') return;

        try {
            const results = await Promise.allSettled(
                STOCK_SYMBOLS.slice(0, 9).map(sym => fetchSingleQuote(sym))
            );

            const chips = results
                .filter(r => r.status === 'fulfilled' && r.value)
                .map(r => r.value)
                .map(s => ({
                    symbol: s.symbol,
                    price: s.regularMarketPrice,
                    change: s.regularMarketChangePercent,
                    href: `market-detail.html?symbol=${s.symbol}`,
                }));

            if (chips.length > 0) {
                setCache(CACHE_KEY_STOCKS, chips, CACHE_TTL);
                renderChips(chips);
            }
        } catch (e) {
            // Already showing fallback, no action needed
        }
    }

    async function loadCommodities() {
        const cached = getCache(CACHE_KEY_COMMODITIES);
        if (cached) { renderChips(cached); return; }

        // Static fallback shown immediately
        const fallback = [
            { symbol: 'GOLD', price: 2642, change: 0.4 },
            { symbol: 'OIL', price: 74.2, change: -0.8 },
            { symbol: 'SILVER', price: 31.5, change: 1.1 },
            { symbol: 'NAT GAS', price: 2.85, change: -1.5 },
            { symbol: 'COPPER', price: 4.22, change: 0.7 },
            { symbol: 'WHEAT', price: 545, change: -0.3 },
            { symbol: 'CORN', price: 442, change: 0.2 },
            { symbol: 'PLATINUM', price: 960, change: 0.9 },
            { symbol: 'COFFEE', price: 3.12, change: 1.4 },
        ];

        const fallbackChips = fallback.map(s => ({
            ...s,
            href: `commodities.html`
        }));
        renderChips(fallbackChips);

        // Try live data if fetchSingleQuote is available
        if (typeof fetchSingleQuote !== 'function') return;

        try {
            const results = await Promise.allSettled(
                COMMODITY_SYMBOLS.slice(0, 9).map(sym => fetchSingleQuote(sym))
            );

            const chips = results
                .filter(r => r.status === 'fulfilled' && r.value)
                .map(r => r.value)
                .map(s => ({
                    symbol: COMMODITY_LABELS[s.symbol] || s.symbol,
                    price: s.regularMarketPrice,
                    change: s.regularMarketChangePercent,
                    href: 'commodities.html',
                }));

            if (chips.length > 0) {
                setCache(CACHE_KEY_COMMODITIES, chips, CACHE_TTL);
                renderChips(chips);
            }
        } catch (e) {
            // Already showing fallback
        }
    }

    // ─── Category Switching ──────────────────────────────────────────────────────

    function switchCategory(cat) {
        currentCategory = cat;

        // Update tab state
        categoryBtns.forEach(btn => {
            const isActive = btn.dataset.cat === cat;
            btn.classList.toggle('active', isActive);
            btn.setAttribute('aria-selected', String(isActive));
        });

        // Update explore link
        if (exploreLink) {
            exploreLink.href = EXPLORE_LINKS[cat] || 'crypto-tracker.html';
        }

        // Show skeleton then load
        if (!hasLoaded[cat]) {
            showSkeleton();
        }

        hasLoaded[cat] = true;

        if (cat === 'crypto') loadCrypto();
        else if (cat === 'stocks') loadStocks();
        else if (cat === 'commodities') loadCommodities();
    }

    // ─── IntersectionObserver (lazy load) ────────────────────────────────────────

    function initObserver() {
        const section = document.getElementById('market-pulse-section');
        const inner = section && section.querySelector('.mp-inner');
        if (!section || !inner) return;

        let loaded = false;

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    // Fade in section
                    inner.classList.add('mp-visible');

                    // Load data once
                    if (!loaded) {
                        loaded = true;
                        switchCategory('crypto');
                    }
                }
            });
        }, {
            threshold: 0.1,
            rootMargin: '0px 0px -60px 0px'
        });

        observer.observe(section);
    }

    // ─── Bootstrap ───────────────────────────────────────────────────────────────

    function init() {
        grid = document.getElementById('mp-grid');
        skeleton = document.getElementById('mp-skeleton');
        exploreLink = document.getElementById('mp-explore-link');
        categoryBtns = document.querySelectorAll('.mp-cat');

        if (!grid || !categoryBtns.length) return; // Not on clarity-box page

        // Wire category buttons
        categoryBtns.forEach(btn => {
            btn.addEventListener('click', () => switchCategory(btn.dataset.cat));
        });

        // Initialize IntersectionObserver for lazy loading
        if ('IntersectionObserver' in window) {
            initObserver();
        } else {
            // Fallback: load immediately for older browsers
            const inner = document.querySelector('#market-pulse-section .mp-inner');
            if (inner) inner.classList.add('mp-visible');
            switchCategory('crypto');
        }
    }

    // Run after DOM and script.js are ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        // DOMContentLoaded already fired — wait a tick for script.js to fully initialize
        setTimeout(init, 0);
    }

})();
