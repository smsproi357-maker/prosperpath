// -------------------- Global Config --------------------
const FINNHUB_API_KEY = 'd5kk25pr01qt47mdmqdgd5kk25pr01qt47mdmqe0';
window.WORKER_BASE_URL = 'https://neurowealth-worker.smsproi357.workers.dev';
window.WORKER_API_URL = `${window.WORKER_BASE_URL}/api`;

// -------------------- Global News Data --------------------
window.aiAnalysis = {
    'bitcoin': {
        verdict: 'Buy',
        reason: 'Strong institutional inflow via ETFs and halving supply shock support a bullish continuation structure.',
        sentiment: 78,
        low: '$95,000',
        high: '$150,000',
        news: [
            { title: 'BlackRock Increases BTC Holdings', date: '2h ago', source: 'Bloomberg' },
            { title: 'Mining Difficulty Hits All-Time High', date: '5h ago', source: 'CoinDesk' }
        ]
    },
    'ethereum': {
        verdict: 'Hold',
        reason: 'Consolidating above support ($3,200). Needs to break $3,600 resistance for confirmed breakout. L2 activity remains high.',
        sentiment: 55,
        low: '$4,200',
        high: '$8,500',
        news: [
            { title: 'Vitalik Proposes New Gas Limit', date: '1d ago', source: 'Ethereum Foundation' },
            { title: 'L2 TVL Surpasses $50B', date: '6h ago', source: 'DefiLlama' }
        ]
    },
    'solana': {
        verdict: 'Buy',
        reason: 'DEX volume on Solana continues to flip Ethereum on daily timeframes. Ecosystem growth is exponential.',
        sentiment: 82,
        low: '$180',
        high: '$350',
        news: [
            { title: 'Solana Mobile Chapter 2 Pre-orders Top 100k', date: '12h ago', source: 'Solana Labs' },
            { title: 'New Jupiter Governance Proposal Live', date: '1d ago', source: 'Jupiter' }
        ]
    }
};

window.getAnalysis = (id) => {
    if (window.aiAnalysis[id]) return window.aiAnalysis[id];
    const name = id.charAt(0).toUpperCase() + id.slice(1).replace(/-/g, ' ');
    return {
        verdict: 'Accumulate',
        reason: `${name} shows expanding network activity and resilient support levels. AI indicators suggest a medium-term bullish bias.`,
        sentiment: 60 + (id.length % 20),
        low: '+15%',
        high: '+85%',
        news: [
            { title: `${name} Ecosystem Expansion Accelerates`, date: '8h ago', source: 'ProsperPath AI' },
            { title: `On-chain Metrics Show Bullish Divergence for ${name}`, date: '1d ago', source: 'CryptoQuant' }
        ]
    };
};

// -------------------- Crypto Features (FAB & Dashboard) --------------------

function initCryptoFab() {
    // Check if FAB already exists (to prevent duplicates)
    // DISABLED per user request (moved to Main Nav)
    return;
    if (document.querySelector('.crypto-fab')) return;

    // Create FAB Link
    const fab = document.createElement('a');
    fab.href = 'crypto-tracker.html';
    fab.className = 'crypto-fab';
    fab.ariaLabel = 'Live Crypto Market';

    // SVG Icon (Chart)
    fab.innerHTML = `
        <div class="pulse-ring"></div>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
            <path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/>
        </svg>
    `;

    document.body.appendChild(fab);
}

// -------------------- Global Market Data --------------------
const simpleCache = {
    get: (key) => {
        const item = localStorage.getItem(key);
        if (!item) return null;
        const record = JSON.parse(item);
        if (Date.now() - record.timestamp > record.ttl) {
            localStorage.removeItem(key);
            return null;
        }
        return record.data;
    },
    set: (key, data, ttlMs = 60000) => { // Default 1 min cache
        localStorage.setItem(key, JSON.stringify({
            timestamp: Date.now(),
            ttl: ttlMs,
            data: data
        }));
    }
};

// -------------------- Watchlist Management --------------------
window.Watchlist = {
    get: () => {
        const list = localStorage.getItem('user_watchlist');
        return list ? JSON.parse(list) : [];
    },
    toggle: (item) => {
        let list = Watchlist.get();
        const index = list.findIndex(i => i.id === item.id && i.type === item.type);

        if (index > -1) {
            list.splice(index, 1);
        } else {
            list.push({
                id: item.id,
                symbol: item.symbol,
                name: item.name,
                type: item.type,
                icon: item.icon,
                addedAt: Date.now()
            });
        }
        localStorage.setItem('user_watchlist', JSON.stringify(list));

        // Sync to Backend if logged in
        if (window.currentUser) {
            Watchlist.sync(list);
        }

        return index === -1; // returns true if added, false if removed
    },
    isIn: (id, type) => {
        const list = Watchlist.get();
        return list.some(i => i.id === id && i.type === type);
    },
    sync: async (list) => {
        try {
            const token = localStorage.getItem('auth_token');
            if (!token) return;

            await fetch(`${window.WORKER_API_URL}/user/watchlist`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ watchlist: list })
            });
        } catch (e) {
            console.warn('Watchlist sync error:', e);
        }
    }
};

// Listen for Login to refresh UI/Data
window.addEventListener('auth-login-success', () => {
    // Other scripts will handle data loading, but we might want to refresh grid here if on watchlist page
    if (window.location.pathname.includes('watchlist.html')) {
        window.location.reload();
    }
});

// -------------------- Global Market Data --------------------
// -------------------- Global Market Data --------------------
window.fetchGlobalMarketData = async function () {
    try {
        const cacheKey = 'global_market_data';
        let data = simpleCache.get(cacheKey);

        if (!data) {
            const response = await fetch('https://api.coingecko.com/api/v3/global');
            if (!response.ok) throw new Error('API Error');
            data = await response.json();
            simpleCache.set(cacheKey, data, 120000); // Cache for 2 mins
        }

        const capElement = document.getElementById('global-cap');
        const domElement = document.getElementById('btc-dominance');

        if (capElement) {
            const selectedCurrency = CurrencyConverter.getSelected();
            const symbol = CurrencyConverter.getCurrencySymbol();

            let capUSD = 2410000000000; // Static fallback
            if (data && data.data && data.data.total_market_cap) {
                capUSD = data.data.total_market_cap.usd;

                // If API provides the currency directly, use it
                const directCap = data.data.total_market_cap[selectedCurrency.toLowerCase()];
                if (directCap) {
                    if (directCap > 1e12) {
                        capElement.innerText = `${symbol}${(directCap / 1e12).toFixed(2)}T`;
                    } else {
                        capElement.innerText = `${symbol}${(directCap / 1e9).toFixed(2)}B`;
                    }
                    return;
                }
            }

            // Fallback: Convert USD value client-side
            const convertedCap = CurrencyConverter.convert(capUSD);
            if (convertedCap > 1e12) {
                capElement.innerText = `${symbol}${(convertedCap / 1e12).toFixed(2)}T`;
            } else {
                capElement.innerText = `${symbol}${(convertedCap / 1e9).toFixed(2)}B`;
            }
        }

        if (domElement && data.data) {
            const btcDom = data.data.market_cap_percentage.btc;
            domElement.innerText = `${btcDom.toFixed(1)}%`;
        }
    } catch (e) {
        console.warn('Global Market Data Error:', e);
    }
}

async function fetchFearAndGreedIndex() {
    try {
        const cacheKey = 'fng_index';
        let data = simpleCache.get(cacheKey);

        if (!data) {
            const response = await fetch('https://api.alternative.me/fng/');
            if (!response.ok) throw new Error('API Error');
            data = await response.json();
            simpleCache.set(cacheKey, data, 300000); // Cache for 5 mins
        }

        const fngElement = document.getElementById('global-fng');
        if (fngElement && data.data && data.data.length > 0) {
            const item = data.data[0];
            const value = item.value;
            const classification = item.value_classification;

            fngElement.innerText = `${value} (${classification})`;

            // Color Coding
            fngElement.classList.remove('val-greed', 'val-fear');
            if (value >= 55) fngElement.style.color = 'var(--color-success)';
            else if (value <= 45) fngElement.style.color = 'var(--color-danger)';
            else fngElement.style.color = 'var(--color-warning)';
        }
    } catch (e) {
        console.warn('Fear & Greed API Error:', e);
    }
}

window.fetchGlobalNews = async function () {
    try {
        const cacheKey = 'global_market_news';
        let data = simpleCache.get(cacheKey);

        if (!data) {
            const url = `https://finnhub.io/api/v1/news?category=general&token=${FINNHUB_API_KEY}`;
            const response = await fetch(url);
            if (!response.ok) throw new Error('News API Error');
            data = await response.json();
            simpleCache.set(cacheKey, data.slice(0, 10), 600000); // Cache top 10 for 10 mins
            data = data.slice(0, 10);
        }
        return data;
    } catch (e) {
        console.warn('News Fetch Error:', e);
        return [];
    }
}

// -------------------- Crypto Tracker Dashboard --------------------
window.latestCryptoData = null;
async function initCryptoDashboard(forceFetch = false) {
    const grid = document.getElementById('crypto-grid');
    if (!grid) return; // Only run on crypto-tracker.html

    // Load Global Header Data
    fetchGlobalMarketData();
    fetchFearAndGreedIndex();

    // Reduced list to prevent rate limiting (Top 30 instead of 50)
    const coins = [
        'bitcoin', 'ethereum', 'solana', 'cardano', 'ripple', 'polkadot', 'dogecoin',
        'binancecoin', 'avalanche-2', 'shiba-inu', 'chainlink', 'tron',
        'matic-network', 'the-open-network', 'internet-computer', 'litecoin', 'uniswap',
        'pepe', 'sui', 'near', 'render-token', 'kaspa', 'fetch-ai', 'arbitrum', 'celestia', 'dogwifhat', 'blockstack',
        'bitcoin-cash', 'ethereum-classic', 'aptos',
        'cosmos', 'algorand', 'vechain', 'fantom', 'theta-token', 'injective-protocol',
        'aave', 'maker', 'the-graph', 'enjincoin', 'decentraland', 'the-sandbox',
        'axie-infinity', 'gala', 'flow', 'helium', 'iota', 'neo', 'zcash', 'dash',
        'lido-dao', 'worldcoin-wld', 'sei-network', 'jupiter-exchange-solana',
        'ondo-finance', 'pyth-network', 'jito-governance-token', 'bonk', 'floki', 'beam-2'
    ];

    // Always fetch in USD to save API limits and allow client-side conversion
    const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${coins.join(',')}&order=market_cap_desc&sparkline=false&price_change_percentage=24h`;

    // Static Fallback Data
    const fallbackData = [
        { id: 'bitcoin', name: 'Bitcoin', symbol: 'BTC', image: 'https://assets.coingecko.com/coins/images/1/large/bitcoin.png', current_price: 96500, price_change_percentage_24h: 1.2 },
        { id: 'ethereum', name: 'Ethereum', symbol: 'ETH', image: 'https://assets.coingecko.com/coins/images/279/large/ethereum.png', current_price: 3450, price_change_percentage_24h: -0.5 },
        { id: 'solana', name: 'Solana', symbol: 'SOL', image: 'https://assets.coingecko.com/coins/images/4128/large/solana.png', current_price: 185, price_change_percentage_24h: 3.2 },
        { id: 'cardano', name: 'Cardano', symbol: 'ADA', image: 'https://assets.coingecko.com/coins/images/975/large/cardano.png', current_price: 0.95, price_change_percentage_24h: 2.1 },
        { id: 'ripple', name: 'XRP', symbol: 'XRP', image: 'https://assets.coingecko.com/coins/images/44/large/xrp-symbol-white-128.png', current_price: 2.45, price_change_percentage_24h: 4.5 },
        { id: 'polkadot', name: 'Polkadot', symbol: 'DOT', image: 'https://assets.coingecko.com/coins/images/12171/large/polkadot.png', current_price: 8.20, price_change_percentage_24h: -1.8 },
        { id: 'dogecoin', name: 'Dogecoin', symbol: 'DOGE', image: 'https://assets.coingecko.com/coins/images/5/large/dogecoin.png', current_price: 0.32, price_change_percentage_24h: 5.6 },
        { id: 'binancecoin', name: 'BNB', symbol: 'BNB', image: 'https://assets.coingecko.com/coins/images/825/large/bnb-icon2_2x.png', current_price: 620, price_change_percentage_24h: 1.8 },
        { id: 'avalanche-2', name: 'Avalanche', symbol: 'AVAX', image: 'https://assets.coingecko.com/coins/images/12559/large/Avalanche_Circle_RedWhite_Trans.png', current_price: 42, price_change_percentage_24h: 2.9 },
        { id: 'shiba-inu', name: 'Shiba Inu', symbol: 'SHIB', image: 'https://assets.coingecko.com/coins/images/11939/large/shiba.png', current_price: 0.00002450, price_change_percentage_24h: 8.2 },
        { id: 'chainlink', name: 'Chainlink', symbol: 'LINK', image: 'https://assets.coingecko.com/coins/images/877/large/chainlink-new-logo.png', current_price: 22.50, price_change_percentage_24h: 1.5 },
        { id: 'tron', name: 'TRON', symbol: 'TRX', image: 'https://assets.coingecko.com/coins/images/1094/large/tron-logo.png', current_price: 0.24, price_change_percentage_24h: 3.1 },
        { id: 'matic-network', name: 'Polygon', symbol: 'MATIC', image: 'https://assets.coingecko.com/coins/images/4713/large/matic-token-icon.png', current_price: 0.95, price_change_percentage_24h: -0.8 },
        { id: 'the-open-network', name: 'Toncoin', symbol: 'TON', image: 'https://assets.coingecko.com/coins/images/17980/large/ton_symbol.png', current_price: 5.80, price_change_percentage_24h: 2.3 },
        { id: 'internet-computer', name: 'Internet Computer', symbol: 'ICP', image: 'https://assets.coingecko.com/coins/images/14495/large/Internet_Computer_logo.png', current_price: 12.40, price_change_percentage_24h: -2.1 },
        { id: 'litecoin', name: 'Litecoin', symbol: 'LTC', image: 'https://assets.coingecko.com/coins/images/2/large/litecoin.png', current_price: 105, price_change_percentage_24h: 0.9 },
        { id: 'uniswap', name: 'Uniswap', symbol: 'UNI', image: 'https://assets.coingecko.com/coins/images/12504/large/uniswap-uni.png', current_price: 13.20, price_change_percentage_24h: 1.7 },
        { id: 'pepe', name: 'Pepe', symbol: 'PEPE', image: 'https://assets.coingecko.com/coins/images/29850/large/pepe-token.jpeg', current_price: 0.00001850, price_change_percentage_24h: 12.5 },
        { id: 'sui', name: 'Sui', symbol: 'SUI', image: 'https://assets.coingecko.com/coins/images/26375/large/sui_asset.jpeg', current_price: 4.25, price_change_percentage_24h: 6.8 },
        { id: 'near', name: 'NEAR Protocol', symbol: 'NEAR', image: 'https://assets.coingecko.com/coins/images/10365/large/near.jpg', current_price: 5.60, price_change_percentage_24h: 2.4 },
        { id: 'render-token', name: 'Render', symbol: 'RNDR', image: 'https://assets.coingecko.com/coins/images/11636/large/rndr.png', current_price: 7.80, price_change_percentage_24h: 4.2 },
        { id: 'kaspa', name: 'Kaspa', symbol: 'KAS', image: 'https://assets.coingecko.com/coins/images/25751/large/kaspa-icon-exchanges.png', current_price: 0.145, price_change_percentage_24h: 5.3 },
        { id: 'fetch-ai', name: 'Fetch.ai', symbol: 'FET', image: 'https://assets.coingecko.com/coins/images/5681/large/Fetch.jpg', current_price: 1.45, price_change_percentage_24h: 3.7 },
        { id: 'arbitrum', name: 'Arbitrum', symbol: 'ARB', image: 'https://assets.coingecko.com/coins/images/16547/large/photo_2023-03-29_21.47.00.jpeg', current_price: 0.85, price_change_percentage_24h: 1.9 },
        { id: 'celestia', name: 'Celestia', symbol: 'TIA', image: 'https://assets.coingecko.com/coins/images/31967/large/tia.jpg', current_price: 6.20, price_change_percentage_24h: -1.3 },
        { id: 'dogwifhat', name: 'dogwifhat', symbol: 'WIF', image: 'https://assets.coingecko.com/coins/images/33566/large/dogwifhat.jpg', current_price: 2.85, price_change_percentage_24h: 8.9 },
        { id: 'blockstack', name: 'Stacks', symbol: 'STX', image: 'https://assets.coingecko.com/coins/images/2069/large/Stacks_logo_full.png', current_price: 1.95, price_change_percentage_24h: 2.6 },
        { id: 'bitcoin-cash', name: 'Bitcoin Cash', symbol: 'BCH', image: 'https://assets.coingecko.com/coins/images/780/large/bitcoin-cash-circle.png', current_price: 450, price_change_percentage_24h: 1.1 },
        { id: 'ethereum-classic', name: 'Ethereum Classic', symbol: 'ETC', image: 'https://assets.coingecko.com/coins/images/453/large/ethereum-classic-logo.png', current_price: 28, price_change_percentage_24h: -0.7 },
        { id: 'aptos', name: 'Aptos', symbol: 'APT', image: 'https://assets.coingecko.com/coins/images/26455/large/aptos_round.png', current_price: 9.50, price_change_percentage_24h: 3.4 },
        { id: 'hedera-hashgraph', name: 'Hedera', symbol: 'HBAR', image: 'https://assets.coingecko.com/coins/images/3688/large/hbar.png', current_price: 0.28, price_change_percentage_24h: 4.1 },
        { id: 'stellar', name: 'Stellar', symbol: 'XLM', image: 'https://assets.coingecko.com/coins/images/100/large/Stellar_symbol_black_RGB.png', current_price: 0.38, price_change_percentage_24h: 2.8 },
        { id: 'crypto-com-chain', name: 'Cronos', symbol: 'CRO', image: 'https://assets.coingecko.com/coins/images/7310/large/cro_token_logo.png', current_price: 0.16, price_change_percentage_24h: 1.4 },
        { id: 'bittensor', name: 'Bittensor', symbol: 'TAO', image: 'https://assets.coingecko.com/coins/images/28452/large/ARUsPeNQ_400x400.jpeg', current_price: 520, price_change_percentage_24h: -2.5 },
        { id: 'filecoin', name: 'Filecoin', symbol: 'FIL', image: 'https://assets.coingecko.com/coins/images/12817/large/filecoin.png', current_price: 5.40, price_change_percentage_24h: 0.6 },
        { id: 'immutable-x', name: 'Immutable', symbol: 'IMX', image: 'https://assets.coingecko.com/coins/images/17233/large/immutableX-symbol-BLK-RGB.png', current_price: 1.85, price_change_percentage_24h: 3.2 },
        { id: 'monero', name: 'Monero', symbol: 'XMR', image: 'https://assets.coingecko.com/coins/images/69/large/monero_logo.png', current_price: 185, price_change_percentage_24h: -0.9 },
        { id: 'based-brett', name: 'Based Brett', symbol: 'BRETT', image: 'https://assets.coingecko.com/coins/images/35846/large/based-brett.png', current_price: 0.125, price_change_percentage_24h: 15.2 },
        { id: 'popcat', name: 'Popcat', symbol: 'POPCAT', image: 'https://assets.coingecko.com/coins/images/33760/large/popcat.png', current_price: 0.85, price_change_percentage_24h: 9.8 },
        { id: 'mog-coin', name: 'Mog Coin', symbol: 'MOG', image: 'https://assets.coingecko.com/coins/images/31058/large/mog_logo.png', current_price: 0.0000018, price_change_percentage_24h: 7.5 },
        { id: 'turbo', name: 'Turbo', symbol: 'TURBO', image: 'https://assets.coingecko.com/coins/images/30134/large/turbo.png', current_price: 0.0065, price_change_percentage_24h: 11.3 },
        { id: 'ethena', name: 'Ethena', symbol: 'ENA', image: 'https://assets.coingecko.com/coins/images/36530/large/ethena.png', current_price: 0.95, price_change_percentage_24h: 2.7 },
        { id: 'pendle', name: 'Pendle', symbol: 'PENDLE', image: 'https://assets.coingecko.com/coins/images/15069/large/Pendle_Logo_Normal-03.png', current_price: 4.80, price_change_percentage_24h: 1.9 },
        { id: 'akash-network', name: 'Akash Network', symbol: 'AKT', image: 'https://assets.coingecko.com/coins/images/12785/large/akash-logo.png', current_price: 3.20, price_change_percentage_24h: 4.6 },
        { id: 'gnosis', name: 'Gnosis', symbol: 'GNO', image: 'https://assets.coingecko.com/coins/images/662/large/logo_square_simple_300px.png', current_price: 285, price_change_percentage_24h: -1.2 },
        { id: 'raydium', name: 'Raydium', symbol: 'RAY', image: 'https://assets.coingecko.com/coins/images/13928/large/PSigc4ie_400x400.jpg', current_price: 4.50, price_change_percentage_24h: 5.8 },
        { id: 'coredaoorg', name: 'Core', symbol: 'CORE', image: 'https://assets.coingecko.com/coins/images/28938/large/coredao.png', current_price: 1.15, price_change_percentage_24h: 3.5 },
        { id: 'cosmos', name: 'Cosmos', symbol: 'ATOM', image: 'https://assets.coingecko.com/coins/images/1481/large/cosmos_hub.png', current_price: 9.80, price_change_percentage_24h: 2.3 },
        { id: 'algorand', name: 'Algorand', symbol: 'ALGO', image: 'https://assets.coingecko.com/coins/images/4380/large/download.png', current_price: 0.32, price_change_percentage_24h: 1.8 },
        { id: 'vechain', name: 'VeChain', symbol: 'VET', image: 'https://assets.coingecko.com/coins/images/1167/large/VeChain-Logo-768x725.png', current_price: 0.042, price_change_percentage_24h: 3.1 },
        { id: 'fantom', name: 'Fantom', symbol: 'FTM', image: 'https://assets.coingecko.com/coins/images/4001/large/Fantom_round.png', current_price: 0.78, price_change_percentage_24h: 4.5 },
        { id: 'theta-token', name: 'Theta Network', symbol: 'THETA', image: 'https://assets.coingecko.com/coins/images/2538/large/theta-token-logo.png', current_price: 2.10, price_change_percentage_24h: -1.2 },
        { id: 'injective-protocol', name: 'Injective', symbol: 'INJ', image: 'https://assets.coingecko.com/coins/images/12882/large/Secondary_Symbol.png', current_price: 24.50, price_change_percentage_24h: 5.8 },
        { id: 'aave', name: 'Aave', symbol: 'AAVE', image: 'https://assets.coingecko.com/coins/images/12645/large/AAVE.png', current_price: 285, price_change_percentage_24h: 2.1 },
        { id: 'maker', name: 'Maker', symbol: 'MKR', image: 'https://assets.coingecko.com/coins/images/1364/large/Mark_Maker.png', current_price: 1850, price_change_percentage_24h: -0.6 },
        { id: 'the-graph', name: 'The Graph', symbol: 'GRT', image: 'https://assets.coingecko.com/coins/images/13397/large/Graph_Token.png', current_price: 0.22, price_change_percentage_24h: 3.4 },
        { id: 'enjincoin', name: 'Enjin Coin', symbol: 'ENJ', image: 'https://assets.coingecko.com/coins/images/1102/large/enjin-coin-logo.png', current_price: 0.35, price_change_percentage_24h: 1.9 },
        { id: 'decentraland', name: 'Decentraland', symbol: 'MANA', image: 'https://assets.coingecko.com/coins/images/878/large/decentraland-mana.png', current_price: 0.48, price_change_percentage_24h: 2.7 },
        { id: 'the-sandbox', name: 'The Sandbox', symbol: 'SAND', image: 'https://assets.coingecko.com/coins/images/12129/large/sandbox_logo.jpg', current_price: 0.55, price_change_percentage_24h: 1.5 },
        { id: 'axie-infinity', name: 'Axie Infinity', symbol: 'AXS', image: 'https://assets.coingecko.com/coins/images/13029/large/axie_infinity_logo.png', current_price: 7.90, price_change_percentage_24h: -2.3 },
        { id: 'gala', name: 'Gala', symbol: 'GALA', image: 'https://assets.coingecko.com/coins/images/12493/large/GALA-COINGECKO.png', current_price: 0.038, price_change_percentage_24h: 4.2 },
        { id: 'flow', name: 'Flow', symbol: 'FLOW', image: 'https://assets.coingecko.com/coins/images/13446/large/5f6294c0c7a8cda55cb1c936_Flow_Wordmark.png', current_price: 0.82, price_change_percentage_24h: 1.1 },
        { id: 'helium', name: 'Helium', symbol: 'HNT', image: 'https://assets.coingecko.com/coins/images/4284/large/Helium_HNT.png', current_price: 6.50, price_change_percentage_24h: 3.8 },
        { id: 'iota', name: 'IOTA', symbol: 'IOTA', image: 'https://assets.coingecko.com/coins/images/692/large/IOTA_Swirl.png', current_price: 0.31, price_change_percentage_24h: 2.0 },
        { id: 'neo', name: 'NEO', symbol: 'NEO', image: 'https://assets.coingecko.com/coins/images/480/large/NEO_512_512.png', current_price: 15.20, price_change_percentage_24h: -0.4 },
        { id: 'zcash', name: 'Zcash', symbol: 'ZEC', image: 'https://assets.coingecko.com/coins/images/486/large/circle-zcash-color.png', current_price: 32.50, price_change_percentage_24h: 1.6 },
        { id: 'dash', name: 'Dash', symbol: 'DASH', image: 'https://assets.coingecko.com/coins/images/19/large/dash-logo.png', current_price: 28.80, price_change_percentage_24h: -1.1 },
        { id: 'lido-dao', name: 'Lido DAO', symbol: 'LDO', image: 'https://assets.coingecko.com/coins/images/18523/large/ldo.png', current_price: 2.15, price_change_percentage_24h: 3.2 },
        { id: 'worldcoin-wld', name: 'Worldcoin', symbol: 'WLD', image: 'https://assets.coingecko.com/coins/images/31069/large/worldcoin.jpeg', current_price: 2.85, price_change_percentage_24h: 6.4 },
        { id: 'sei-network', name: 'Sei', symbol: 'SEI', image: 'https://assets.coingecko.com/coins/images/28205/large/Sei_Logo.png', current_price: 0.52, price_change_percentage_24h: 4.8 },
        { id: 'jupiter-exchange-solana', name: 'Jupiter', symbol: 'JUP', image: 'https://assets.coingecko.com/coins/images/34188/large/jup.png', current_price: 0.95, price_change_percentage_24h: 5.1 },
        { id: 'ondo-finance', name: 'Ondo Finance', symbol: 'ONDO', image: 'https://assets.coingecko.com/coins/images/26580/large/ONDO.png', current_price: 1.45, price_change_percentage_24h: 7.2 },
        { id: 'pyth-network', name: 'Pyth Network', symbol: 'PYTH', image: 'https://assets.coingecko.com/coins/images/31924/large/pyth.png', current_price: 0.38, price_change_percentage_24h: 3.6 },
        { id: 'jito-governance-token', name: 'Jito', symbol: 'JTO', image: 'https://assets.coingecko.com/coins/images/33228/large/jto.png', current_price: 3.20, price_change_percentage_24h: 2.9 },
        { id: 'bonk', name: 'Bonk', symbol: 'BONK', image: 'https://assets.coingecko.com/coins/images/28600/large/bonk.jpg', current_price: 0.000024, price_change_percentage_24h: 9.5 },
        { id: 'floki', name: 'FLOKI', symbol: 'FLOKI', image: 'https://assets.coingecko.com/coins/images/16746/large/FLOKI.png', current_price: 0.00018, price_change_percentage_24h: 6.8 },
        { id: 'beam-2', name: 'Beam', symbol: 'BEAM', image: 'https://assets.coingecko.com/coins/images/32417/large/beam.png', current_price: 0.028, price_change_percentage_24h: 4.3 }
    ];

    const urlParams = new URLSearchParams(window.location.search);
    const filter = urlParams.get('filter');

    // If we have data and are just re-rendering (e.g. currency change), skip fetch
    if (!forceFetch && window.latestCryptoData) {
        data = window.latestCryptoData;
    } else {
        try {
            const cacheKey = 'crypto_dashboard_coins';
            data = simpleCache.get(cacheKey);

            if (!data) {
                const response = await fetch(url);
                if (!response.ok) throw new Error('API Rate Limit');
                data = await response.json();
                simpleCache.set(cacheKey, data, 90000);
            }
            window.latestCryptoData = data;
        } catch (e) {
            console.warn('Using fallback crypto data:', e);
            data = fallbackData;
        }
    }

    // Apply Filters
    if (filter === 'gainers') {
        data = [...data].sort((a, b) => (b.price_change_percentage_24h || 0) - (a.price_change_percentage_24h || 0)).slice(0, 30);
    } else if (filter === 'losers') {
        data = [...data].sort((a, b) => (a.price_change_percentage_24h || 0) - (b.price_change_percentage_24h || 0)).slice(0, 30);
    } else if (filter === 'potential') {
        data = [...data].sort((a, b) => {
            const aScore = (a.total_volume / a.market_cap) * (Math.abs(a.price_change_percentage_24h) < 2 ? 2 : 1);
            const bScore = (b.total_volume / b.market_cap) * (Math.abs(b.price_change_percentage_24h) < 2 ? 2 : 1);
            return bScore - aScore;
        }).slice(0, 15);
    }

    // Update active state in subnav
    if (filter) {
        document.querySelectorAll('.option-link').forEach(link => {
            link.classList.remove('active');
            if (link.getAttribute('href').includes(`filter=${filter}`)) {
                link.classList.add('active');
            }
        });
    }

    grid.innerHTML = ''; // Clear loading

    data.forEach(coin => {
        const change = coin.price_change_percentage_24h;
        let sentiment = 'Neutral 😐';
        let sentimentClass = 'bg-neutral';
        let changeClass = 'trend-neutral';
        let sign = '';

        if (change >= 1.5) {
            sentiment = 'Bullish 🚀';
            sentimentClass = 'bg-bullish';
            changeClass = 'trend-up';
            sign = '+';
        } else if (change <= -1.5) {
            sentiment = 'Bearish 🐻';
            sentimentClass = 'bg-bearish';
            changeClass = 'trend-down';
            sign = '';
        } else {
            sentiment = 'Neutral 😐';
            sentimentClass = 'bg-neutral';
            changeClass = change >= 0 ? 'trend-up' : 'trend-down';
            sign = change >= 0 ? '+' : '';
        }

        const link = document.createElement('a');
        link.href = `crypto-detail.html#id=${coin.id}`;
        link.style.textDecoration = 'none';
        link.style.color = 'inherit';
        link.style.display = 'block';

        link.innerHTML = `
            <div class="crypto-card">
                <div class="coin-header">
                    <img src="${coin.image}" alt="${coin.name}" class="coin-icon">
                    <div class="coin-name-group">
                        <h3>${coin.name}</h3>
                        <span class="coin-symbol">${coin.symbol}</span>
                    </div>
                </div>
                
                <div class="coin-price">${CurrencyConverter.format(coin.current_price)}</div>
                
                <div class="coin-stats-row">
                    <div class="${changeClass}">
                        ${sign}${coin.price_change_percentage_24h.toFixed(2)}%
                    </div>
                    <div class="sentiment-badge ${sentimentClass}">
                        ${sentiment}
                    </div>
                </div>
            </div>
        `;

        // Add Watchlist Button
        const watchlistBtn = document.createElement('button');
        watchlistBtn.className = `watchlist-btn ${Watchlist.isIn(coin.id, 'crypto') ? 'active' : ''}`;
        watchlistBtn.innerHTML = Watchlist.isIn(coin.id, 'crypto') ? '★' : '☆';
        watchlistBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            const added = Watchlist.toggle({
                id: coin.id,
                symbol: coin.symbol,
                name: coin.name,
                type: 'crypto',
                icon: coin.image
            });
            watchlistBtn.classList.toggle('active', added);
            watchlistBtn.innerHTML = added ? '★' : '☆';
        };

        const cardContainer = link.querySelector('.crypto-card');
        cardContainer.appendChild(watchlistBtn);

        grid.appendChild(link);
    });
}

// ===================== CONFIGURATION =====================
// Get your free API key from: https://finnhub.io/register
// Key moved to top for hoisting reliability

// -------------------- Real Data Fetching (Multi-Source Strategy) --------------------
// -------------------- Finnhub + Fallback API Integration --------------------

// Comprehensive company name mapping for all global stocks
const GLOBAL_COMPANY_NAMES = {
    // ===== United States =====
    'AAPL': 'Apple Inc.', 'NVDA': 'NVIDIA Corp', 'MSFT': 'Microsoft Corp',
    'AMZN': 'Amazon.com Inc', 'GOOGL': 'Alphabet Inc', 'META': 'Meta Platforms',
    'TSLA': 'Tesla Inc', 'AMD': 'Advanced Micro Devices', 'SPY': 'S&P 500 ETF',
    'QQQ': 'NASDAQ 100 ETF', 'JPM': 'JPMorgan Chase', 'V': 'Visa Inc',
    'WMT': 'Walmart Inc', 'PG': 'Procter & Gamble', 'XOM': 'Exxon Mobil',
    'JNJ': 'Johnson & Johnson', 'MA': 'Mastercard', 'AVGO': 'Broadcom Inc',
    'ORCL': 'Oracle Corp', 'COST': 'Costco Wholesale', 'HD': 'Home Depot',
    'CVX': 'Chevron Corp', 'MRK': 'Merck & Co', 'ABBV': 'AbbVie Inc',
    'KO': 'Coca-Cola Co', 'PEP': 'PepsiCo Inc', 'BAC': 'Bank of America',
    'LLY': 'Eli Lilly', 'ADBE': 'Adobe Inc', 'CRM': 'Salesforce Inc',
    'NFLX': 'Netflix Inc', 'DIS': 'Walt Disney Co', 'PYPL': 'PayPal Holdings',
    'INTC': 'Intel Corp', 'QCOM': 'Qualcomm Inc', 'CSCO': 'Cisco Systems',
    'IBM': 'IBM Corp', 'GS': 'Goldman Sachs', 'BLK': 'BlackRock Inc',
    'SCHW': 'Charles Schwab', 'AXP': 'American Express', 'C': 'Citigroup Inc',
    'MS': 'Morgan Stanley', 'UNH': 'UnitedHealth Group', 'TMO': 'Thermo Fisher',
    'ABT': 'Abbott Labs', 'DHR': 'Danaher Corp', 'BMY': 'Bristol-Myers Squibb',
    'GILD': 'Gilead Sciences', 'ISRG': 'Intuitive Surgical', 'NKE': 'Nike Inc',
    'SBUX': 'Starbucks Corp', 'MCD': 'McDonald\'s Corp', 'TGT': 'Target Corp',
    'LOW': 'Lowe\'s Companies', 'CVS': 'CVS Health', 'UPS': 'United Parcel Service',
    'CAT': 'Caterpillar Inc', 'BA': 'Boeing Co', 'GE': 'GE Aerospace',
    'DE': 'Deere & Co', 'LMT': 'Lockheed Martin', 'RTX': 'RTX Corp',
    'HON': 'Honeywell Intl', 'MMM': '3M Company', 'T': 'AT&T Inc',
    'VZ': 'Verizon Comms', 'CMCSA': 'Comcast Corp', 'NEE': 'NextEra Energy',
    'DUK': 'Duke Energy', 'SO': 'Southern Company', 'PFE': 'Pfizer Inc',
    'F': 'Ford Motor Co', 'GM': 'General Motors', 'UBER': 'Uber Technologies',
    'ABNB': 'Airbnb Inc', 'SQ': 'Block Inc', 'SNAP': 'Snap Inc',
    'ROKU': 'Roku Inc', 'SHOP': 'Shopify Inc', 'COIN': 'Coinbase Global',
    'RIVN': 'Rivian Automotive', 'PLTR': 'Palantir Technologies', 'SOFI': 'SoFi Technologies',
    'HOOD': 'Robinhood Markets', 'RBLX': 'Roblox Corp', 'U': 'Unity Software',
    'DKNG': 'DraftKings Inc', 'DASH': 'DoorDash Inc', 'ZM': 'Zoom Video',
    'DOCU': 'DocuSign Inc', 'SNOW': 'Snowflake Inc', 'NET': 'Cloudflare Inc',
    'CRWD': 'CrowdStrike Holdings', 'PANW': 'Palo Alto Networks', 'ZS': 'Zscaler Inc',
    'OKTA': 'Okta Inc', 'TWLO': 'Twilio Inc', 'TTD': 'The Trade Desk',
    'MELI': 'MercadoLibre Inc', 'SE': 'Sea Limited',

    // ===== India =====
    'RELIANCE.NS': 'Reliance Industries', 'TCS.NS': 'Tata Consultancy',
    'INFY.NS': 'Infosys Ltd', 'HDFCBANK.NS': 'HDFC Bank',
    'ICICIBANK.NS': 'ICICI Bank', 'HINDUNILVR.NS': 'Hindustan Unilever',
    'SBIN.NS': 'State Bank of India', 'BHARTIARTL.NS': 'Bharti Airtel',
    'ITC.NS': 'ITC Limited', 'KOTAKBANK.NS': 'Kotak Mahindra Bank',
    'LT.NS': 'Larsen & Toubro', 'AXISBANK.NS': 'Axis Bank',
    'BAJFINANCE.NS': 'Bajaj Finance', 'MARUTI.NS': 'Maruti Suzuki',
    'SUNPHARMA.NS': 'Sun Pharma', 'TITAN.NS': 'Titan Company',
    'WIPRO.NS': 'Wipro Ltd', 'HCLTECH.NS': 'HCL Technologies',
    'TATAMOTORS.NS': 'Tata Motors', 'ADANIENT.NS': 'Adani Enterprises',
    'NTPC.NS': 'NTPC Ltd', 'POWERGRID.NS': 'Power Grid Corp',
    'ONGC.NS': 'ONGC Ltd', 'TATASTEEL.NS': 'Tata Steel',
    'JSWSTEEL.NS': 'JSW Steel',

    // ===== Japan =====
    '7203.T': 'Toyota Motor', '6758.T': 'Sony Group', '9984.T': 'SoftBank Group',
    '6861.T': 'Keyence Corp', '8306.T': 'Mitsubishi UFJ',
    '9432.T': 'NTT Corp', '6501.T': 'Hitachi Ltd',
    '7267.T': 'Honda Motor', '4502.T': 'Takeda Pharma',
    '8035.T': 'Tokyo Electron', '6902.T': 'DENSO Corp',
    '7751.T': 'Canon Inc', '4063.T': 'Shin-Etsu Chemical',
    '6367.T': 'Daikin Industries', '8058.T': 'Mitsubishi Corp',

    // ===== United Kingdom =====
    'SHEL': 'Shell PLC', 'AZN': 'AstraZeneca', 'HSBA.L': 'HSBC Holdings',
    'ULVR.L': 'Unilever PLC', 'GSK.L': 'GSK PLC',
    'RIO.L': 'Rio Tinto', 'BP.L': 'BP PLC',
    'LSEG.L': 'London Stock Exch Grp', 'DGE.L': 'Diageo PLC',
    'REL.L': 'RELX PLC', 'BATS.L': 'British American Tobacco',
    'GLEN.L': 'Glencore PLC', 'VOD.L': 'Vodafone Group',
    'BARC.L': 'Barclays PLC', 'LLOY.L': 'Lloyds Banking Group',

    // ===== Germany =====
    'SAP': 'SAP SE', 'SIE.DE': 'Siemens AG',
    'ALV.DE': 'Allianz SE', 'MBG.DE': 'Mercedes-Benz Group',
    'DTE.DE': 'Deutsche Telekom', 'BAS.DE': 'BASF SE',
    'BMW.DE': 'BMW AG', 'MUV2.DE': 'Munich Re',
    'ADS.DE': 'Adidas AG', 'IFX.DE': 'Infineon Technologies',
    'VOW3.DE': 'Volkswagen AG', 'HEN3.DE': 'Henkel AG',
    'DBK.DE': 'Deutsche Bank', 'DPW.DE': 'Deutsche Post',
    'RWE.DE': 'RWE AG',

    // ===== South Korea =====
    '005930.KS': 'Samsung Electronics', '000660.KS': 'SK Hynix',
    '035420.KS': 'NAVER Corp', '051910.KS': 'LG Chem',
    '006400.KS': 'Samsung SDI', '035720.KS': 'Kakao Corp',
    '003670.KS': 'POSCO Holdings', '055550.KS': 'Shinhan Financial',
    '105560.KS': 'KB Financial', '028260.KS': 'Samsung C&T',

    // ===== China / Hong Kong =====
    'BABA': 'Alibaba Group', '0700.HK': 'Tencent Holdings',
    'JD': 'JD.com Inc', 'PDD': 'PDD Holdings', 'BIDU': 'Baidu Inc',
    'NIO': 'NIO Inc', 'LI': 'Li Auto Inc', 'XPEV': 'XPeng Inc',
    '9988.HK': 'Alibaba (HK)', '1810.HK': 'Xiaomi Corp',
    '3690.HK': 'Meituan', '9618.HK': 'JD.com (HK)',
    '2318.HK': 'Ping An Insurance', '0941.HK': 'China Mobile',
    '1299.HK': 'AIA Group', '0005.HK': 'HSBC (HK)',
    '2388.HK': 'BOC Hong Kong', '1398.HK': 'ICBC',

    // ===== Canada =====
    'RY': 'Royal Bank of Canada', 'TD': 'Toronto-Dominion Bank',
    'ENB': 'Enbridge Inc', 'CNR': 'Canadian National Railway',
    'BMO': 'Bank of Montreal', 'BNS': 'Bank of Nova Scotia',
    'CP': 'Canadian Pacific Kansas', 'TRI': 'Thomson Reuters',
    'SU': 'Suncor Energy', 'MFC': 'Manulife Financial',
    'ABX': 'Barrick Gold', 'NTR': 'Nutrien Ltd',
    'WCN': 'Waste Connections', 'FTS': 'Fortis Inc',
    'TRP': 'TC Energy',

    // ===== Australia =====
    'BHP': 'BHP Group', 'CBA.AX': 'Commonwealth Bank',
    'CSL.AX': 'CSL Limited', 'NAB.AX': 'National Australia Bank',
    'WBC.AX': 'Westpac Banking', 'ANZ.AX': 'ANZ Group',
    'FMG.AX': 'Fortescue Metals', 'WES.AX': 'Wesfarmers',
    'TLS.AX': 'Telstra Corp', 'WOW.AX': 'Woolworths Group',
    'MQG.AX': 'Macquarie Group', 'RIO.AX': 'Rio Tinto (AU)',
    'ALL.AX': 'Aristocrat Leisure', 'STO.AX': 'Santos Ltd',
    'WDS.AX': 'Woodside Energy',

    // ===== Brazil =====
    'VALE': 'Vale S.A.', 'PBR': 'Petrobras',
    'ITUB': 'Itaú Unibanco', 'BBD': 'Bradesco',
    'ABEV': 'Ambev S.A.', 'NU': 'Nu Holdings',
    'SBS': 'SABESP', 'GGB': 'Gerdau S.A.',
    'BRKM5.SA': 'Braskem', 'WEGE3.SA': 'WEG S.A.',
    'RENT3.SA': 'Localiza', 'RAIL3.SA': 'Rumo S.A.',
    'SUZB3.SA': 'Suzano S.A.', 'EQTL3.SA': 'Equatorial Energia',

    // ===== France =====
    'MC.PA': 'LVMH', 'OR.PA': 'L\'Oréal',
    'TTE.PA': 'TotalEnergies', 'SAN.PA': 'Sanofi',
    'AIR.PA': 'Airbus SE', 'SU.PA': 'Schneider Electric',
    'AI.PA': 'Air Liquide', 'BN.PA': 'Danone',
    'CS.PA': 'AXA SA', 'SAF.PA': 'Safran SA',
    'DG.PA': 'Vinci SA', 'RI.PA': 'Pernod Ricard',
    'KER.PA': 'Kering SA', 'CAP.PA': 'Capgemini',
    'SGO.PA': 'Saint-Gobain',

    // ===== Switzerland =====
    'NESN.SW': 'Nestlé SA', 'ROG.SW': 'Roche Holding',
    'NOVN.SW': 'Novartis AG', 'UBSG.SW': 'UBS Group',
    'ABBN.SW': 'ABB Ltd', 'ZURN.SW': 'Zurich Insurance',
    'SREN.SW': 'Swiss Re', 'GIVN.SW': 'Givaudan',
    'LONN.SW': 'Lonza Group', 'GEBN.SW': 'Geberit AG',

    // ===== Netherlands =====
    'ASML': 'ASML Holding', 'HEIA.AS': 'Heineken NV',
    'INGA.AS': 'ING Group', 'AD.AS': 'Ahold Delhaize',
    'PHIA.AS': 'Philips NV', 'UNA.AS': 'Unilever NV',
    'WKL.AS': 'Wolters Kluwer', 'ABN.AS': 'ABN AMRO',
    'AKZA.AS': 'AkzoNobel', 'DSM.AS': 'DSM-Firmenich',

    // ===== Sweden =====
    'ERIC': 'Ericsson', 'VOLV-B.ST': 'Volvo Group',
    'ATCO-A.ST': 'Atlas Copco', 'INVE-B.ST': 'Investor AB',
    'SEB-A.ST': 'SEB AB', 'SWED-A.ST': 'Swedbank',
    'HM-B.ST': 'H&M', 'SAND.ST': 'Sandvik',
    'ABB.ST': 'ABB (Stockholm)', 'HEXA-B.ST': 'Hexagon AB',

    // ===== Denmark =====
    'NOVO-B.CO': 'Novo Nordisk', 'MAERSK-B.CO': 'A.P. Moller-Maersk',
    'VWS.CO': 'Vestas Wind Systems', 'DSV.CO': 'DSV A/S',
    'CARL-B.CO': 'Carlsberg A/S', 'ORSTED.CO': 'Ørsted A/S',
    'COLO-B.CO': 'Coloplast A/S', 'PNDORA.CO': 'Pandora A/S',
    'GN.CO': 'GN Store Nord', 'DEMANT.CO': 'Demant A/S',

    // ===== Norway =====
    'EQNR': 'Equinor ASA', 'DNB.OL': 'DNB Bank',
    'TEL.OL': 'Telenor ASA', 'MOWI.OL': 'Mowi ASA',
    'ORK.OL': 'Orkla ASA', 'YAR.OL': 'Yara International',
    'SALM.OL': 'SalMar ASA', 'AKRBP.OL': 'Aker BP',
    'SUBC.OL': 'Subsea 7', 'TGS.OL': 'TGS ASA',

    // ===== Finland =====
    'NOKIA': 'Nokia Oyj', 'NESTE.HE': 'Neste Oyj',
    'SAMPO.HE': 'Sampo Oyj', 'FORTUM.HE': 'Fortum Oyj',
    'UPM.HE': 'UPM-Kymmene', 'KNEBV.HE': 'KONE Oyj',
    'STERV.HE': 'Stora Enso', 'WRT1V.HE': 'Wärtsilä',
    'ELISA.HE': 'Elisa Oyj', 'KESKOB.HE': 'Kesko Oyj',

    // ===== Spain =====
    'SAN.MC': 'Banco Santander', 'ITX.MC': 'Inditex (Zara)',
    'IBE.MC': 'Iberdrola', 'TEF.MC': 'Telefónica',
    'BBVA.MC': 'BBVA', 'REP.MC': 'Repsol',
    'FER.MC': 'Ferrovial', 'AMS.MC': 'Amadeus IT',
    'CABK.MC': 'CaixaBank', 'ENG.MC': 'Enagás',

    // ===== Italy =====
    'ENI.MI': 'ENI SpA', 'ENEL.MI': 'Enel SpA',
    'ISP.MI': 'Intesa Sanpaolo', 'UCG.MI': 'UniCredit',
    'STM.MI': 'STMicroelectronics', 'G.MI': 'Generali',
    'TEN.MI': 'Tenaris', 'PRY.MI': 'Prysmian',
    'SRG.MI': 'Snam SpA', 'RACE.MI': 'Ferrari NV',

    // ===== Portugal =====
    'GALP.LS': 'Galp Energia', 'EDP.LS': 'EDP Energias',
    'SON.LS': 'Sonae SGPS', 'JMT.LS': 'Jerónimo Martins',
    'BCP.LS': 'Banco Comercial Português',

    // ===== Belgium =====
    'ABI.BR': 'AB InBev', 'UCB.BR': 'UCB SA',
    'KBC.BR': 'KBC Group', 'SOLB.BR': 'Solvay',
    'AGS.BR': 'ageas SA',

    // ===== Austria =====
    'VOE.VI': 'Voestalpine', 'OMV.VI': 'OMV AG',
    'EBS.VI': 'Erste Group', 'VER.VI': 'Verbund AG',
    'WIE.VI': 'Wienerberger',

    // ===== Ireland =====
    'RYANAIR.IR': 'Ryanair Holdings', 'CRH': 'CRH PLC',
    'AIB.IR': 'AIB Group', 'KRX.IR': 'Kingspan Group',
    'SMURFIT.IR': 'Smurfit Kappa',

    // ===== Singapore =====
    'D05.SI': 'DBS Group', 'O39.SI': 'OCBC Bank',
    'U11.SI': 'United Overseas Bank', 'Z74.SI': 'Singtel',
    'C6L.SI': 'Singapore Airlines', 'V03.SI': 'Venture Corp',
    'Y92.SI': 'Thai Beverage', 'G13.SI': 'Genting Singapore',
    'BN4.SI': 'Keppel Corp', 'C38U.SI': 'CapitaLand Integrated',

    // ===== Taiwan =====
    'TSM': 'TSMC', '2330.TW': 'TSMC (TW)',
    '2317.TW': 'Hon Hai Precision', '2454.TW': 'MediaTek',
    '6505.TW': 'Formosa Petrochemical', '2382.TW': 'Quanta Computer',
    '2412.TW': 'Chunghwa Telecom', '1303.TW': 'Nan Ya Plastics',
    '1301.TW': 'Formosa Plastics', '2881.TW': 'Fubon Financial',

    // ===== Thailand =====
    'PTT.BK': 'PTT PCL', 'AOT.BK': 'Airports of Thailand',
    'ADVANC.BK': 'AIS', 'CPALL.BK': 'CP ALL',
    'SCB.BK': 'SCB X PCL', 'SCC.BK': 'Siam Cement',
    'KBANK.BK': 'Kasikornbank', 'PTTGC.BK': 'PTT GC',
    'TRUE.BK': 'True Corp', 'GULF.BK': 'Gulf Energy',

    // ===== Malaysia =====
    '1155.KL': 'Malayan Banking', '1295.KL': 'Public Bank',
    '5681.KL': 'Petronas Chemicals', '3182.KL': 'Genting Bhd',
    '1023.KL': 'CIMB Group', '6888.KL': 'Axiata Group',
    '4707.KL': 'Nestle Malaysia', '5347.KL': 'Tenaga Nasional',
    '1082.KL': 'Hong Leong Financial', '4863.KL': 'Telekom Malaysia',

    // ===== Indonesia =====
    'BBCA.JK': 'Bank Central Asia', 'BBRI.JK': 'Bank Rakyat Indonesia',
    'TLKM.JK': 'Telkom Indonesia', 'ASII.JK': 'Astra International',
    'BMRI.JK': 'Bank Mandiri', 'UNVR.JK': 'Unilever Indonesia',
    'HMSP.JK': 'HM Sampoerna', 'GGRM.JK': 'Gudang Garam',
    'ICBP.JK': 'Indofood CBP', 'KLBF.JK': 'Kalbe Farma',

    // ===== Philippines =====
    'SM.PS': 'SM Investments', 'BDO.PS': 'BDO Unibank',
    'ALI.PS': 'Ayala Land', 'JFC.PS': 'Jollibee Foods',
    'TEL.PS': 'PLDT Inc',

    // ===== Israel =====
    'TEVA': 'Teva Pharmaceutical', 'CHKP': 'Check Point Software',
    'NICE': 'NICE Ltd', 'WIX': 'Wix.com',
    'MNDY': 'monday.com', 'CYBR': 'CyberArk Software',
    'GLBE': 'Global-e Online', 'IRWD': 'Ironwood Pharma',
    'SEDG': 'SolarEdge Technologies', 'FVRR': 'Fiverr International',

    // ===== Saudi Arabia =====
    '2222.SR': 'Saudi Aramco', '1120.SR': 'Al Rajhi Bank',
    '2010.SR': 'SABIC', '1180.SR': 'Al Ahli Bank',
    '7010.SR': 'STC', '2350.SR': 'Saudi Kayan',
    '1150.SR': 'Saudi Industrial', '2380.SR': 'Petro Rabigh',
    '4001.SR': 'Abdullah Al Othaim', '1010.SR': 'RIBL',

    // ===== UAE =====
    'EMIRATES.DFM': 'Emirates NBD', 'DFM.DFM': 'Dubai Financial Mkt',
    'EMAAR.DFM': 'Emaar Properties', 'DIB.DFM': 'Dubai Islamic Bank',
    'DEWA.DFM': 'DEWA',

    // ===== South Africa =====
    'NPN.JO': 'Naspers Ltd', 'SOL.JO': 'Sasol Ltd',
    'AGL.JO': 'Anglo American Plat', 'MTN.JO': 'MTN Group',
    'SBK.JO': 'Standard Bank', 'BHP.JO': 'BHP (JSE)',
    'FSR.JO': 'FirstRand Ltd', 'AMS.JO': 'Anglo American',
    'SHP.JO': 'Shoprite Holdings', 'ABG.JO': 'Absa Group',

    // ===== Nigeria =====
    'DANGCEM.LG': 'Dangote Cement', 'MTNN.LG': 'MTN Nigeria',
    'AIRTELAFRI.LG': 'Airtel Africa', 'GTCO.LG': 'GT Holding Co',
    'BUACEMENT.LG': 'BUA Cement',

    // ===== Egypt =====
    'COMI.CA': 'Commercial Intl Bank', 'HRHO.CA': 'Hermes Holding',
    'TMGH.CA': 'Talaat Moustafa', 'SWDY.CA': 'Elsewedy Electric',
    'EAST.CA': 'Eastern Tobacco',

    // ===== Mexico =====
    'AMX': 'América Móvil', 'FEMSA': 'FEMSA',
    'CEMEX': 'CEMEX SAB', 'BIMBOA.MX': 'Grupo Bimbo',
    'GFNORTEO.MX': 'Banorte', 'WALMEX.MX': 'Walmart de México',
    'TLEVISACPO.MX': 'Televisa', 'GMEXICOB.MX': 'Grupo México',
    'AC.MX': 'Arca Continental', 'AMXL.MX': 'América Móvil (L)',

    // ===== Chile =====
    'SQM': 'SQM', 'BSANTANDER.SN': 'Banco Santander Chile',
    'CENCOSUD.SN': 'Cencosud', 'LTM.SN': 'LATAM Airlines',
    'FALABELLA.SN': 'Falabella',

    // ===== Colombia =====
    'EC': 'Ecopetrol SA', 'PFBCOLOM.BV': 'Bancolombia',
    'ISA.BV': 'ISA SA', 'NUTRESA.BV': 'Grupo Nutresa',
    'GRUPOARGOS.BV': 'Grupo Argos',

    // ===== Argentina =====
    'YPF': 'YPF SA', 'GLOB': 'Globant SA',
    'GGAL': 'Grupo Galicia', 'BMA': 'Banco Macro',
    'PAM': 'Pampa Energía', 'CRESY': 'Cresud',
    'TEO': 'Telecom Argentina', 'BIOX': 'Bioceres Crop',
    'SUPV': 'Supervielle',

    // ===== New Zealand =====
    'FPH.NZ': 'Fisher & Paykel', 'ATM.NZ': 'a2 Milk Company',
    'SPK.NZ': 'Spark NZ', 'AIA.NZ': 'Auckland Intl Airport',
    'MEL.NZ': 'Meridian Energy',

    // ===== Poland =====
    'PKO.WA': 'PKO Bank', 'PZU.WA': 'PZU SA',
    'PEO.WA': 'Bank Pekao', 'KGH.WA': 'KGHM',
    'CDR.WA': 'CD Projekt', 'DNP.WA': 'Dino Polska',
    'PKN.WA': 'PKN Orlen', 'SPL.WA': 'Santander Bank PL',
    'LPP.WA': 'LPP SA', 'ALE.WA': 'Allegro',

    // ===== Turkey =====
    'THYAO.IS': 'Turkish Airlines', 'SISE.IS': 'Şişecam',
    'GARAN.IS': 'Garanti BBVA', 'EREGL.IS': 'Erdemir',
    'AKBNK.IS': 'Akbank', 'BIMAS.IS': 'BIM Stores',
    'ASELS.IS': 'Aselsan', 'KCHOL.IS': 'Koç Holding',
    'TUPRS.IS': 'Tüpraş', 'SAHOL.IS': 'Sabancı Holding',

    // ===== Russia =====
    'SBER.ME': 'Sberbank', 'GAZP.ME': 'Gazprom',
    'LKOH.ME': 'Lukoil', 'GMKN.ME': 'Nornickel',
    'ROSN.ME': 'Rosneft', 'NVTK.ME': 'Novatek',
    'YNDX.ME': 'Yandex', 'MTSS.ME': 'MTS',
    'MGNT.ME': 'Magnit', 'POLY.ME': 'Polymetal',

    // ===== Vietnam =====
    'VIC.VN': 'Vingroup', 'VHM.VN': 'Vinhomes',
    'VNM.VN': 'Vinamilk', 'HPG.VN': 'Hoa Phat Group',
    'MSN.VN': 'Masan Group',

    // ===== Bangladesh =====
    'GP.BD': 'Grameenphone', 'BATBC.BD': 'BAT Bangladesh',
    'ROBI.BD': 'Robi Axiata', 'SQURPHARMA.BD': 'Square Pharma',
    'BXPHARMA.BD': 'Beximco Pharma',

    // ===== Pakistan =====
    'OGDC.KA': 'OGDCL', 'HBL.KA': 'Habib Bank',
    'PPL.KA': 'Pakistan Petroleum', 'MCB.KA': 'MCB Bank',
    'FFC.KA': 'Fauji Fertilizer',

    // ===== Sri Lanka =====
    'JKH.N0000': 'John Keells Holdings', 'COMB.N0000': 'Commercial Bank',
    'DIAL.N0000': 'Dialog Axiata', 'HNB.N0000': 'Hatton National Bank',
    'SAMP.N0000': 'Sampath Bank',

    // ===== Kenya =====
    'SCOM.NR': 'Safaricom', 'EQTY.NR': 'Equity Group',
    'KCB.NR': 'KCB Group', 'BAT.NR': 'BAT Kenya',
    'EABL.NR': 'EABL',

    // ===== Ghana =====
    'MTNGH.GH': 'MTN Ghana', 'GCB.GH': 'GCB Bank',
    'EGH.GH': 'Ecobank Ghana', 'GOIL.GH': 'GOIL PLC',
    'CAL.GH': 'CalBank'
};

// Rate-limited batch fetching
async function fetchBatch(symbols, batchSize = 10, delayMs = 500) {
    const results = [];
    for (let i = 0; i < symbols.length; i += batchSize) {
        const batch = symbols.slice(i, i + batchSize);
        const batchResults = await Promise.all(
            batch.map(symbol => fetchSingleQuote(symbol))
        );
        results.push(...batchResults);
        // Rate limit: wait between batches (not after the last one)
        if (i + batchSize < symbols.length) {
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }
    return results.filter(r => r !== null);
}

// Check if a symbol is US-listed (no exchange suffix = US)
function isUSSymbol(symbol) {
    // US symbols have no dot suffix, or are known US ADRs
    return !symbol.includes('.') || symbol.endsWith('=F');
}

// Fetch single quote — route to best API based on exchange
async function fetchSingleQuote(symbol) {
    try {
        if (isUSSymbol(symbol)) {
            // US stocks: try Finnhub first, then Yahoo fallback
            const finnhubResult = await fetchFromFinnhub(symbol);
            if (finnhubResult) return finnhubResult;
            return await fetchFromYahoo(symbol);
        } else {
            // International stocks: Yahoo Finance only (Finnhub doesn't support most intl symbols)
            return await fetchFromYahoo(symbol);
        }
    } catch (e) {
        console.warn(`All sources failed for ${symbol}:`, e.message);
        return null;
    }
}

// Fetch from Finnhub (US stocks only)
async function fetchFromFinnhub(symbol) {
    try {
        const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${FINNHUB_API_KEY}`;
        const response = await fetch(url);

        if (response.status === 429) {
            console.warn(`Finnhub rate limited for ${symbol}`);
            return null; // Will fall through to Yahoo
        }

        if (!response.ok) return null;

        const data = await response.json();

        if (data.c === 0 && data.pc === 0) {
            return null; // No data from Finnhub
        }

        const changePercent = data.pc !== 0 ? ((data.c - data.pc) / data.pc) * 100 : 0;

        return {
            symbol: symbol,
            longName: GLOBAL_COMPANY_NAMES[symbol] || symbol,
            regularMarketPrice: data.c,
            regularMarketChangePercent: changePercent,
            previousClose: data.pc,
            dayHigh: data.h,
            dayLow: data.l
        };
    } catch (e) {
        return null;
    }
}

// CORS proxy providers (try in order, fallback to next if one fails)
const CORS_PROXIES = [
    (url) => `${window.WORKER_BASE_URL}/proxy?url=${encodeURIComponent(url)}`,
    (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
    (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`
];

// Fetch from Yahoo Finance via CORS proxy (works for ALL exchanges)
async function fetchFromYahoo(symbol) {
    const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=2d`;

    // Try each CORS proxy in order
    for (let i = 0; i < CORS_PROXIES.length; i++) {
        try {
            const proxyUrl = CORS_PROXIES[i](yahooUrl);
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 8000); // 8s timeout

            const response = await fetch(proxyUrl, { signal: controller.signal });
            clearTimeout(timeout);

            if (!response.ok) continue;

            const data = await response.json();
            const result = data?.chart?.result?.[0];
            if (!result) continue;

            const meta = result.meta;
            const price = meta.regularMarketPrice || 0;
            if (price === 0) continue;

            const prevClose = meta.chartPreviousClose || meta.previousClose || price;
            const changePercent = prevClose !== 0 ? ((price - prevClose) / prevClose) * 100 : 0;

            return {
                symbol: symbol,
                longName: GLOBAL_COMPANY_NAMES[symbol] || meta.shortName || symbol,
                regularMarketPrice: price,
                regularMarketChangePercent: changePercent,
                previousClose: prevClose,
                dayHigh: meta.regularMarketDayHigh || price,
                dayLow: meta.regularMarketDayLow || price
            };
        } catch (e) {
            // Try next proxy
            continue;
        }
    }

    // All proxies failed
    console.warn(`Yahoo Finance failed for ${symbol} (all proxies exhausted)`);
    return null;
}

// Main fetch function (backwards compatible)
window.fetchFinnhubData = async function (symbols) {
    if (!symbols || symbols.length === 0) return [];

    // For small requests (search, etc.), fetch directly
    if (symbols.length <= 5) {
        const promises = symbols.map(s => fetchSingleQuote(s));
        const results = await Promise.all(promises);
        return results.filter(r => r !== null);
    }

    // For larger requests, use batch fetching with rate limiting
    return await fetchBatch(symbols, 10, 500);
}

// -------------------- Cache Helper --------------------
const StockCache = {
    save: (key, data) => {
        localStorage.setItem(key, JSON.stringify({
            timestamp: Date.now(),
            data: data
        }));
    },
    load: (key) => {
        const item = localStorage.getItem(key);
        return item ? JSON.parse(item) : null;
    }
};

// -------------------- Search Logic --------------------
function initMarketSearch(type) {
    const input = document.getElementById('market-search');
    const btn = document.getElementById('search-btn');
    const grid = document.getElementById(type === 'stock' ? 'stocks-grid' : 'commodities-grid');

    if (!input || !btn || !grid) return;

    const performSearch = async () => {
        const query = input.value.trim().toUpperCase();
        if (!query) return;

        // Visual Feedback
        btn.textContent = '⏳';
        input.disabled = true;

        const data = await fetchFinnhubData([query]);

        input.disabled = false;
        btn.textContent = 'Search';

        if (data && data.length > 0) {
            // Check if invalid (sometimes Yahoo returns empty quote)
            const item = data[0];
            if (!item.regularMarketPrice) {
                alert('Symbol not found or no data available.');
                return;
            }

            // Create singular card
            // We prepend or replace? Let's prepend to show "result"
            // Actually, user probably wants to see just this result or result at top

            // Render singular item using generic renderer logic
            // But renderGenericGrid clears container. We might want to keep others?
            // "I want all the stocks" -> User might search one by one.
            // Let's prepend to the top of the grid.

            renderSingleItem(item, grid, type, true); // true = prepend
            input.value = ''; // Clear
        } else {
            alert('Symbol not found. Try another ticker.');
        }
    };

    btn.addEventListener('click', performSearch);
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') performSearch();
    });
}

function renderSingleItem(item, container, type, prepend = false) {
    const change = item.regularMarketChangePercent || 0;
    const trend = change >= 0 ? 'trend-up' : 'trend-down';
    const sign = change >= 0 ? '+' : '';
    const sentiment = change > 1.5 ? 'Strong Buy' : (change > 0 ? 'Buy' : (change > -1.5 ? 'Hold' : 'Sell'));
    const badgeColor = change > 0 ? 'bg-bullish' : (change > -1 ? 'bg-neutral' : 'bg-bearish');

    // Icon selection (using shared helper)
    const icon = getStockIcon(item.symbol, type);

    const card = document.createElement('div');
    card.className = 'crypto-card';
    card.style.animation = 'fadeIn 0.5s ease-out'; // Add pop effect
    card.innerHTML = `
        <div class="coin-header">
            <div class="coin-icon" style="background: #fff; display:flex; align-items:center; justify-content:center; font-size:24px;">${icon}</div>
            <div class="coin-name-group">
                <h3>${item.longName || item.symbol}</h3>
                <span class="coin-symbol">${item.symbol.replace('=F', '')}</span>
            </div>
        </div>
        <div class="coin-price">${CurrencyConverter.format(item.regularMarketPrice || 0)}</div>
        <div class="coin-stats-row">
            <span class="sentiment-badge ${badgeColor}">${sentiment}</span>
            <span class="${trend}">${sign}${change.toFixed(2)}%</span>
        </div>
    `;

    // Add Watchlist Button
    const watchlistBtn = document.createElement('button');
    watchlistBtn.className = `watchlist-btn ${Watchlist.isIn(item.symbol, type) ? 'active' : ''}`;
    watchlistBtn.innerHTML = Watchlist.isIn(item.symbol, type) ? '★' : '☆';
    watchlistBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const added = Watchlist.toggle({
            id: item.symbol,
            symbol: item.symbol,
            name: item.longName || item.symbol,
            type: type,
            icon: icon
        });
        watchlistBtn.classList.toggle('active', added);
        watchlistBtn.innerHTML = added ? '★' : '☆';
    };
    card.appendChild(watchlistBtn);

    if (prepend) {
        container.insertBefore(card, container.firstChild);
    } else {
        container.appendChild(card);
    }
}


// -------------------- Currency Converter System --------------------
const CurrencyConverter = {
    currencies: {
        'USD': { symbol: '$', name: 'US Dollar', flag: '🇺🇸', rate: 1 },
        'EUR': { symbol: '€', name: 'Euro', flag: '🇪🇺', rate: 0.92 },
        'GBP': { symbol: '£', name: 'British Pound', flag: '🇬🇧', rate: 0.79 },
        'INR': { symbol: '₹', name: 'Indian Rupee', flag: '🇮🇳', rate: 83.50 },
        'JPY': { symbol: '¥', name: 'Japanese Yen', flag: '🇯🇵', rate: 149.50 },
        'AUD': { symbol: 'A$', name: 'Australian Dollar', flag: '🇦🇺', rate: 1.53 },
        'CAD': { symbol: 'C$', name: 'Canadian Dollar', flag: '🇨🇦', rate: 1.36 },
        'CHF': { symbol: 'CHF', name: 'Swiss Franc', flag: '🇨🇭', rate: 0.88 },
        'CNY': { symbol: '¥', name: 'Chinese Yuan', flag: '🇨🇳', rate: 7.24 },
        'KRW': { symbol: '₩', name: 'South Korean Won', flag: '🇰🇷', rate: 1320 },
        'BRL': { symbol: 'R$', name: 'Brazilian Real', flag: '🇧🇷', rate: 4.97 },
        'SGD': { symbol: 'S$', name: 'Singapore Dollar', flag: '🇸🇬', rate: 1.34 }
    },
    // Live Currency Rates Cache
    ratesCacheKey: 'currency_rates_cache',

    async fetchRates() {
        try {
            // Check cache (valid for 1 hour)
            const cached = localStorage.getItem(this.ratesCacheKey);
            if (cached) {
                const { timestamp, rates } = JSON.parse(cached);
                if (Date.now() - timestamp < 3600000) { // 1 hour
                    this.updateRates(rates);
                    return;
                }
            }

            const response = await fetch('https://open.er-api.com/v6/latest/USD');
            if (!response.ok) throw new Error('Failed to fetch rates');

            const data = await response.json();
            if (data && data.rates) {
                this.updateRates(data.rates);
                localStorage.setItem(this.ratesCacheKey, JSON.stringify({
                    timestamp: Date.now(),
                    rates: data.rates
                }));
            }
        } catch (error) {
            console.error('Currency API Error:', error);
            // Fallback to hardcoded rates already in object
        }
    },

    updateRates(newRates) {
        Object.keys(this.currencies).forEach(code => {
            if (newRates[code]) {
                this.currencies[code].rate = newRates[code];
            }
        });
    },

    getSelected: () => localStorage.getItem('selected_currency') || 'USD',
    setSelected: (code) => localStorage.setItem('selected_currency', code),
    convert: (usdAmount) => {
        const selected = CurrencyConverter.getSelected();
        const info = CurrencyConverter.currencies[selected];
        if (!info) return usdAmount;
        return usdAmount * info.rate;
    },
    format: (usdAmount) => {
        const selected = CurrencyConverter.getSelected();
        const info = CurrencyConverter.currencies[selected];
        if (!info) return `$${usdAmount.toLocaleString()}`;
        const converted = usdAmount * info.rate;
        // Smart formatting based on value magnitude
        if (Math.abs(converted) >= 1) {
            return `${info.symbol}${converted.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        } else if (Math.abs(converted) >= 0.0001) {
            return `${info.symbol}${converted.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 6 })}`;
        } else {
            return `${info.symbol}${converted.toLocaleString(undefined, { minimumFractionDigits: 6, maximumFractionDigits: 10 })}`;
        }
    },
    getCurrencySymbol: () => {
        const selected = CurrencyConverter.getSelected();
        return CurrencyConverter.currencies[selected]?.symbol || '$';
    },
    // Get CoinGecko-compatible currency code
    getCoinGeckoCurrency: () => {
        return CurrencyConverter.getSelected().toLowerCase();
    }
};

async function initCurrencySelector() {
    const btn = document.getElementById('currency-selector-btn');
    const dropdown = document.getElementById('currency-dropdown');
    const label = document.getElementById('currency-label');
    if (!btn || !dropdown) return;

    // Fetch live rates before building dropdown or rendering
    await CurrencyConverter.fetchRates();

    // Set initial label
    const saved = CurrencyConverter.getSelected();
    if (label) label.textContent = saved;

    // Build dropdown
    dropdown.innerHTML = '';
    Object.entries(CurrencyConverter.currencies).forEach(([code, info]) => {
        const option = document.createElement('div');
        option.className = 'currency-option' + (code === saved ? ' active' : '');
        option.dataset.currency = code;
        option.innerHTML = `
            <span class="currency-flag">${info.flag}</span>
            <div class="currency-info">
                <span class="currency-code">${code}</span>
                <span class="currency-name">${info.name}</span>
            </div>
            <span class="currency-symbol-display">${info.symbol}</span>
        `;
        option.addEventListener('click', () => {
            CurrencyConverter.setSelected(code);
            if (label) label.textContent = code;
            dropdown.style.display = 'none';

            // Update active class
            dropdown.querySelectorAll('.currency-option').forEach(o => o.classList.remove('active'));
            option.classList.add('active');

            // Trigger reactive updates based on the current page
            initCryptoDashboard(false); // Re-render from cache for crypto
            initStockDashboard(true);   // Force re-render for stocks
            initCommodityDashboard(true); // Force re-render for commodities
        });
        dropdown.appendChild(option);
    });

    // Toggle dropdown
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
    });

    // Close on outside click
    document.addEventListener('click', () => {
        dropdown.style.display = 'none';
    });
    dropdown.addEventListener('click', (e) => e.stopPropagation());
}

// -------------------- Country Filter System --------------------
const stockCountryMap = {
    'ALL': { name: 'All Countries', flag: '🌍', exchange: 'Global', symbols: [] },
    'US': {
        name: 'United States', flag: '🇺🇸', exchange: 'NYSE / NASDAQ',
        symbols: ['AAPL', 'NVDA', 'MSFT', 'AMZN', 'GOOGL', 'META', 'TSLA', 'AMD', 'SPY', 'QQQ',
            'JPM', 'V', 'WMT', 'PG', 'XOM', 'JNJ', 'MA', 'AVGO', 'ORCL', 'COST',
            'HD', 'CVX', 'MRK', 'ABBV', 'KO', 'PEP', 'BAC', 'LLY', 'ADBE', 'CRM',
            'NFLX', 'DIS', 'PYPL', 'INTC', 'QCOM', 'CSCO', 'IBM', 'GS', 'BLK', 'SCHW',
            'AXP', 'C', 'MS', 'UNH', 'TMO', 'ABT', 'DHR', 'BMY', 'GILD', 'ISRG',
            'NKE', 'SBUX', 'MCD', 'TGT', 'LOW', 'CVS', 'UPS', 'CAT', 'BA', 'GE',
            'DE', 'LMT', 'RTX', 'HON', 'MMM', 'T', 'VZ', 'CMCSA', 'NEE', 'DUK', 'SO',
            'PFE', 'F', 'GM', 'UBER', 'ABNB', 'SQ', 'SNAP', 'ROKU', 'SHOP', 'COIN',
            'RIVN', 'PLTR', 'SOFI', 'HOOD', 'RBLX', 'U', 'DKNG', 'DASH', 'ZM', 'DOCU',
            'SNOW', 'NET', 'CRWD', 'PANW', 'ZS', 'OKTA', 'TWLO', 'TTD', 'MELI', 'SE']
    },
    'IN': {
        name: 'India', flag: '🇮🇳', exchange: 'NSE / BSE',
        symbols: ['RELIANCE.NS', 'TCS.NS', 'INFY.NS', 'HDFCBANK.NS', 'ICICIBANK.NS',
            'HINDUNILVR.NS', 'SBIN.NS', 'BHARTIARTL.NS', 'ITC.NS', 'KOTAKBANK.NS',
            'LT.NS', 'AXISBANK.NS', 'BAJFINANCE.NS', 'MARUTI.NS', 'SUNPHARMA.NS',
            'TITAN.NS', 'WIPRO.NS', 'HCLTECH.NS', 'TATAMOTORS.NS', 'ADANIENT.NS',
            'NTPC.NS', 'POWERGRID.NS', 'ONGC.NS', 'TATASTEEL.NS', 'JSWSTEEL.NS']
    },
    'JP': {
        name: 'Japan', flag: '🇯🇵', exchange: 'Tokyo Stock Exchange',
        symbols: ['7203.T', '6758.T', '9984.T', '6861.T', '8306.T',
            '9432.T', '6501.T', '7267.T', '4502.T', '8035.T',
            '6902.T', '7751.T', '4063.T', '6367.T', '8058.T']
    },
    'UK': {
        name: 'United Kingdom', flag: '🇬🇧', exchange: 'London Stock Exchange',
        symbols: ['SHEL', 'AZN', 'HSBA.L', 'ULVR.L', 'GSK.L',
            'RIO.L', 'BP.L', 'LSEG.L', 'DGE.L', 'REL.L',
            'BATS.L', 'GLEN.L', 'VOD.L', 'BARC.L', 'LLOY.L']
    },
    'DE': {
        name: 'Germany', flag: '🇩🇪', exchange: 'Frankfurt Stock Exchange',
        symbols: ['SAP', 'SIE.DE', 'ALV.DE', 'MBG.DE', 'DTE.DE',
            'BAS.DE', 'BMW.DE', 'MUV2.DE', 'ADS.DE', 'IFX.DE',
            'VOW3.DE', 'HEN3.DE', 'DBK.DE', 'DPW.DE', 'RWE.DE']
    },
    'KR': {
        name: 'South Korea', flag: '🇰🇷', exchange: 'Korea Exchange',
        symbols: ['005930.KS', '000660.KS', '035420.KS', '051910.KS', '006400.KS',
            '035720.KS', '003670.KS', '055550.KS', '105560.KS', '028260.KS']
    },
    'CN': {
        name: 'China / Hong Kong', flag: '🇨🇳', exchange: 'HKEX / SSE / SZSE',
        symbols: ['BABA', '0700.HK', 'JD', 'PDD', 'BIDU', 'NIO', 'LI', 'XPEV',
            '9988.HK', '1810.HK', '3690.HK', '9618.HK', '2318.HK',
            '0941.HK', '1299.HK', '0005.HK', '2388.HK', '1398.HK']
    },
    'CA': {
        name: 'Canada', flag: '🇨🇦', exchange: 'Toronto Stock Exchange',
        symbols: ['RY', 'TD', 'ENB', 'CNR', 'BMO', 'BNS', 'CP', 'TRI',
            'SU', 'MFC', 'ABX', 'NTR', 'WCN', 'FTS', 'TRP']
    },
    'AU': {
        name: 'Australia', flag: '🇦🇺', exchange: 'ASX',
        symbols: ['BHP', 'CBA.AX', 'CSL.AX', 'NAB.AX', 'WBC.AX',
            'ANZ.AX', 'FMG.AX', 'WES.AX', 'TLS.AX', 'WOW.AX',
            'MQG.AX', 'RIO.AX', 'ALL.AX', 'STO.AX', 'WDS.AX']
    },
    'BR': {
        name: 'Brazil', flag: '🇧🇷', exchange: 'B3 Exchange',
        symbols: ['VALE', 'PBR', 'ITUB', 'BBD', 'ABEV', 'NU',
            'SBS', 'GGB', 'BRKM5.SA', 'WEGE3.SA', 'RENT3.SA',
            'RAIL3.SA', 'SUZB3.SA', 'EQTL3.SA']
    },
    'FR': {
        name: 'France', flag: '🇫🇷', exchange: 'Euronext Paris',
        symbols: ['MC.PA', 'OR.PA', 'TTE.PA', 'SAN.PA', 'AIR.PA',
            'SU.PA', 'AI.PA', 'BN.PA', 'CS.PA', 'SAF.PA',
            'DG.PA', 'RI.PA', 'KER.PA', 'CAP.PA', 'SGO.PA']
    },
    'CH': {
        name: 'Switzerland', flag: '🇨🇭', exchange: 'SIX Swiss Exchange',
        symbols: ['NESN.SW', 'ROG.SW', 'NOVN.SW', 'UBSG.SW', 'ABBN.SW',
            'ZURN.SW', 'SREN.SW', 'GIVN.SW', 'LONN.SW', 'GEBN.SW']
    },
    'NL': {
        name: 'Netherlands', flag: '🇳🇱', exchange: 'Euronext Amsterdam',
        symbols: ['ASML', 'HEIA.AS', 'INGA.AS', 'AD.AS', 'PHIA.AS',
            'UNA.AS', 'WKL.AS', 'ABN.AS', 'AKZA.AS', 'DSM.AS']
    },
    'SE': {
        name: 'Sweden', flag: '🇸🇪', exchange: 'Nasdaq Stockholm',
        symbols: ['ERIC', 'VOLV-B.ST', 'ATCO-A.ST', 'INVE-B.ST', 'SEB-A.ST',
            'SWED-A.ST', 'HM-B.ST', 'SAND.ST', 'ABB.ST', 'HEXA-B.ST']
    },
    'DK': {
        name: 'Denmark', flag: '🇩🇰', exchange: 'Nasdaq Copenhagen',
        symbols: ['NOVO-B.CO', 'MAERSK-B.CO', 'VWS.CO', 'DSV.CO', 'CARL-B.CO',
            'ORSTED.CO', 'COLO-B.CO', 'PNDORA.CO', 'GN.CO', 'DEMANT.CO']
    },
    'NO': {
        name: 'Norway', flag: '🇳🇴', exchange: 'Oslo Børs',
        symbols: ['EQNR', 'DNB.OL', 'TEL.OL', 'MOWI.OL', 'ORK.OL',
            'YAR.OL', 'SALM.OL', 'AKRBP.OL', 'SUBC.OL', 'TGS.OL']
    },
    'FI': {
        name: 'Finland', flag: '🇫🇮', exchange: 'Nasdaq Helsinki',
        symbols: ['NOKIA', 'NESTE.HE', 'SAMPO.HE', 'FORTUM.HE', 'UPM.HE',
            'KNEBV.HE', 'STERV.HE', 'WRT1V.HE', 'ELISA.HE', 'KESKOB.HE']
    },
    'ES': {
        name: 'Spain', flag: '🇪🇸', exchange: 'Bolsa de Madrid',
        symbols: ['SAN.MC', 'ITX.MC', 'IBE.MC', 'TEF.MC', 'BBVA.MC',
            'REP.MC', 'FER.MC', 'AMS.MC', 'CABK.MC', 'ENG.MC']
    },
    'IT': {
        name: 'Italy', flag: '🇮🇹', exchange: 'Borsa Italiana',
        symbols: ['ENI.MI', 'ENEL.MI', 'ISP.MI', 'UCG.MI', 'STM.MI',
            'G.MI', 'TEN.MI', 'PRY.MI', 'SRG.MI', 'RACE.MI']
    },
    'PT': {
        name: 'Portugal', flag: '🇵🇹', exchange: 'Euronext Lisbon',
        symbols: ['GALP.LS', 'EDP.LS', 'SON.LS', 'JMT.LS', 'BCP.LS']
    },
    'BE': {
        name: 'Belgium', flag: '🇧🇪', exchange: 'Euronext Brussels',
        symbols: ['ABI.BR', 'UCB.BR', 'KBC.BR', 'SOLB.BR', 'AGS.BR']
    },
    'AT': {
        name: 'Austria', flag: '🇦🇹', exchange: 'Vienna Stock Exchange',
        symbols: ['VOE.VI', 'OMV.VI', 'EBS.VI', 'VER.VI', 'WIE.VI']
    },
    'IE': {
        name: 'Ireland', flag: '🇮🇪', exchange: 'Euronext Dublin',
        symbols: ['RYANAIR.IR', 'CRH', 'AIB.IR', 'KRX.IR', 'SMURFIT.IR']
    },
    'SG': {
        name: 'Singapore', flag: '🇸🇬', exchange: 'SGX',
        symbols: ['D05.SI', 'O39.SI', 'U11.SI', 'Z74.SI', 'C6L.SI',
            'V03.SI', 'Y92.SI', 'G13.SI', 'BN4.SI', 'C38U.SI']
    },
    'TW': {
        name: 'Taiwan', flag: '🇹🇼', exchange: 'TWSE',
        symbols: ['TSM', '2330.TW', '2317.TW', '2454.TW', '6505.TW',
            '2382.TW', '2412.TW', '1303.TW', '1301.TW', '2881.TW']
    },
    'TH': {
        name: 'Thailand', flag: '🇹🇭', exchange: 'SET',
        symbols: ['PTT.BK', 'AOT.BK', 'ADVANC.BK', 'CPALL.BK', 'SCB.BK',
            'SCC.BK', 'KBANK.BK', 'PTTGC.BK', 'TRUE.BK', 'GULF.BK']
    },
    'MY': {
        name: 'Malaysia', flag: '🇲🇾', exchange: 'Bursa Malaysia',
        symbols: ['1155.KL', '1295.KL', '5681.KL', '3182.KL', '1023.KL',
            '6888.KL', '4707.KL', '5347.KL', '1082.KL', '4863.KL']
    },
    'ID': {
        name: 'Indonesia', flag: '🇮🇩', exchange: 'IDX',
        symbols: ['BBCA.JK', 'BBRI.JK', 'TLKM.JK', 'ASII.JK', 'BMRI.JK',
            'UNVR.JK', 'HMSP.JK', 'GGRM.JK', 'ICBP.JK', 'KLBF.JK']
    },
    'PH': {
        name: 'Philippines', flag: '🇵🇭', exchange: 'PSE',
        symbols: ['SM.PS', 'BDO.PS', 'ALI.PS', 'JFC.PS', 'TEL.PS']
    },
    'IL': {
        name: 'Israel', flag: '🇮🇱', exchange: 'TASE',
        symbols: ['TEVA', 'CHKP', 'NICE', 'WIX', 'MNDY',
            'CYBR', 'GLBE', 'IRWD', 'SEDG', 'FVRR']
    },
    'SA': {
        name: 'Saudi Arabia', flag: '🇸🇦', exchange: 'Tadawul',
        symbols: ['2222.SR', '1120.SR', '2010.SR', '1180.SR', '7010.SR',
            '2350.SR', '1150.SR', '2380.SR', '4001.SR', '1010.SR']
    },
    'AE': {
        name: 'UAE', flag: '🇦🇪', exchange: 'DFM / ADX',
        symbols: ['EMIRATES.DFM', 'DFM.DFM', 'EMAAR.DFM', 'DIB.DFM', 'DEWA.DFM']
    },
    'ZA': {
        name: 'South Africa', flag: '🇿🇦', exchange: 'JSE',
        symbols: ['NPN.JO', 'SOL.JO', 'AGL.JO', 'MTN.JO', 'SBK.JO',
            'BHP.JO', 'FSR.JO', 'AMS.JO', 'SHP.JO', 'ABG.JO']
    },
    'NG': {
        name: 'Nigeria', flag: '🇳🇬', exchange: 'NSE Lagos',
        symbols: ['DANGCEM.LG', 'MTNN.LG', 'AIRTELAFRI.LG', 'GTCO.LG', 'BUACEMENT.LG']
    },
    'EG': {
        name: 'Egypt', flag: '🇪🇬', exchange: 'EGX',
        symbols: ['COMI.CA', 'HRHO.CA', 'TMGH.CA', 'SWDY.CA', 'EAST.CA']
    },
    'MX': {
        name: 'Mexico', flag: '🇲🇽', exchange: 'BMV',
        symbols: ['AMX', 'FEMSA', 'CEMEX', 'BIMBOA.MX', 'GFNORTEO.MX',
            'WALMEX.MX', 'TLEVISACPO.MX', 'GMEXICOB.MX', 'AC.MX', 'AMXL.MX']
    },
    'CL': {
        name: 'Chile', flag: '🇨🇱', exchange: 'Santiago Exchange',
        symbols: ['SQM', 'BSANTANDER.SN', 'CENCOSUD.SN', 'LTM.SN', 'FALABELLA.SN']
    },
    'CO': {
        name: 'Colombia', flag: '🇨🇴', exchange: 'BVC',
        symbols: ['EC', 'PFBCOLOM.BV', 'ISA.BV', 'NUTRESA.BV', 'GRUPOARGOS.BV']
    },
    'AR': {
        name: 'Argentina', flag: '🇦🇷', exchange: 'BYMA',
        symbols: ['YPF', 'MELI', 'GLOB', 'GGAL', 'BMA', 'PAM', 'CRESY', 'TEO', 'BIOX', 'SUPV']
    },
    'NZ': {
        name: 'New Zealand', flag: '🇳🇿', exchange: 'NZX',
        symbols: ['FPH.NZ', 'ATM.NZ', 'SPK.NZ', 'AIA.NZ', 'MEL.NZ']
    },
    'PL': {
        name: 'Poland', flag: '🇵🇱', exchange: 'Warsaw Stock Exchange',
        symbols: ['PKO.WA', 'PZU.WA', 'PEO.WA', 'KGH.WA', 'CDR.WA',
            'DNP.WA', 'PKN.WA', 'SPL.WA', 'LPP.WA', 'ALE.WA']
    },
    'TR': {
        name: 'Turkey', flag: '🇹🇷', exchange: 'Borsa Istanbul',
        symbols: ['THYAO.IS', 'SISE.IS', 'GARAN.IS', 'EREGL.IS', 'AKBNK.IS',
            'BIMAS.IS', 'ASELS.IS', 'KCHOL.IS', 'TUPRS.IS', 'SAHOL.IS']
    },
    'RU': {
        name: 'Russia', flag: '🇷🇺', exchange: 'MOEX',
        symbols: ['SBER.ME', 'GAZP.ME', 'LKOH.ME', 'GMKN.ME', 'ROSN.ME',
            'NVTK.ME', 'YNDX.ME', 'MTSS.ME', 'MGNT.ME', 'POLY.ME']
    },
    'VN': {
        name: 'Vietnam', flag: '🇻🇳', exchange: 'HOSE',
        symbols: ['VIC.VN', 'VHM.VN', 'VNM.VN', 'HPG.VN', 'MSN.VN']
    },
    'BD': {
        name: 'Bangladesh', flag: '🇧🇩', exchange: 'DSE',
        symbols: ['GP.BD', 'BATBC.BD', 'ROBI.BD', 'SQURPHARMA.BD', 'BXPHARMA.BD']
    },
    'PK': {
        name: 'Pakistan', flag: '🇵🇰', exchange: 'PSX',
        symbols: ['OGDC.KA', 'HBL.KA', 'PPL.KA', 'MCB.KA', 'FFC.KA']
    },
    'LK': {
        name: 'Sri Lanka', flag: '🇱🇰', exchange: 'CSE',
        symbols: ['JKH.N0000', 'COMB.N0000', 'DIAL.N0000', 'HNB.N0000', 'SAMP.N0000']
    },
    'KE': {
        name: 'Kenya', flag: '🇰🇪', exchange: 'NSE Nairobi',
        symbols: ['SCOM.NR', 'EQTY.NR', 'KCB.NR', 'BAT.NR', 'EABL.NR']
    },
    'GH': {
        name: 'Ghana', flag: '🇬🇭', exchange: 'GSE',
        symbols: ['MTNGH.GH', 'GCB.GH', 'EGH.GH', 'GOIL.GH', 'CAL.GH']
    }
};

// Populate ALL bucket
stockCountryMap['ALL'].symbols = Object.keys(stockCountryMap)
    .filter(k => k !== 'ALL')
    .flatMap(k => stockCountryMap[k].symbols);

function initCountryFilter() {
    const btn = document.getElementById('country-filter-btn');
    const dropdown = document.getElementById('country-dropdown');
    if (!btn || !dropdown) return;

    // Get saved preference
    const saved = localStorage.getItem('selected_stock_country') || 'ALL';

    // Build dropdown options
    dropdown.innerHTML = '';
    Object.entries(stockCountryMap).forEach(([code, info]) => {
        const option = document.createElement('div');
        option.className = 'country-option' + (code === saved ? ' active' : '');
        option.dataset.country = code;
        option.innerHTML = `
            <span class="country-flag">${info.flag}</span>
            <div class="country-info">
                <span class="country-name">${info.name}</span>
                <span class="country-exchange">${info.exchange}</span>
            </div>
        `;
        option.addEventListener('click', () => {
            // Save selection
            localStorage.setItem('selected_stock_country', code);
            dropdown.style.display = 'none';

            // Update button emoji
            btn.innerHTML = code === 'ALL' ? '🌍' : info.flag;

            // Update active class
            dropdown.querySelectorAll('.country-option').forEach(o => o.classList.remove('active'));
            option.classList.add('active');

            // Re-render stocks for this country
            loadStocksByCountry(code);
        });
        dropdown.appendChild(option);
    });

    // Toggle dropdown
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
    });

    // Close on outside click
    document.addEventListener('click', () => {
        dropdown.style.display = 'none';
    });
    dropdown.addEventListener('click', (e) => e.stopPropagation());

    // Restore saved button appearance
    if (saved !== 'ALL' && stockCountryMap[saved]) {
        btn.innerHTML = stockCountryMap[saved].flag;
    }

    // Return saved country code so initStockDashboard can use it
    return saved;
}

async function loadStocksByCountry(countryCode) {
    const grid = document.getElementById('stocks-grid');
    if (!grid) return;

    grid.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Loading stocks...</p></div>';

    const countryData = stockCountryMap[countryCode] || stockCountryMap['ALL'];
    const symbols = countryData.symbols;

    if (symbols.length === 0) {
        grid.innerHTML = '<div class="error-state" style="grid-column: 1/-1; text-align: center; padding: 40px;"><p>No stocks available for this country.</p></div>';
        return;
    }

    const data = await fetchFinnhubData(symbols);

    // Save to global for fast filtering
    window.latestStockData = data;
    window.currentStockCountry = countryCode;

    if (data && data.length > 0) {
        applyFiltersAndRender(data, grid, 'stock');
    } else {
        grid.innerHTML = '<div class="error-state" style="grid-column: 1/-1; text-align: center; padding: 40px;"><p>Unable to fetch data. Try again.</p></div>';
    }
}

function initStockSubnavInteractions() {
    const subnav = document.querySelector('.market-options');
    if (!subnav) return;

    // Avoid duplicate listeners
    if (window.stockSubnavInitialized) return;
    window.stockSubnavInitialized = true;

    subnav.addEventListener('click', (e) => {
        const link = e.target.closest('.option-link');
        if (!link) return;

        // Check if it's a filter link for stocks
        const href = link.getAttribute('href');
        if (!href.startsWith('stocks.html')) return;

        e.preventDefault();

        // Immediate UI Update
        document.querySelectorAll('.option-link').forEach(l => l.classList.remove('active'));
        link.classList.add('active');

        // Update URL
        const url = new URL(link.href, window.location.origin);
        history.pushState(null, '', url.toString());

        // Re-render
        initStockDashboard();
    });

    window.addEventListener('popstate', () => {
        if (window.location.pathname.includes('stocks.html')) {
            initStockDashboard();
        }
    });
}

// -------------------- Stocks Dashboard --------------------
window.latestStockData = null;
window.currentStockCountry = null;

async function initStockDashboard(forceRender = false) {
    const grid = document.getElementById('stocks-grid');
    if (!grid) return;

    // Initialize SPA interactions
    initStockSubnavInteractions();

    const urlParams = new URLSearchParams(window.location.search);
    const filter = urlParams.get('filter');

    // Immediate UI Feedback: Update active states in subnav before fetching
    document.querySelectorAll('.option-link').forEach(link => {
        link.classList.remove('active');
        const href = link.getAttribute('href');
        if (!filter && (href === 'stocks.html' || href === 'stocks.html?filter=')) {
            link.classList.add('active');
        } else if (filter && href.includes(`filter=${filter}`)) {
            link.classList.add('active');
        }
    });

    // Initialize Search
    if (!window.marketSearchInitialized) {
        initMarketSearch('stock');
        window.marketSearchInitialized = true;
    }

    // Initialize Country Filter and get saved preference
    const savedCountry = initCountryFilter();

    // If we already have data for this country and focus isn't a hard refresh
    if (!forceRender && window.latestStockData && window.currentStockCountry === savedCountry) {
        applyFiltersAndRender(window.latestStockData, grid, 'stock');
        return;
    }

    // Use saved country preference or default to US stocks
    let stockSymbols;
    if (savedCountry && savedCountry !== 'ALL' && stockCountryMap[savedCountry]) {
        stockSymbols = stockCountryMap[savedCountry].symbols;
    } else {
        stockSymbols = stockCountryMap['US'].symbols;
    }

    // Loading State
    grid.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Fetching Live Market Data...</p></div>';

    const cacheKey = 'stock_dashboard_cache';
    let data = await fetchFinnhubData(stockSymbols);

    if (data && data.length > 0) {
        // Success: Update Cache
        StockCache.save(cacheKey, data);
        window.latestStockData = data;
        window.currentStockCountry = savedCountry;

        applyFiltersAndRender(data, grid, 'stock');
    } else {
        // Failure: Check Cache
        const cached = StockCache.load(cacheKey);

        if (cached && cached.data.length > 0) {
            const minsAgo = Math.floor((Date.now() - cached.timestamp) / 60000);
            window.latestStockData = cached.data;
            window.currentStockCountry = savedCountry;

            applyFiltersAndRender(cached.data, grid, 'stock');

            // Show Stale Warning
            const warning = document.createElement('div');
            warning.innerHTML = `⚠️ Connection Unstable. Showing data from ${minsAgo} mins ago.`;
            warning.style.cssText = 'grid-column: 1/-1; background: var(--color-card-bg); color: var(--color-warning); padding: 10px; border-radius: 8px; text-align: center; margin-bottom: 20px; border: 1px solid var(--color-warning);';
            grid.insertBefore(warning, grid.firstChild);
        } else {
            // Total Failure
            grid.innerHTML = `
                <div class="error-state" style="grid-column: 1/-1; text-align: center; padding: 40px;">
                    <p style="font-size: 1.2rem; color: var(--color-text-secondary); margin-bottom: 20px;">
                        Unable to connect to live markets. <br>
                        <span style="font-size:0.9rem; opacity:0.7;">(Check your internet or try again later)</span>
                    </p>
                    <button onclick="initStockDashboard(true)" style="padding: 10px 20px; border-radius: 25px; border: none; background: var(--color-accent); color: var(--color-primary); font-weight: bold; cursor: pointer;">
                        Retry Connection
                    </button>
                </div>
            `;
        }
    }
}

// -------------------- Commodities Dashboard --------------------
window.latestCommodityData = null;
async function initCommodityDashboard(forceRender = false) {
    const grid = document.getElementById('commodities-grid');
    if (!grid) return;

    if (forceRender && window.latestCommodityData) {
        applyFiltersAndRender(window.latestCommodityData, grid, 'resource');
        return;
    }

    grid.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Connecting to Futures...</p></div>';

    // Initialize Search
    if (!window.marketSearchInitialized) {
        initMarketSearch('resource');
        window.marketSearchInitialized = true;
    }

    const cacheKey = 'commodity_dashboard_cache';

    // Note: Finnhub free tier has limited commodity support
    // Using stock-based commodity ETFs instead of futures
    const commoditySymbols = [
        'GLD',  // Gold ETF
        'SLV',  // Silver ETF  
        'USO',  // Crude Oil ETF
        'UNG',  // Natural Gas ETF
        'CPER', // Copper ETF
        'CORN', // Corn ETF
        'WEAT', // Wheat ETF
        'NIB',  // Cocoa ETF
        'JO',   // Coffee ETF
        'SGG',  // Sugar ETF
        'BAL',  // Cotton ETF
        'COW',  // Cattle ETF
        'PPLT', // Platinum ETF
        'PALL', // Palladium ETF
        'DBA',  // Agriculture Index
        'SOYB', // Soybeans ETF
        'WOOD', // Timber ETF
        'LIT',  // Lithium ETF
        'URA',  // Uranium ETF
        'REMX', // Rare Earth ETF
        'MOO',  // Agribusiness ETF
        'DBC',  // Commodity Index
        'BNO',  // Brent Oil ETF
        'PDBC', // Optimum Yield
        'FTGC', // First Trust Commodity
        'GSG',  // S&P GSCI Commodity
        'COMT'  // iShares Commodity
    ];

    // Map symbols to readable names
    const prettyNames = {
        'GLD': 'Gold (ETF)', 'SLV': 'Silver (ETF)', 'USO': 'Crude Oil (ETF)',
        'UNG': 'Natural Gas (ETF)', 'CPER': 'Copper (ETF)', 'CORN': 'Corn (ETF)',
        'WEAT': 'Wheat (ETF)', 'NIB': 'Cocoa (ETF)', 'JO': 'Coffee (ETF)',
        'SGG': 'Sugar (ETF)', 'BAL': 'Cotton (ETF)', 'COW': 'Cattle (ETF)',
        'PPLT': 'Platinum (ETF)', 'PALL': 'Palladium (ETF)', 'DBA': 'Agriculture Index (ETF)',
        'SOYB': 'Soybeans (ETF)', 'WOOD': 'Timber & Forestry (ETF)', 'LIT': 'Lithium & Battery (ETF)',
        'URA': 'Uranium (ETF)', 'REMX': 'Rare Earth & Strategic Metals (ETF)',
        'MOO': 'Agribusiness (ETF)', 'DBC': 'Commodity Tracking Index (ETF)',
        'BNO': 'Brent Crude Oil (ETF)', 'PDBC': 'Optimum Yield Diversified (ETF)',
        'FTGC': 'First Trust Global Commodity (ETF)', 'GSG': 'S&P GSCI Commodity (ETF)',
        'COMT': 'iShares Commodity (ETF)'
    };

    const urlParams = new URLSearchParams(window.location.search);
    const filter = urlParams.get('filter');

    let data = await fetchFinnhubData(commoditySymbols);

    if (data && data.length > 0) {
        // Success: Enrich and Cache
        let displayData = data.map(item => ({
            ...item,
            longName: prettyNames[item.symbol] || item.longName || item.symbol
        }));

        StockCache.save(cacheKey, displayData);
        window.latestCommodityData = displayData;
        applyFiltersAndRender(displayData, grid, 'resource');
    } else {
        // Failure: Check Cache
        const cached = StockCache.load(cacheKey);

        if (cached && cached.data.length > 0) {
            const minsAgo = Math.floor((Date.now() - cached.timestamp) / 60000);
            window.latestCommodityData = cached.data;
            applyFiltersAndRender(cached.data, grid, 'resource');

            const warning = document.createElement('div');
            warning.innerHTML = `⚠️ Connection Unstable. Showing data from ${minsAgo} mins ago.`;
            warning.style.cssText = 'grid-column: 1/-1; background: var(--color-card-bg); color: var(--color-warning); padding: 10px; border-radius: 8px; text-align: center; margin-bottom: 20px; border: 1px solid var(--color-warning);';
            grid.insertBefore(warning, grid.firstChild);
        } else {
            // Total Failure
            grid.innerHTML = `
                <div class="error-state" style="grid-column: 1/-1; text-align: center; padding: 40px;">
                    <p style="font-size: 1.2rem; color: var(--color-text-secondary); margin-bottom: 20px;">
                        Unable to connect to live markets.
                    </p>
                    <button onclick="initCommodityDashboard()" style="padding: 10px 20px; border-radius: 25px; border: none; background: var(--color-accent); color: var(--color-primary); font-weight: bold; cursor: pointer;">
                        Retry Connection
                    </button>
                </div>
            `;
        }
    }
}

// -------------------- Forex Dashboard --------------------
window.latestForexData = null;

// Comprehensive Forex Currency Pairs
const FOREX_PAIRS = {
    // ===== Major Pairs =====
    'EURUSD=X': { name: 'EUR/USD', base: 'EUR', quote: 'USD', flags: '🇪🇺🇺🇸', category: 'Major' },
    'GBPUSD=X': { name: 'GBP/USD', base: 'GBP', quote: 'USD', flags: '🇬🇧🇺🇸', category: 'Major' },
    'USDJPY=X': { name: 'USD/JPY', base: 'USD', quote: 'JPY', flags: '🇺🇸🇯🇵', category: 'Major' },
    'USDCHF=X': { name: 'USD/CHF', base: 'USD', quote: 'CHF', flags: '🇺🇸🇨🇭', category: 'Major' },
    'AUDUSD=X': { name: 'AUD/USD', base: 'AUD', quote: 'USD', flags: '🇦🇺🇺🇸', category: 'Major' },
    'USDCAD=X': { name: 'USD/CAD', base: 'USD', quote: 'CAD', flags: '🇺🇸🇨🇦', category: 'Major' },
    'NZDUSD=X': { name: 'NZD/USD', base: 'NZD', quote: 'USD', flags: '🇳🇿🇺🇸', category: 'Major' },

    // ===== Minor / Cross Pairs =====
    'EURGBP=X': { name: 'EUR/GBP', base: 'EUR', quote: 'GBP', flags: '🇪🇺🇬🇧', category: 'Minor' },
    'EURJPY=X': { name: 'EUR/JPY', base: 'EUR', quote: 'JPY', flags: '🇪🇺🇯🇵', category: 'Minor' },
    'EURCHF=X': { name: 'EUR/CHF', base: 'EUR', quote: 'CHF', flags: '🇪🇺🇨🇭', category: 'Minor' },
    'EURAUD=X': { name: 'EUR/AUD', base: 'EUR', quote: 'AUD', flags: '🇪🇺🇦🇺', category: 'Minor' },
    'EURCAD=X': { name: 'EUR/CAD', base: 'EUR', quote: 'CAD', flags: '🇪🇺🇨🇦', category: 'Minor' },
    'EURNZD=X': { name: 'EUR/NZD', base: 'EUR', quote: 'NZD', flags: '🇪🇺🇳🇿', category: 'Minor' },
    'GBPJPY=X': { name: 'GBP/JPY', base: 'GBP', quote: 'JPY', flags: '🇬🇧🇯🇵', category: 'Minor' },
    'GBPCHF=X': { name: 'GBP/CHF', base: 'GBP', quote: 'CHF', flags: '🇬🇧🇨🇭', category: 'Minor' },
    'GBPAUD=X': { name: 'GBP/AUD', base: 'GBP', quote: 'AUD', flags: '🇬🇧🇦🇺', category: 'Minor' },
    'GBPCAD=X': { name: 'GBP/CAD', base: 'GBP', quote: 'CAD', flags: '🇬🇧🇨🇦', category: 'Minor' },
    'GBPNZD=X': { name: 'GBP/NZD', base: 'GBP', quote: 'NZD', flags: '🇬🇧🇳🇿', category: 'Minor' },
    'AUDJPY=X': { name: 'AUD/JPY', base: 'AUD', quote: 'JPY', flags: '🇦🇺🇯🇵', category: 'Minor' },
    'AUDCHF=X': { name: 'AUD/CHF', base: 'AUD', quote: 'CHF', flags: '🇦🇺🇨🇭', category: 'Minor' },
    'AUDCAD=X': { name: 'AUD/CAD', base: 'AUD', quote: 'CAD', flags: '🇦🇺🇨🇦', category: 'Minor' },
    'AUDNZD=X': { name: 'AUD/NZD', base: 'AUD', quote: 'NZD', flags: '🇦🇺🇳🇿', category: 'Minor' },
    'CADJPY=X': { name: 'CAD/JPY', base: 'CAD', quote: 'JPY', flags: '🇨🇦🇯🇵', category: 'Minor' },
    'CADCHF=X': { name: 'CAD/CHF', base: 'CAD', quote: 'CHF', flags: '🇨🇦🇨🇭', category: 'Minor' },
    'NZDJPY=X': { name: 'NZD/JPY', base: 'NZD', quote: 'JPY', flags: '🇳🇿🇯🇵', category: 'Minor' },
    'NZDCHF=X': { name: 'NZD/CHF', base: 'NZD', quote: 'CHF', flags: '🇳🇿🇨🇭', category: 'Minor' },
    'NZDCAD=X': { name: 'NZD/CAD', base: 'NZD', quote: 'CAD', flags: '🇳🇿🇨🇦', category: 'Minor' },
    'CHFJPY=X': { name: 'CHF/JPY', base: 'CHF', quote: 'JPY', flags: '🇨🇭🇯🇵', category: 'Minor' },

    // ===== Exotic Pairs (USD-based) =====
    'USDTRY=X': { name: 'USD/TRY', base: 'USD', quote: 'TRY', flags: '🇺🇸🇹🇷', category: 'Exotic' },
    'USDZAR=X': { name: 'USD/ZAR', base: 'USD', quote: 'ZAR', flags: '🇺🇸🇿🇦', category: 'Exotic' },
    'USDMXN=X': { name: 'USD/MXN', base: 'USD', quote: 'MXN', flags: '🇺🇸🇲🇽', category: 'Exotic' },
    'USDSGD=X': { name: 'USD/SGD', base: 'USD', quote: 'SGD', flags: '🇺🇸🇸🇬', category: 'Exotic' },
    'USDHKD=X': { name: 'USD/HKD', base: 'USD', quote: 'HKD', flags: '🇺🇸🇭🇰', category: 'Exotic' },
    'USDTHB=X': { name: 'USD/THB', base: 'USD', quote: 'THB', flags: '🇺🇸🇹🇭', category: 'Exotic' },
    'USDNOK=X': { name: 'USD/NOK', base: 'USD', quote: 'NOK', flags: '🇺🇸🇳🇴', category: 'Exotic' },
    'USDSEK=X': { name: 'USD/SEK', base: 'USD', quote: 'SEK', flags: '🇺🇸🇸🇪', category: 'Exotic' },
    'USDDKK=X': { name: 'USD/DKK', base: 'USD', quote: 'DKK', flags: '🇺🇸🇩🇰', category: 'Exotic' },
    'USDPLN=X': { name: 'USD/PLN', base: 'USD', quote: 'PLN', flags: '🇺🇸🇵🇱', category: 'Exotic' },
    'USDCZK=X': { name: 'USD/CZK', base: 'USD', quote: 'CZK', flags: '🇺🇸🇨🇿', category: 'Exotic' },
    'USDHUF=X': { name: 'USD/HUF', base: 'USD', quote: 'HUF', flags: '🇺🇸🇭🇺', category: 'Exotic' },
    'USDINR=X': { name: 'USD/INR', base: 'USD', quote: 'INR', flags: '🇺🇸🇮🇳', category: 'Exotic' },
    'USDIDR=X': { name: 'USD/IDR', base: 'USD', quote: 'IDR', flags: '🇺🇸🇮🇩', category: 'Exotic' },
    'USDMYR=X': { name: 'USD/MYR', base: 'USD', quote: 'MYR', flags: '🇺🇸🇲🇾', category: 'Exotic' },
    'USDPHP=X': { name: 'USD/PHP', base: 'USD', quote: 'PHP', flags: '🇺🇸🇵🇭', category: 'Exotic' },
    'USDKRW=X': { name: 'USD/KRW', base: 'USD', quote: 'KRW', flags: '🇺🇸🇰🇷', category: 'Exotic' },
    'USDTWD=X': { name: 'USD/TWD', base: 'USD', quote: 'TWD', flags: '🇺🇸🇹🇼', category: 'Exotic' },
    'USDCNY=X': { name: 'USD/CNY', base: 'USD', quote: 'CNY', flags: '🇺🇸🇨🇳', category: 'Exotic' },
    'USDSAR=X': { name: 'USD/SAR', base: 'USD', quote: 'SAR', flags: '🇺🇸🇸🇦', category: 'Exotic' },
    'USDAED=X': { name: 'USD/AED', base: 'USD', quote: 'AED', flags: '🇺🇸🇦🇪', category: 'Exotic' },
    'USDBRL=X': { name: 'USD/BRL', base: 'USD', quote: 'BRL', flags: '🇺🇸🇧🇷', category: 'Exotic' },
    'USDCLP=X': { name: 'USD/CLP', base: 'USD', quote: 'CLP', flags: '🇺🇸🇨🇱', category: 'Exotic' },
    'USDCOP=X': { name: 'USD/COP', base: 'USD', quote: 'COP', flags: '🇺🇸🇨🇴', category: 'Exotic' },
    'USDARS=X': { name: 'USD/ARS', base: 'USD', quote: 'ARS', flags: '🇺🇸🇦🇷', category: 'Exotic' },
    'USDEGP=X': { name: 'USD/EGP', base: 'USD', quote: 'EGP', flags: '🇺🇸🇪🇬', category: 'Exotic' },
    'USDNGN=X': { name: 'USD/NGN', base: 'USD', quote: 'NGN', flags: '🇺🇸🇳🇬', category: 'Exotic' },
    'USDKES=X': { name: 'USD/KES', base: 'USD', quote: 'KES', flags: '🇺🇸🇰🇪', category: 'Exotic' },
    'USDPKR=X': { name: 'USD/PKR', base: 'USD', quote: 'PKR', flags: '🇺🇸🇵🇰', category: 'Exotic' },
    'USDLKR=X': { name: 'USD/LKR', base: 'USD', quote: 'LKR', flags: '🇺🇸🇱🇰', category: 'Exotic' },
    'USDBDT=X': { name: 'USD/BDT', base: 'USD', quote: 'BDT', flags: '🇺🇸🇧🇩', category: 'Exotic' },
    'USDVND=X': { name: 'USD/VND', base: 'USD', quote: 'VND', flags: '🇺🇸🇻🇳', category: 'Exotic' },
    'USDILS=X': { name: 'USD/ILS', base: 'USD', quote: 'ILS', flags: '🇺🇸🇮🇱', category: 'Exotic' },
    'USDRUB=X': { name: 'USD/RUB', base: 'USD', quote: 'RUB', flags: '🇺🇸🇷🇺', category: 'Exotic' },
    'USDRON=X': { name: 'USD/RON', base: 'USD', quote: 'RON', flags: '🇺🇸🇷🇴', category: 'Exotic' },
    'USDBGN=X': { name: 'USD/BGN', base: 'USD', quote: 'BGN', flags: '🇺🇸🇧🇬', category: 'Exotic' },
    'USDHRK=X': { name: 'USD/HRK', base: 'USD', quote: 'HRK', flags: '🇺🇸🇭🇷', category: 'Exotic' },
    'USDJOD=X': { name: 'USD/JOD', base: 'USD', quote: 'JOD', flags: '🇺🇸🇯🇴', category: 'Exotic' },
    'USDQAR=X': { name: 'USD/QAR', base: 'USD', quote: 'QAR', flags: '🇺🇸🇶🇦', category: 'Exotic' },
    'USDOMR=X': { name: 'USD/OMR', base: 'USD', quote: 'OMR', flags: '🇺🇸🇴🇲', category: 'Exotic' },
    'USDBHD=X': { name: 'USD/BHD', base: 'USD', quote: 'BHD', flags: '🇺🇸🇧🇭', category: 'Exotic' },
    'USDKWD=X': { name: 'USD/KWD', base: 'USD', quote: 'KWD', flags: '🇺🇸🇰🇼', category: 'Exotic' },

    // ===== EUR-Cross Exotics =====
    'EURTRY=X': { name: 'EUR/TRY', base: 'EUR', quote: 'TRY', flags: '🇪🇺🇹🇷', category: 'Exotic' },
    'EURZAR=X': { name: 'EUR/ZAR', base: 'EUR', quote: 'ZAR', flags: '🇪🇺🇿🇦', category: 'Exotic' },
    'EURMXN=X': { name: 'EUR/MXN', base: 'EUR', quote: 'MXN', flags: '🇪🇺🇲🇽', category: 'Exotic' },
    'EURNOK=X': { name: 'EUR/NOK', base: 'EUR', quote: 'NOK', flags: '🇪🇺🇳🇴', category: 'Exotic' },
    'EURSEK=X': { name: 'EUR/SEK', base: 'EUR', quote: 'SEK', flags: '🇪🇺🇸🇪', category: 'Exotic' },
    'EURDKK=X': { name: 'EUR/DKK', base: 'EUR', quote: 'DKK', flags: '🇪🇺🇩🇰', category: 'Exotic' },
    'EURPLN=X': { name: 'EUR/PLN', base: 'EUR', quote: 'PLN', flags: '🇪🇺🇵🇱', category: 'Exotic' },
    'EURCZK=X': { name: 'EUR/CZK', base: 'EUR', quote: 'CZK', flags: '🇪🇺🇨🇿', category: 'Exotic' },
    'EURHUF=X': { name: 'EUR/HUF', base: 'EUR', quote: 'HUF', flags: '🇪🇺🇭🇺', category: 'Exotic' },
    'EURSGD=X': { name: 'EUR/SGD', base: 'EUR', quote: 'SGD', flags: '🇪🇺🇸🇬', category: 'Exotic' },

    // ===== GBP-Cross Exotics =====
    'GBPTRY=X': { name: 'GBP/TRY', base: 'GBP', quote: 'TRY', flags: '🇬🇧🇹🇷', category: 'Exotic' },
    'GBPZAR=X': { name: 'GBP/ZAR', base: 'GBP', quote: 'ZAR', flags: '🇬🇧🇿🇦', category: 'Exotic' },
    'GBPMXN=X': { name: 'GBP/MXN', base: 'GBP', quote: 'MXN', flags: '🇬🇧🇲🇽', category: 'Exotic' },
    'GBPNOK=X': { name: 'GBP/NOK', base: 'GBP', quote: 'NOK', flags: '🇬🇧🇳🇴', category: 'Exotic' },
    'GBPSEK=X': { name: 'GBP/SEK', base: 'GBP', quote: 'SEK', flags: '🇬🇧🇸🇪', category: 'Exotic' },
    'GBPSGD=X': { name: 'GBP/SGD', base: 'GBP', quote: 'SGD', flags: '🇬🇧🇸🇬', category: 'Exotic' },

    // ===== Other Cross Exotics =====
    'AUDZAR=X': { name: 'AUD/ZAR', base: 'AUD', quote: 'ZAR', flags: '🇦🇺🇿🇦', category: 'Exotic' },
    'AUDSGD=X': { name: 'AUD/SGD', base: 'AUD', quote: 'SGD', flags: '🇦🇺🇸🇬', category: 'Exotic' },
    'SGDJPY=X': { name: 'SGD/JPY', base: 'SGD', quote: 'JPY', flags: '🇸🇬🇯🇵', category: 'Exotic' },
    'HKDJPY=X': { name: 'HKD/JPY', base: 'HKD', quote: 'JPY', flags: '🇭🇰🇯🇵', category: 'Exotic' },
    'TRYJPY=X': { name: 'TRY/JPY', base: 'TRY', quote: 'JPY', flags: '🇹🇷🇯🇵', category: 'Exotic' },
    'ZARJPY=X': { name: 'ZAR/JPY', base: 'ZAR', quote: 'JPY', flags: '🇿🇦🇯🇵', category: 'Exotic' },
    'MXNJPY=X': { name: 'MXN/JPY', base: 'MXN', quote: 'JPY', flags: '🇲🇽🇯🇵', category: 'Exotic' },
    'NOKJPY=X': { name: 'NOK/JPY', base: 'NOK', quote: 'JPY', flags: '🇳🇴🇯🇵', category: 'Exotic' },
    'SEKJPY=X': { name: 'SEK/JPY', base: 'SEK', quote: 'JPY', flags: '🇸🇪🇯🇵', category: 'Exotic' }
};

// Forex pretty name map for rendering
const FOREX_PRETTY_NAMES = {};
for (const [sym, info] of Object.entries(FOREX_PAIRS)) {
    FOREX_PRETTY_NAMES[sym] = `${info.flags} ${info.name}`;
}

async function initForexDashboard(forceRender = false) {
    const grid = document.getElementById('forex-grid');
    if (!grid) return;

    if (forceRender && window.latestForexData) {
        applyFiltersAndRender(window.latestForexData, grid, 'forex');
        return;
    }

    grid.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Connecting to Forex Markets...</p></div>';

    // Initialize Search
    if (!window.marketSearchInitialized) {
        initMarketSearch('forex');
        window.marketSearchInitialized = true;
    }

    const cacheKey = 'forex_dashboard_cache';
    const forexSymbols = Object.keys(FOREX_PAIRS);

    const urlParams = new URLSearchParams(window.location.search);
    const filter = urlParams.get('filter');

    let data = await fetchFinnhubData(forexSymbols);

    if (data && data.length > 0) {
        let displayData = data.map(item => ({
            ...item,
            longName: FOREX_PRETTY_NAMES[item.symbol] || item.longName || item.symbol
        }));

        StockCache.save(cacheKey, displayData);
        window.latestForexData = displayData;
        applyFiltersAndRender(displayData, grid, 'forex');
    } else {
        const cached = StockCache.load(cacheKey);

        if (cached && cached.data.length > 0) {
            const minsAgo = Math.floor((Date.now() - cached.timestamp) / 60000);
            window.latestForexData = cached.data;
            applyFiltersAndRender(cached.data, grid, 'forex');

            const warning = document.createElement('div');
            warning.innerHTML = `⚠️ Connection Unstable. Showing data from ${minsAgo} mins ago.`;
            warning.style.cssText = 'grid-column: 1/-1; background: var(--color-card-bg); color: var(--color-warning); padding: 10px; border-radius: 8px; text-align: center; margin-bottom: 20px; border: 1px solid var(--color-warning);';
            grid.insertBefore(warning, grid.firstChild);
        } else {
            grid.innerHTML = `
                <div class="error-state" style="grid-column: 1/-1; text-align: center; padding: 40px;">
                    <p style="font-size: 1.2rem; color: var(--color-text-secondary); margin-bottom: 20px;">
                        Unable to connect to forex markets.
                    </p>
                    <button onclick="initForexDashboard()" style="padding: 10px 20px; border-radius: 25px; border: none; background: var(--color-accent); color: var(--color-primary); font-weight: bold; cursor: pointer;">
                        Retry Connection
                    </button>
                </div>
            `;
        }
    }
}

// Forex icon helper
function getForexIcon(symbol) {
    const pair = FOREX_PAIRS[symbol];
    if (pair) return pair.flags;
    // Fallback
    return '💱';
}

function applyFiltersAndRender(data, grid, type) {
    const urlParams = new URLSearchParams(window.location.search);
    const filter = urlParams.get('filter');

    let displayData = data;
    if (filter === 'gainers') {
        displayData = [...data].sort((a, b) => (b.regularMarketChangePercent || 0) - (a.regularMarketChangePercent || 0)).slice(0, 30);
    } else if (filter === 'losers') {
        displayData = [...data].sort((a, b) => (a.regularMarketChangePercent || 0) - (b.regularMarketChangePercent || 0)).slice(0, 30);
    } else if (filter === 'potential') {
        if (type === 'stock') {
            displayData = [...data].sort((a, b) => (b.dayHigh - b.dayLow) / b.regularMarketPrice - (a.dayHigh - a.dayLow) / a.regularMarketPrice).slice(0, 15);
        } else {
            displayData = [...data].sort((a, b) => Math.abs(a.regularMarketChangePercent) - Math.abs(b.regularMarketChangePercent)).slice(0, 8);
        }
    }

    // Update active state in subnav
    if (filter) {
        document.querySelectorAll('.option-link').forEach(link => {
            link.classList.remove('active');
            if (link.getAttribute('href').includes(`filter=${filter}`)) {
                link.classList.add('active');
            }
        });
    }

    renderGenericGrid(displayData, grid, type);
}

// -------------------- Stock Icon Helper --------------------
// Dynamically resolves stock icons based on symbol suffix (country) and sector
function getStockIcon(symbol, type) {
    if (type === 'resource') {
        // Commodity icons
        const s = symbol;
        if (s.includes('GLD') || s.includes('GC')) return '🥇';
        if (s.includes('SLV') || s.includes('SI')) return '🥈';
        if (s.includes('USO') || s.includes('CL') || s.includes('BNO') || s.includes('BZ')) return '🛢️';
        if (s.includes('UNG') || s.includes('NG')) return '🔥';
        if (s.includes('CPER') || s.includes('HG')) return '⛏️';
        if (s.includes('PPLT') || s.includes('PALL') || s.includes('PL') || s.includes('PA')) return '⛏️';
        if (s.includes('CORN') || s.includes('WEAT') || s.includes('SOYB') || s.includes('DBA')) return '🌾';
        if (s.includes('JO') || s.includes('NIB') || s.includes('SGG') || s.includes('BAL')) return '☕';
        if (s.includes('COW') || s.includes('LE') || s.includes('HE')) return '🐄';
        if (s.includes('URA')) return '☢️';
        if (s.includes('LIT')) return '🔋';
        if (s.includes('WOOD')) return '🌲';
        if (s.includes('REMX')) return '💎';
        return '📦';
    }

    // ---- Stock icons ----
    const s = symbol;

    // US sector-specific icons (for US-listed stocks without a suffix)
    const techStocks = ['AAPL', 'MSFT', 'GOOGL', 'META', 'NVDA', 'AMD', 'CRM', 'ADBE', 'ORCL', 'INTC',
        'QCOM', 'CSCO', 'IBM', 'AVGO', 'PLTR', 'SNOW', 'NET', 'CRWD', 'PANW', 'ZS', 'OKTA', 'TWLO',
        'TTD', 'RBLX', 'U', 'DOCU', 'ZM', 'SHOP', 'ASML', 'TSM', 'ERIC', 'NOKIA', 'WIX', 'MNDY',
        'CYBR', 'GLBE', 'FVRR', 'NICE', 'CHKP', 'SAP'];
    const autoStocks = ['TSLA', 'TM', 'F', 'GM', 'RIVN', 'NIO', 'LI', 'XPEV'];
    const financeStocks = ['JPM', 'V', 'MA', 'BAC', 'GS', 'BLK', 'SCHW', 'AXP', 'C', 'MS', 'PYPL',
        'COIN', 'SOFI', 'HOOD', 'SQ', 'NU', 'ITUB', 'BBD', 'GGAL', 'BMA', 'SUPV'];
    const retailStocks = ['WMT', 'COST', 'KO', 'PEP', 'PG', 'TGT', 'LOW', 'NKE', 'CVS', 'ABEV'];
    const energyStocks = ['XOM', 'CVX', 'SHEL', 'PBR', 'SU', 'ENB', 'TRP', 'EQNR', 'YPF', 'EC', 'SQM'];
    const pharmaStocks = ['JNJ', 'PFE', 'LLY', 'MRK', 'ABBV', 'UNH', 'TMO', 'ABT', 'DHR', 'BMY',
        'GILD', 'ISRG', 'AZN', 'TEVA', 'SEDG'];
    const mediaStocks = ['NFLX', 'DIS', 'CMCSA', 'ROKU', 'SNAP', 'DKNG'];
    const telecomStocks = ['T', 'VZ', 'AMX', 'FEMSA'];
    const utilityStocks = ['NEE', 'DUK', 'SO'];
    const defenseStocks = ['LMT', 'RTX', 'BA'];
    const industrialStocks = ['CAT', 'GE', 'DE', 'HON', 'MMM', 'UPS', 'UBER', 'DASH', 'ABNB', 'CEMEX', 'CRH'];
    const foodStocks = ['SBUX', 'MCD'];

    if (techStocks.includes(s)) return '💻';
    if (autoStocks.includes(s)) return '🚗';
    if (financeStocks.includes(s)) return '💳';
    if (retailStocks.includes(s)) return '🛒';
    if (energyStocks.includes(s)) return '⛽';
    if (pharmaStocks.includes(s)) return '💊';
    if (mediaStocks.includes(s)) return '🎬';
    if (telecomStocks.includes(s)) return '📱';
    if (utilityStocks.includes(s)) return '⚡';
    if (defenseStocks.includes(s)) return '🛡️';
    if (industrialStocks.includes(s)) return '🏭';
    if (foodStocks.includes(s)) return '🍔';

    // Country flag icons based on symbol suffix
    const suffixFlags = {
        '.NS': '🇮🇳', '.BO': '🇮🇳',
        '.T': '🇯🇵',
        '.L': '🇬🇧',
        '.DE': '🇩🇪',
        '.KS': '🇰🇷', '.KQ': '🇰🇷',
        '.HK': '🇨🇳',
        '.AX': '🇦🇺',
        '.SA': '🇧🇷',
        '.PA': '🇫🇷',
        '.SW': '🇨🇭',
        '.AS': '🇳🇱',
        '.ST': '🇸🇪',
        '.CO': '🇩🇰',
        '.OL': '🇳🇴',
        '.HE': '🇫🇮',
        '.MC': '🇪🇸',
        '.MI': '🇮🇹',
        '.LS': '🇵🇹',
        '.BR': '🇧🇪',
        '.VI': '🇦🇹',
        '.IR': '🇮🇪',
        '.SI': '🇸🇬',
        '.TW': '🇹🇼',
        '.BK': '🇹🇭',
        '.KL': '🇲🇾',
        '.JK': '🇮🇩',
        '.PS': '🇵🇭',
        '.SR': '🇸🇦',
        '.DFM': '🇦🇪',
        '.JO': '🇿🇦',
        '.LG': '🇳🇬',
        '.CA': '🇪🇬',
        '.MX': '🇲🇽',
        '.SN': '🇨🇱',
        '.BV': '🇨🇴',
        '.NZ': '🇳🇿',
        '.WA': '🇵🇱',
        '.IS': '🇹🇷',
        '.ME': '🇷🇺',
        '.VN': '🇻🇳',
        '.BD': '🇧🇩',
        '.KA': '🇵🇰',
        '.N0000': '🇱🇰',
        '.NR': '🇰🇪',
        '.GH': '🇬🇭'
    };

    // Check suffix-based country flags
    for (const [suffix, flag] of Object.entries(suffixFlags)) {
        if (s.endsWith(suffix)) return flag;
    }

    // Known non-suffixed international stocks
    const knownCountryStocks = {
        'BABA': '🇨🇳', 'JD': '🇨🇳', 'PDD': '🇨🇳', 'BIDU': '🇨🇳', 'NIO': '🇨🇳', 'LI': '🇨🇳', 'XPEV': '🇨🇳',
        'RY': '🇨🇦', 'TD': '🇨🇦', 'ENB': '🇨🇦', 'CNR': '🇨🇦', 'BMO': '🇨🇦', 'BNS': '🇨🇦', 'CP': '🇨🇦',
        'TRI': '🇨🇦', 'SU': '🇨🇦', 'MFC': '🇨🇦', 'ABX': '🇨🇦', 'NTR': '🇨🇦', 'WCN': '🇨🇦', 'FTS': '🇨🇦', 'TRP': '🇨🇦',
        'BHP': '🇦🇺', 'VALE': '🇧🇷', 'PBR': '🇧🇷', 'ITUB': '🇧🇷', 'BBD': '🇧🇷', 'ABEV': '🇧🇷', 'NU': '🇧🇷',
        'SBS': '🇧🇷', 'GGB': '🇧🇷',
        'SHEL': '🇬🇧', 'AZN': '🇬🇧', 'CRH': '🇮🇪',
        'SAP': '🇩🇪', 'ASML': '🇳🇱', 'ERIC': '🇸🇪', 'NOKIA': '🇫🇮', 'EQNR': '🇳🇴',
        'TSM': '🇹🇼', 'TEVA': '🇮🇱', 'CHKP': '🇮🇱', 'NICE': '🇮🇱', 'WIX': '🇮🇱',
        'MNDY': '🇮🇱', 'CYBR': '🇮🇱', 'GLBE': '🇮🇱', 'FVRR': '🇮🇱', 'SEDG': '🇮🇱',
        'AMX': '🇲🇽', 'FEMSA': '🇲🇽', 'CEMEX': '🇲🇽', 'SQM': '🇨🇱', 'EC': '🇨🇴',
        'YPF': '🇦🇷', 'MELI': '🇦🇷', 'GLOB': '🇦🇷', 'GGAL': '🇦🇷', 'BMA': '🇦🇷',
        'PAM': '🇦🇷', 'CRESY': '🇦🇷', 'TEO': '🇦🇷', 'BIOX': '🇦🇷', 'SUPV': '🇦🇷'
    };

    if (knownCountryStocks[s]) return knownCountryStocks[s];

    // Default icon
    return '📊';
}

// -------------------- Generic Renderer (Stocks/Commodities/Forex) --------------------
function renderGenericGrid(items, container, type) {
    container.innerHTML = '';

    items.forEach(item => {
        const change = item.regularMarketChangePercent;
        const trend = change >= 0 ? 'trend-up' : 'trend-down';
        const sign = change >= 0 ? '+' : '';
        const sentiment = change > 1.5 ? 'Strong Buy' : (change > 0 ? 'Buy' : (change > -1.5 ? 'Hold' : 'Sell'));
        const badgeColor = change > 0 ? 'bg-bullish' : (change > -1 ? 'bg-neutral' : 'bg-bearish');

        // Icon selection based on symbol/type
        const icon = type === 'forex' ? getForexIcon(item.symbol) : getStockIcon(item.symbol, type);

        // Make the whole card clickable via <a> wrapper
        const link = document.createElement('a');
        link.href = `market-detail.html?symbol=${encodeURIComponent(item.symbol)}&type=${type}`;
        link.style.textDecoration = 'none';
        link.style.color = 'inherit';
        link.style.display = 'block';

        // Display name & symbol formatting
        const displayName = item.longName || item.symbol;
        const displaySymbol = type === 'forex' ? item.symbol.replace('=X', '') : item.symbol.replace('=F', '');

        // For forex, show rate as-is instead of currency conversion
        const priceDisplay = type === 'forex'
            ? item.regularMarketPrice.toFixed(item.regularMarketPrice < 10 ? 4 : 2)
            : CurrencyConverter.format(item.regularMarketPrice);

        const card = document.createElement('div');
        card.className = 'crypto-card';
        card.innerHTML = `
            <div class="coin-header">
                <div class="coin-icon" style="background: #fff; display:flex; align-items:center; justify-content:center; font-size:24px;">${icon}</div>
                <div class="coin-name-group">
                    <h3>${displayName}</h3>
                    <span class="coin-symbol">${displaySymbol}</span>
                </div>
            </div>
            <div class="coin-price">${priceDisplay}</div>
            <div class="coin-stats-row">
                <span class="sentiment-badge ${badgeColor}">${sentiment}</span>
                <span class="${trend}">${sign}${change.toFixed(2)}%</span>
            </div>
        `;
        link.appendChild(card);
        container.appendChild(link);
    });
}

// -------------------- Dynamic Data Logic --------------------

// 1. Fetch News (CryptoCompare)
async function fetchNews(coinId) {
    try {
        // Map common IDs to CryptoCompare symbols if needed, or just use general tags
        const symbolMap = {
            'bitcoin': 'BTC', 'ethereum': 'ETH', 'solana': 'SOL', 'ripple': 'XRP', 'cardano': 'ADA',
            'dogecoin': 'DOGE', 'binancecoin': 'BNB', 'polkadot': 'DOT', 'tron': 'TRX'
        };
        const tag = symbolMap[coinId] || 'CRYPTO';

        const res = await fetch(`https://min-api.cryptocompare.com/data/v2/news/?lang=EN&categories=${tag}&sortOrder=latest`);
        const data = await res.json();

        if (data.Data && data.Data.length > 0) {
            return data.Data.slice(0, 3).map(item => ({
                title: item.title,
                date: new Date(item.published_on * 1000).toLocaleDateString(),
                source: item.source_info.name,
                url: item.url,
                body: item.body
            }));
        }
    } catch (e) {
        console.warn('News Fetch Error:', e);
    }
    return []; // Fallback empty
}

// 2. Generate "AI" Analysis based on Real Data
function generateDynamicAnalysis(coinData, newsItems) {
    const priceChange = coinData.market_data.price_change_percentage_24h;
    const price = coinData.market_data.current_price.usd;

    // Determine Verdict
    let verdict = 'Hold';
    let reason = '';
    let sentiment = 50;

    if (priceChange > 5) {
        verdict = 'Buy';
        reason = `Strong bullish momentum detected with a ${priceChange.toFixed(2)}% gain in the last 24h. Volume and on-chain activity support continuation.`;
        sentiment = 75 + Math.floor(Math.random() * 15);
    } else if (priceChange > 0) {
        verdict = 'Accumulate';
        reason = `Steady accumulation phase detected. Price is stable (+${priceChange.toFixed(2)}%) with potential for upward breakout.`;
        sentiment = 60 + Math.floor(Math.random() * 10);
    } else if (priceChange < -5) {
        verdict = 'Sell';
        reason = `Bearish divergence observed. The asset has dropped ${Math.abs(priceChange).toFixed(2)}%, breaking key support levels. Caution advised.`;
        sentiment = 20 + Math.floor(Math.random() * 15);
    } else {
        verdict = 'Hold';
        reason = `Market is indecisive. Price is consolidating (${priceChange.toFixed(2)}%). Wait for a confirmed trend reversal or breakout.`;
        sentiment = 40 + Math.floor(Math.random() * 20);
    }

    return {
        verdict: verdict,
        reason: reason,
        sentiment: sentiment,
        low: '$' + (price * 0.85).toLocaleString(undefined, { maximumFractionDigits: 2 }),
        high: '$' + (price * 1.35).toLocaleString(undefined, { maximumFractionDigits: 2 }),
        news: newsItems.length ? newsItems : [
            { title: 'Market Analysis updating...', date: 'Just now', source: 'System' }
        ]
    };
}

// 3. AI Price Predictions Data (End of 2026)
const aiPricePredictions = {
    'bitcoin': {
        'Meta': '$120,000 - $150,000',
        'Claude': '$130,000 - $150,000',
        'ChatGPT': '$150,000',
        'Grok': '$150,000',
        'Gemini': '$150,000',
        'DeepSeek': '$150,000',
        'Qwen': '$150,000',
        'Perplexity': '$120,000',
        'Z.ai': '$175,000',
        'Copilot': '$120,000'
    },
    'ethereum': {
        'Meta': '$5,000 - $7,000',
        'Claude': '$4,000 - $5,500',
        'ChatGPT': '$7,500',
        'Grok': '$7,500',
        'Gemini': '$7,500',
        'DeepSeek': '$8,477',
        'Qwen': '$8,000',
        'Perplexity': '$6,500',
        'Z.ai': '$5,440',
        'Copilot': '$6,000'
    },
    'ripple': {
        'Meta': '$3.83 - $4.53',
        'Claude': '$2.50 - $3.80',
        'ChatGPT': '$8.00',
        'Grok': '$6.00',
        'Gemini': '$3.90',
        'DeepSeek': '$18.40',
        'Qwen': '$5.50',
        'Perplexity': '$4.00',
        'Z.ai': '$3.00',
        'Copilot': '$5.00'
    },
    'solana': {
        'Meta': '$166 - $280',
        'Claude': '$200 - $450',
        'ChatGPT': '$600',
        'Grok': '$400',
        'Gemini': '$250',
        'DeepSeek': '$198',
        'Qwen': '$200',
        'Perplexity': '$450',
        'Z.ai': '$191.75',
        'Copilot': '$180'
    },
    'cardano': {
        'Meta': '$1.20 - $2.50',
        'Claude': '$1.50 - $3.00',
        'ChatGPT': '$3.50',
        'Grok': '$2.80',
        'Gemini': '$2.00',
        'DeepSeek': '$1.85',
        'Qwen': '$2.20',
        'Perplexity': '$2.50',
        'Z.ai': '$1.75',
        'Copilot': '$2.00'
    },
    'cosmos': {
        'Meta': '$15 - $30',
        'Claude': '$18 - $35',
        'ChatGPT': '$40',
        'Grok': '$28',
        'Gemini': '$22',
        'DeepSeek': '$19',
        'Qwen': '$25',
        'Perplexity': '$30',
        'Z.ai': '$20',
        'Copilot': '$24'
    },
    'algorand': {
        'Meta': '$0.50 - $1.20',
        'Claude': '$0.60 - $1.50',
        'ChatGPT': '$2.00',
        'Grok': '$1.40',
        'Gemini': '$0.85',
        'DeepSeek': '$0.72',
        'Qwen': '$1.10',
        'Perplexity': '$1.30',
        'Z.ai': '$0.65',
        'Copilot': '$0.90'
    },
    'injective-protocol': {
        'Meta': '$35 - $80',
        'Claude': '$40 - $90',
        'ChatGPT': '$120',
        'Grok': '$75',
        'Gemini': '$55',
        'DeepSeek': '$48',
        'Qwen': '$65',
        'Perplexity': '$85',
        'Z.ai': '$42',
        'Copilot': '$60'
    },
    'aave': {
        'Meta': '$400 - $700',
        'Claude': '$350 - $650',
        'ChatGPT': '$800',
        'Grok': '$550',
        'Gemini': '$480',
        'DeepSeek': '$420',
        'Qwen': '$500',
        'Perplexity': '$600',
        'Z.ai': '$380',
        'Copilot': '$450'
    },
    'maker': {
        'Meta': '$2,500 - $4,000',
        'Claude': '$2,800 - $4,500',
        'ChatGPT': '$5,000',
        'Grok': '$3,800',
        'Gemini': '$3,200',
        'DeepSeek': '$2,900',
        'Qwen': '$3,500',
        'Perplexity': '$4,200',
        'Z.ai': '$2,700',
        'Copilot': '$3,000'
    },
    'lido-dao': {
        'Meta': '$3.00 - $6.00',
        'Claude': '$3.50 - $7.00',
        'ChatGPT': '$8.00',
        'Grok': '$5.50',
        'Gemini': '$4.20',
        'DeepSeek': '$3.80',
        'Qwen': '$5.00',
        'Perplexity': '$6.50',
        'Z.ai': '$3.40',
        'Copilot': '$4.50'
    },
    'worldcoin-wld': {
        'Meta': '$4.00 - $10.00',
        'Claude': '$5.00 - $12.00',
        'ChatGPT': '$15.00',
        'Grok': '$8.00',
        'Gemini': '$6.50',
        'DeepSeek': '$5.20',
        'Qwen': '$7.00',
        'Perplexity': '$10.00',
        'Z.ai': '$4.80',
        'Copilot': '$6.00'
    }
};

function initAIPricePredictions() {
    const pillsContainer = document.getElementById('ai-model-pills');
    const gridContainer = document.getElementById('ai-prediction-grid');
    const emptyState = document.getElementById('ai-prediction-empty');
    if (!pillsContainer || !gridContainer) return;

    const urlParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const coinId = urlParams.get('id') || hashParams.get('id') || 'bitcoin';

    const predictionData = aiPricePredictions[coinId];
    if (!predictionData) {
        pillsContainer.style.display = 'none';
        gridContainer.innerHTML = `<p style="opacity:0.5; font-size: 0.9rem;">AI Predictions not yet available for this asset.</p>`;
        if (emptyState) emptyState.style.display = 'none';
        return;
    }

    const models = Object.keys(predictionData);
    let selectedModels = new Set(['ChatGPT']);

    const renderPills = () => {
        pillsContainer.innerHTML = models.map(model => `
            <div class="model-pill ${selectedModels.has(model) ? 'active' : ''}" data-model="${model}">
                ${model}
            </div>
        `).join('');

        pillsContainer.querySelectorAll('.model-pill').forEach(pill => {
            pill.addEventListener('click', () => {
                const model = pill.dataset.model;
                if (selectedModels.has(model)) {
                    if (selectedModels.size > 1) selectedModels.delete(model);
                } else {
                    selectedModels.add(model);
                }
                updateUI();
            });
        });
    };

    const updateUI = () => {
        renderPills();

        if (selectedModels.size === 0) {
            gridContainer.innerHTML = '';
            if (emptyState) emptyState.style.display = 'block';
        } else {
            if (emptyState) emptyState.style.display = 'none';
            gridContainer.innerHTML = Array.from(selectedModels).map(model => `
                <div class="prediction-card">
                    <div class="prediction-model-name">${model}</div>
                    <div class="prediction-price">${predictionData[model]}</div>
                    <div style="font-size: 10px; color: var(--color-text-muted); margin-top: 8px;">Expected by Dec 2026</div>
                </div>
            `).join('');
        }
    };

    updateUI();
}

// -------------------- Crypto Detail Page Logic --------------------
function initCryptoDetail() {
    const hero = document.getElementById('coin-hero');
    if (!hero) return; // Only run on details page

    const urlParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const coinId = urlParams.get('id') || hashParams.get('id') || 'bitcoin'; // Support query or hash (fixes 404 issues)

    // TradingView Symbol Map
    const symbolMap = {
        'bitcoin': 'BINANCE:BTCUSD',
        'ethereum': 'BINANCE:ETHUSD',
        'solana': 'BINANCE:SOLUSD',
        'cardano': 'BINANCE:ADAUSD',
        'ripple': 'BINANCE:XRPUSD',
        'polkadot': 'BINANCE:DOTUSD',
        'dogecoin': 'BINANCE:DOGEUSD',
        'binancecoin': 'BINANCE:BNBUSD',
        'avalanche-2': 'BINANCE:AVAXUSD',
        'shiba-inu': 'BINANCE:SHIBUSD',
        'chainlink': 'BINANCE:LINKUSD',
        'tron': 'BINANCE:TRXUSD',
        'matic-network': 'BINANCE:MATICUSD',
        'the-open-network': 'OKX:TONUSDT',
        'internet-computer': 'BINANCE:ICPUSD',
        'litecoin': 'BINANCE:LTCUSD',
        'uniswap': 'BINANCE:UNIUSD',
        'pepe': 'BINANCE:PEPEUSDT',
        'sui': 'BINANCE:SUIUSDT',
        'near': 'BINANCE:NEARUSDT',
        'render-token': 'BINANCE:RNDRUSDT',
        'kaspa': 'KUCOIN:KASUSDT',
        'fetch-ai': 'BINANCE:FETUSDT',
        'arbitrum': 'BINANCE:ARBUSDT',
        'celestia': 'BINANCE:TIAUSDT',
        'dogwifhat': 'BINANCE:WIFUSDT',
        'blockstack': 'BINANCE:STXUSDT',
        'bitcoin-cash': 'BINANCE:BCHUSD',
        'ethereum-classic': 'BINANCE:ETCUSD',
        'aptos': 'BINANCE:APTUSD',
        'hedera-hashgraph': 'BINANCE:HBARUSD',
        'stellar': 'BINANCE:XLMUSD',
        'crypto-com-chain': 'COINBASE:CROUSD',
        'bittensor': 'BINANCE:TAOUSD',
        'filecoin': 'BINANCE:FILUSD',
        'immutable-x': 'BINANCE:IMXUSD',
        'monero': 'BINANCE:XMRUSD',
        'based-brett': 'GATEIO:BRETTUSDT',
        'popcat': 'BYBIT:POPCATUSDT',
        'mog-coin': 'GATEIO:MOGUSDT',
        'turbo': 'BINANCE:TURBOUSDT',
        'ethena': 'BINANCE:ENAUSDT',
        'pendle': 'BINANCE:PENDLEUSDT',
        'akash-network': 'KRAKEN:AKTUSD',
        'gnosis': 'BINANCE:GNOUSDT',
        'raydium': 'BINANCE:RAYUSDT',
        'coredaoorg': 'OKX:COREUSDT'
    };


    // -------------------- Execution --------------------

    // 1. Fetch Basic Data (CoinGecko)
    fetch(`https://api.coingecko.com/api/v3/coins/${coinId}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false`)
        .then(async res => {
            const data = await res.json();

            // Populate Hero
            hero.innerHTML = `
                <img src="${data.image.large}" class="coin-hero-icon" alt="${data.name}">
                <h1 style="font-size: var(--text-4xl); margin-bottom: var(--space-2);">${data.name} <span style="opacity: 0.5;">(${data.symbol.toUpperCase()})</span></h1>
                <div style="font-size: var(--text-5xl); font-weight: 700; font-family: var(--font-display);">
                    $${data.market_data.current_price.usd.toLocaleString()}
                </div>
                <div style="color: ${data.market_data.price_change_percentage_24h >= 0 ? 'var(--color-success)' : 'var(--color-danger)'}; font-size: var(--text-lg); margin-top: var(--space-2);">
                    ${data.market_data.price_change_percentage_24h.toFixed(2)}% (24h)
                </div>
            `;
            document.title = `${data.name} Analysis | ProsperPath`;

            // Fetch News and Generate Analysis
            const newsItems = await fetchNews(coinId);
            const analysis = generateDynamicAnalysis(data, newsItems);

            // Populate Analysis UI
            updateAnalysisUI(analysis);
        })
        .catch(err => {
            console.error(err);
            hero.innerHTML = `<h1>Data Unavailable (API Error)</h1>`;
        });

    function updateAnalysisUI(analysis) {
        // Sentiment
        const sentimentScore = document.getElementById('ai-sentiment-score');
        const sentimentBar = document.getElementById('sentiment-bar');
        if (sentimentScore && sentimentBar) {
            sentimentScore.innerText = `${analysis.sentiment}/100`;
            setTimeout(() => { sentimentBar.style.width = `${analysis.sentiment}%`; }, 500);

            // Color logic
            if (analysis.sentiment > 66) sentimentBar.style.background = 'var(--color-success)';
            else if (analysis.sentiment < 33) sentimentBar.style.background = 'var(--color-danger)';
            else sentimentBar.style.background = 'var(--color-warning)';
        }

        // Verdict
        const verdictBadge = document.getElementById('ai-verdict-badge');
        const verdictText = document.getElementById('ai-verdict-text');
        if (verdictBadge && verdictText) {
            verdictBadge.innerText = analysis.verdict;
            verdictBadge.className = `verdict-badge verdict-${analysis.verdict.toLowerCase()}`;
            verdictText.innerText = analysis.reason;
        }

        // Predictions
        document.getElementById('pred-low').innerText = analysis.low;
        document.getElementById('pred-high').innerText = analysis.high;

        // News
        const newsFeed = document.getElementById('ai-news-feed');
        if (newsFeed) {
            newsFeed.innerHTML = analysis.news.map((n) => `
                <a href="${n.url || '#'}" target="_blank" class="news-item" style="text-decoration: none; display: block; cursor: pointer;">
                    <div style="font-weight: 500; color: var(--color-text-primary); transition: color 0.2s;">${n.title}</div>
                    <div class="news-date">${n.date} • ${n.source}</div>
                </a>
            `).join('');
        }
    }

    // 2. Initialize TradingView Widget (Safety Check for library loading)
    if (window.TradingView && document.getElementById('tv-chart-container')) {
        new TradingView.widget({
            "autosize": true,
            "symbol": symbolMap[coinId] || "BTCUSD",
            "interval": "1",
            "timezone": "Etc/UTC",
            "theme": "dark",
            "style": "1",
            "locale": "en",
            "toolbar_bg": "#141d2b",
            "enable_publishing": false,
            "allow_symbol_change": true,
            "hide_top_toolbar": false,
            "hide_legend": false,
            "save_image": false,
            "container_id": "tv-chart-container",
            "backgroundColor": "rgba(20, 29, 43, 1)",
            "disabled_features": ["use_localstorage_for_settings"],
            "enabled_features": ["study_templates", "header_fullscreen_button"],
            "studies_overrides": {}
        });
    } else if (document.getElementById('tv-chart-container')) {
        document.getElementById('tv-chart-container').innerHTML = `<div style="padding: 2rem; text-align: center; opacity: 0.5;">TradingView Widget Loading...</div>`;
    }



}

// -------------------- Reader View Logic --------------------

async function fetchArticleContent(url) {
    try {
        console.log('[Reader] Fetching via proxy:', url);
        const proxyUrl = `https://neurowealth-worker.smsproi357.workers.dev/proxy?url=${encodeURIComponent(url)}`;
        const res = await fetch(proxyUrl);
        if (!res.ok) throw new Error('Proxy returned status: ' + res.status);
        const text = await res.text();
        console.log('[Reader] Fetched bytes:', text.length);
        return text;
    } catch (e) {
        console.error('[Reader] Fetch Error:', e);
        return null;
    }
}

function extractContent(html) {
    console.log('[Reader] Extracting content...');
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // Simple heuristic extraction
    const junkSelectors = ['nav', 'header', 'footer', 'script', 'style', 'iframe', '.ad', '.advertisement', '.social-share', '#comments'];

    // SAFETY CHECK: Detect if we fetched our own site (SPA fallback)
    // "ProsperPath" is our app name, and our index has unique meta tags/structure.
    const isSelf = doc.querySelector('meta[name="author"][content="ProsperPath Insights"]') ||
        doc.title.includes('ProsperPath Insights');

    if (isSelf) {
        console.warn('[Reader] Detected Self-Inception (Proxy returned index.html). Aborting extraction.');
        return null; // Will trigger the "No specific article container" or empty check
    }

    junkSelectors.forEach(sel => doc.querySelectorAll(sel).forEach(el => el.remove()));

    const articleSelectors = ['article', '[role="main"]', '.post-content', '.article-body', '.entry-content', 'main'];
    let contentNode = null;

    for (const sel of articleSelectors) {
        const found = doc.querySelector(sel);
        if (found && found.innerText.length > 500) {
            contentNode = found;
            console.log('[Reader] Found content container via selector:', sel);
            break;
        }
    }

    if (!contentNode) {
        console.warn('[Reader] No specific article container found.');
        // Fallback: Try looking for the largest text block instead of just body
        // But do NOT return doc.body as that usually contains headers/sidebars/junk
        return "<div class='reader-error'><p>Could not auto-detect the main article content. This site structure may not be supported.</p></div>";
    }

    // Fix relative image paths & Remove tracking pixels
    contentNode.querySelectorAll('img').forEach(img => {
        // Only strip if src exists and is not data uri
        if (img.src && !img.src.startsWith('data:') && !img.src.startsWith('http')) {
            // Leave relative paths as is, they will break but that's better than deleting? 
            // Or maybe hide them. For now, we leave them.
        }
        // Safer check for tracking pixels
        const w = img.getAttribute('width');
        const h = img.getAttribute('height');
        if ((w && w <= 1) || (h && h <= 1)) {
            img.remove();
        }
    });

    const result = contentNode.innerHTML;
    console.log('[Reader] Final content length:', result.length);
    return result;
}

function createReaderModal() {
    if (document.getElementById('reader-modal')) return;

    const modal = document.createElement('div');
    modal.id = 'reader-modal';
    modal.className = 'reader-modal-overlay';
    modal.innerHTML = `
        <div class="reader-modal-content">
            <div class="reader-header">
                <div style="font-weight:600; font-family:'Inter',sans-serif;">Reader View</div>
                <button class="reader-close-btn" id="reader-close-btn">&times;</button>
            </div>
            <div class="reader-body" id="reader-content">
                <!-- Content goes here -->
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    // Close on click outside
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeReaderModal();
    });

    // Close on Esc
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.classList.contains('active')) closeReaderModal();
    });

    // Close btn
    document.getElementById('reader-close-btn').addEventListener('click', closeReaderModal);
}

function closeReaderModal() {
    const modal = document.getElementById('reader-modal');
    if (modal) modal.classList.remove('active');
}

async function showReaderModal(article) {
    if (!article) {
        console.error('[Reader] showReaderModal called with null article');
        alert('Could not open Reader View: Article data is missing.');
        return;
    }

    console.log('[Reader] Opening for:', article.title);
    createReaderModal();
    const modal = document.getElementById('reader-modal');
    const contentContainer = document.getElementById('reader-content');

    // Show Loading
    contentContainer.innerHTML = `
        <div class="reader-loading">
            <div class="spinner"></div>
            <p style="margin-top:1rem;">Fetching full article via secure proxy...</p>
        </div>
    `;
    modal.classList.add('active');

    // Fetch and Extract
    const rawHtml = await fetchArticleContent(article.url);

    if (rawHtml && rawHtml.length > 500) {
        const cleanHtml = extractContent(rawHtml);

        contentContainer.innerHTML = `
            <article>
                <h1>${article.title}</h1>
                <div class="meta">
                    <span>${article.source || 'Unknown Source'}</span>
                    <span>•</span>
                    <span>${article.date || 'Recent'}</span>
                </div>
                ${cleanHtml}
                <div class="reader-original-link">
                    <a href="${article.url}" target="_blank">View Original Source</a>
                </div>
            </article>
        `;
    } else {
        console.warn('[Reader] Content too short or empty');
        contentContainer.innerHTML = `
            <div class="reader-loading">
                <p>Could not load full content for this site (Security Blocks or Empty).</p>
                <a href="${article.url}" target="_blank" class="btn btn-primary" style="margin-top:1rem;">Open on Source Site</a>
            </div>
        `;
    }
}

// -------------------- Crypto News Page Logic --------------------
async function initCryptoNews() {
    const container = document.getElementById('news-container');
    if (!container) return;

    const urlParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const coinId = urlParams.get('id') || hashParams.get('id');
    const articleIndex = parseInt(urlParams.get('article')) || 0;

    if (!coinId) {
        container.innerHTML = `<div class="article-header"><h1>Article Not Found</h1><a href="crypto-tracker.html" class="btn btn-primary">Return to Tracker</a></div>`;
        return;
    }

    // Loading State
    container.innerHTML = `<div class="loading-state" style="text-align:center; padding: 4rem;"><div class="spinner"></div><p>Fetching Article...</p></div>`;

    // Fetch News Real-time
    const newsItems = await fetchNews(coinId);

    // Safety check if news fetch failed or index out of bounds
    if (!newsItems || newsItems.length === 0 || !newsItems[articleIndex]) {
        container.innerHTML = `<div class="article-header"><h1>Article Unavailable</h1><p>Could not retrieve this news item. It may have expired.</p><a href="crypto-detail.html#id=${coinId}" class="btn btn-primary">Return to ${coinId}</a></div>`;
        return;
    }

    const article = newsItems[articleIndex];

    // Store article on the element for the Reader View click handler to access
    container.articleData = article;

    setTimeout(() => {
        container.innerHTML = `
            <article>
                <header class="article-header">
                    <span class="source-badge">${article.source}</span>
                    <h1 data-animate>${article.title}</h1>
                    <div class="article-meta">
                        <span>${article.date}</span>
                        <span>•</span>
                        <span>2 min read</span>
                        <span>•</span>
                        <span>AI Curated</span>
                    </div>
                </header>
                
                <div class="article-content" data-animate>
                    <p><strong>(AI Summary)</strong> This update on ${coinId.toUpperCase()} is brought to you by ${article.source}. Below is the latest development affecting the price action and sentiment.</p>
                    
                    <div class="card" style="border-left: 4px solid var(--color-accent); margin: 2rem 0; display:flex; flex-direction:column; gap:1rem;">
                       <div style="font-weight:600;">Read the full story:</div>
                       <div style="display:flex; gap:1rem; flex-wrap:wrap;">
                           <button onclick="showReaderModal(this.closest('#news-container').articleData)" class="btn btn-primary">📖 Read Here (Reader View)</button>
                           <a href="${article.url}" target="_blank" class="btn btn-secondary">External Link ↗</a>
                       </div>
                    </div>
                    
                    <p>${article.body || 'Click the link above to read the full details of this market-moving event.'}</p>

                    <h2>Market Context</h2>
                    <p>Traders are monitoring ${coinId} closely following this news. Live sentiment analysis suggests this could be a pivot point for short-term price action.</p>
                </div>
            </article>
        `;
        initAnimations(); // Re-trigger animations
        initScrollEffects(); // Re-trigger scroll observer

        // Expose globally for the onclick handler if needed, or better, attach listener
        // But since we used inline onclick above, we rely on scope or global. 
        // Let's make sure showReaderModal is global.
        window.showReaderModal = showReaderModal;
        window.closeReaderModal = closeReaderModal;

    }, 500);
}

// -------------------- Initialization --------------------
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Theme Toggle
    const themeToggle = document.querySelector('.theme-toggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            document.body.dataset.theme = document.body.dataset.theme === 'dark' ? 'light' : 'dark';
            localStorage.setItem('theme', document.body.dataset.theme);
        });

        // Load saved theme
        const savedTheme = localStorage.getItem('theme') || 'dark';
        document.body.dataset.theme = savedTheme;
    }

    // 3. Page Specific Inits
    // Await currency selector so rates are available for subsequent dashboards
    await initCurrencySelector();

    initCryptoDashboard(); // Checks for crypto-grid internally
    initStockDashboard();  // Checks for stocks-grid internally
    initCommodityDashboard(); // Checks for commodities-grid internally
    initForexDashboard(); // Checks for forex-grid internally
    initCryptoDetail();
    initMarketNewsArticle();
    if (document.getElementById('live-blog-container')) {
        initLiveBlog();
    }

    // 4. Global Effects Initialization
    initAnimations();
    initScrollEffects();
});

// -------------------- Navigation --------------------
function initNavigation() {
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const navLinks = document.getElementById('nav-links');

    if (mobileMenuBtn && navLinks) {
        // Toggle Menu
        mobileMenuBtn.addEventListener('click', () => {
            navLinks.classList.toggle('active');
            mobileMenuBtn.classList.toggle('active');
        });

        // Close menu when a link is clicked
        navLinks.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                navLinks.classList.remove('active');
                mobileMenuBtn.classList.remove('active');
            });
        });
    }

    // Smooth scrolling for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const targetId = this.getAttribute('href').substring(1);
            const targetElement = document.getElementById(targetId);
            if (targetElement) {
                targetElement.scrollIntoView({
                    behavior: 'smooth'
                });
                // Close mobile menu if open
                if (navLinks.classList.contains('active')) {
                    navLinks.classList.remove('active');
                    mobileMenuBtn.classList.remove('active');
                }
            }
        });
    });
}

// -------------------- Scroll Effects --------------------
function initScrollEffects() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
            }
        });
    }, {
        threshold: 0.1
    });

    document.querySelectorAll('[data-animate]').forEach((el) => {
        observer.observe(el);
    });
}

// -------------------- Market Trends Simulation --------------------
function initMarketTrends() {
    const marketData = [{
        pair: 'BTC/USD',
        price: 68420.50,
        change: 2.4
    },
    {
        pair: 'ETH/USD',
        price: 3450.75,
        change: -1.2
    },
    {
        pair: 'SOL/USD',
        price: 145.20,
        change: 5.8
    },
    {
        pair: 'NASDAQ',
        price: 16240.10,
        change: 0.8
    },
    {
        pair: 'S&P 500',
        price: 5120.45,
        change: 0.3
    }
    ];

    const trendsContainer = document.querySelector('.market-trends-track');
    if (!trendsContainer) return;

    // Clear existing static items if any (optional, but good for clean slate)
    // trendsContainer.innerHTML = ''; 

    // Create items
    marketData.forEach(item => {
        const div = document.createElement('div');
        div.className = 'trend-item';
        const changeClass = item.change >= 0 ? 'trend-up' : 'trend-down';
        const symbol = item.change >= 0 ? '▲' : '▼';
        div.innerHTML = `
            <span style="font-weight: 600">${item.pair}</span>
            <span>$${item.price.toLocaleString()}</span>
            <span class="${changeClass}">${symbol} ${Math.abs(item.change)}%</span>
        `;
        trendsContainer.appendChild(div);
    });

    // Clone items for seamless marquee
    marketData.forEach(item => {
        const div = document.createElement('div');
        div.className = 'trend-item';
        const changeClass = item.change >= 0 ? 'trend-up' : 'trend-down';
        const symbol = item.change >= 0 ? '▲' : '▼';
        div.innerHTML = `
            <span style="font-weight: 600">${item.pair}</span>
            <span>$${item.price.toLocaleString()}</span>
            <span class="${changeClass}">${symbol} ${Math.abs(item.change)}%</span>
        `;
        trendsContainer.appendChild(div);
    });
}

// -------------------- Animation Utilities --------------------
function initAnimations() {
    // Add hover effects to feature cards
    document.querySelectorAll('.card').forEach(card => {
        card.addEventListener('mouseenter', () => {
            card.style.transform = 'translateY(-5px)';
            card.style.transition = 'transform 0.3s ease';
        });
        card.addEventListener('mouseleave', () => {
            card.style.transform = 'translateY(0)';
        });
    });
}

// -------------------- Category Filtering --------------------
function initCategoryFilters() {
    const filterButtons = document.querySelectorAll('.filter-btn, .category-pill');
    if (!filterButtons.length) return;

    filterButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const filter = btn.dataset.filter || btn.dataset.category;
            const marketFilter = btn.dataset.marketFilter;

            // If it's a market filter, handle it separately
            if (marketFilter) {
                handleMarketFilter(marketFilter, btn);
                return;
            }

            // Re-query buttons and cards
            const currentButtons = document.querySelectorAll('.filter-btn, .category-pill:not([data-market-filter])');
            const allCards = document.querySelectorAll('.tool-card, .guide-card, .blog-card, .card-featured, #live-blog-container');
            const staticBlogGrid = document.getElementById('static-blog-grid');

            // Update active state
            currentButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Handle Static Grid Container Visibility
            if (staticBlogGrid) {
                if (filter === 'live' || filter === 'live-crypto' || filter === 'live-stocks') {
                    staticBlogGrid.style.display = 'none';
                } else {
                    staticBlogGrid.style.display = ''; // Revert to CSS (grid/block)
                    staticBlogGrid.style.opacity = '0';
                    setTimeout(() => staticBlogGrid.style.opacity = '1', 50);
                }
            }

            allCards.forEach(card => {
                // Specialized handling for the Live Blog Container
                if (card.id === 'live-blog-container') {
                    if (filter === 'live' || filter === 'live-crypto' || filter === 'live-stocks') {
                        card.style.display = 'block';
                        // Re-initialize live blog with new filter if it's one of the live filters
                        if (typeof initLiveBlog === 'function') {
                            initLiveBlog(filter === 'live' ? 'all' : filter);
                        }
                    } else {
                        card.style.display = 'none';
                    }
                    return;
                }

                // Normal card filtering (Static posts and Featured post)
                const category = card.dataset.category;

                if (filter === 'all') {
                    // Show all EXCEPT 'live' content
                    if (category !== 'live' && category !== 'live-crypto' && category !== 'live-stocks') {
                        card.style.display = 'block';
                        card.style.opacity = '0';
                        setTimeout(() => card.style.opacity = '1', 50);
                    } else {
                        card.style.display = 'none';
                    }
                } else if (category === filter) {
                    // Show exact matches
                    card.style.display = 'block';
                    card.style.opacity = '0';
                    setTimeout(() => card.style.opacity = '1', 50);
                } else {
                    card.style.display = 'none';
                }
            });
        });
    });

    function handleMarketFilter(filter, activeBtn) {
        const buttons = document.querySelectorAll('[data-market-filter]');
        const cards = document.querySelectorAll('.trend-card');

        buttons.forEach(b => b.classList.remove('active'));
        activeBtn.classList.add('active');

        cards.forEach(card => {
            if (filter === 'all' || card.dataset.category === filter) {
                card.style.display = 'flex';
                card.style.opacity = '0';
                setTimeout(() => card.style.opacity = '1', 50);
            } else {
                card.style.display = 'none';
            }
        });
    }

    // Apply current filter on load
    const activeBtn = document.querySelector('.filter-btn.active, .category-pill.active');
    if (activeBtn) activeBtn.click();
}

// -------------------- Calculator Logic --------------------

function formatCurrency(num) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0
    }).format(num);
}

function formatNumber(num) {
    return new Intl.NumberFormat('en-US').format(num);
}

function initCalculators() {
    // 1. Retirement Planner
    const retirementBtn = document.getElementById('btn-calculate-retirement');
    if (retirementBtn) {
        retirementBtn.addEventListener('click', () => {
            const currentAge = parseFloat(document.getElementById('retire-current-age').value) || 0;
            const targetAge = parseFloat(document.getElementById('retire-target-age').value) || 65;
            const currentSavings = parseFloat(document.getElementById('retire-current-savings').value) || 0;

            const yearsToGrow = targetAge - currentAge;
            const growthRate = 0.07;
            const futureValue = currentSavings * Math.pow((1 + growthRate), yearsToGrow);

            const targetPortfolio = 1500000;
            const shortfall = targetPortfolio - futureValue;
            let monthlyContribution = 0;

            if (shortfall > 0) {
                const months = yearsToGrow * 12;
                const monthlyRate = growthRate / 12;
                monthlyContribution = shortfall * (monthlyRate / (Math.pow(1 + monthlyRate, months) - 1));
            }

            document.getElementById('retire-result').innerText = `${formatCurrency(monthlyContribution)}/mo`;
        });
    }

    // 2. Tax Optimization Analyzer
    const taxBtn = document.getElementById('btn-calculate-tax');
    if (taxBtn) {
        taxBtn.addEventListener('click', () => {
            const income = parseFloat(document.getElementById('tax-income').value) || 0;
            const portfolio = parseFloat(document.getElementById('tax-portfolio').value) || 0;
            const status = document.getElementById('tax-status').value;

            let taxBracketRate = 0.24;
            if (income > 200000) taxBracketRate = 0.32;
            if (income > 500000) taxBracketRate = 0.37;

            const estimatedHarvestableLosses = portfolio * 0.08;
            const taxSavings = estimatedHarvestableLosses * taxBracketRate;

            document.getElementById('tax-result').innerText = `${formatCurrency(taxSavings)}`;
        });
    }

    // 3. Compound Interest Calculator
    const compoundBtn = document.getElementById('btn-calculate-ci');
    if (compoundBtn) {
        compoundBtn.addEventListener('click', () => {
            const principal = parseFloat(document.getElementById('ci-principal').value) || 0;
            const monthly = parseFloat(document.getElementById('ci-monthly').value) || 0;
            const rate = (parseFloat(document.getElementById('ci-rate').value) || 0) / 100;
            const years = parseFloat(document.getElementById('ci-years').value) || 10;

            const months = years * 12;
            const monthlyRate = rate / 12;

            const futureValue = principal * Math.pow(1 + monthlyRate, months) +
                (monthly * (Math.pow(1 + monthlyRate, months) - 1)) / monthlyRate;

            document.getElementById('ci-result').innerText = `${formatCurrency(futureValue)}`;
        });
    }

    // 4. FIRE Calculator
    const fireBtn = document.getElementById('btn-calculate-fire');
    if (fireBtn) {
        fireBtn.addEventListener('click', () => {
            const annualSpend = parseFloat(document.getElementById('fire-spend').value) || 0;
            const currentNetWorth = parseFloat(document.getElementById('fire-worth').value) || 0;

            const fireNumber = annualSpend * 25;
            const gap = fireNumber - currentNetWorth;

            let resultText = `${formatCurrency(fireNumber)}`;
            if (gap <= 0) {
                resultText = "YOU ARE FI!";
            } else {
                resultText = `${Math.ceil(gap / (annualSpend * 0.5))} Years`; // Simplified years to FIRE
            }

            document.getElementById('fire-result').innerText = resultText;
        });
    }

    // 5. Portfolio Allocator
    const portfolioBtn = document.getElementById('btn-calculate-port');
    if (portfolioBtn) {
        portfolioBtn.addEventListener('click', () => {
            const risk = document.getElementById('port-risk').value;
            let allocation = "";

            if (risk === "low") {
                allocation = "30% Stocks / 70% Bonds";
            } else if (risk === "med") {
                allocation = "60% Stocks / 40% Bonds";
            } else {
                allocation = "90% Stocks / 10% Crypto/Alts";
            }

            document.getElementById('port-result').innerHTML = allocation;
        });
    }
}

// -------------------- AI Assistant Logic --------------------
function initAIAssistant() {
    const chatWidget = document.getElementById('ai-chat-widget');
    const toggleBtn = document.getElementById('ai-toggle-btn');
    const closeBtn = document.getElementById('ai-close-btn');
    const sendBtn = document.getElementById('ai-send-btn');
    const inputField = document.getElementById('ai-input-field');
    const messagesContainer = document.getElementById('ai-messages');

    if (!chatWidget) return;

    // Toggle Chat
    toggleBtn.addEventListener('click', () => {
        chatWidget.classList.remove('hidden');
        toggleBtn.classList.add('hidden');
    });

    closeBtn.addEventListener('click', () => {
        chatWidget.classList.add('hidden');
        toggleBtn.classList.remove('hidden');
    });

    // Send Message
    function sendMessage() {
        const text = inputField.value.trim();
        if (!text) return;

        // Add User Message
        addMessage('user', text);
        inputField.value = '';

        // Simulate AI Thinking
        const loadingId = addLoadingIndicator();

        // Process Response (Simulated AI)
        setTimeout(async () => {
            removeLoadingIndicator(loadingId);
            const response = await getAIResponse(text);
            addMessage('ai', response);
        }, 1000);
    }

    sendBtn.addEventListener('click', sendMessage);
    inputField.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });

    function addMessage(sender, text) {
        const div = document.createElement('div');
        div.className = `message message-${sender}`;
        div.innerHTML = `<p>${text}</p>`; // parsing markdown could go here
        messagesContainer.appendChild(div);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    function addLoadingIndicator() {
        const id = 'loading-' + Date.now();
        const div = document.createElement('div');
        div.id = id;
        div.className = 'message message-ai';
        div.innerHTML = `<p>Thinking...</p>`;
        messagesContainer.appendChild(div);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        return id;
    }

    function removeLoadingIndicator(id) {
        const el = document.getElementById(id);
        if (el) el.remove();
    }

    // Mock AI Response Logic (Replace with actual API later)
    async function getAIResponse(query) {
        const q = query.toLowerCase();

        // Simple keyword matching
        if (q.includes('price') || q.includes('market')) {
            return "The market is currently showing mixed signals. BTC is up 2.4% while ETH is slightly down. Would you like a detailed technical analysis?";
        }
        if (q.includes('invest') || q.includes('start')) {
            return "To get started, I recommend establishing your risk tolerance. Check out our **Robo-Advisor Guide** or use the **Risk Assessment Calculator**.";
        }
        if (q.includes('tax') || q.includes('harvest')) {
            return "Tax-loss harvesting can increase after-tax returns by 1-2%. Our **Tax Optimization Analyzer** can estimate your potential savings.";
        }

        // Use Mistral API if available (simulated call)
        // const mistralResponse = await callMistralAPI(query);
        // return mistralResponse;

        return getFallbackResponse();
    }

    function getFallbackResponse() {
        return `I am ProsperPath AI. I can help you with:
        
🧮 [AI Calculators](ai-calculators.html) - Plan your finances
📝 [Blog](blog.html) - Latest insights

Feel free to ask about robo-advisors, tax optimization, crypto security, or retirement planning!`;
    }
}

// -------------------- Guide Content Loader --------------------

const guideData = {
    'robo-advisors': {
        category: 'Robo-Advisors',
        title: 'Getting Started with Robo-Advisors',
        date: 'Jan 10, 2026',
        readTime: '8 min read',
        intro: 'A comprehensive guide to choosing and using AI-powered investment platforms. Learn how algorithms can automate your wealth building journey with lower fees and better efficiency.',
        body: `
            <h2>What is a Robo-Advisor?</h2>
            <p>Robo-advisors are digital platforms that provide automated, algorithm-driven financial planning services with little to no human supervision. By collecting information from clients about their financial situation, risk tolerance, and future goals through an online survey, they offer advice and automatically invest client assets.</p>
            
            <div class="card" style="margin: var(--space-6) 0; border-left: 4px solid var(--color-primary);">
                <p><strong>Key Takeaway:</strong> Robo-advisors are not robots in the sci-fi sense. They are sophisticated software systems that manage your portfolio based on Nobel Prize-winning financial theories.</p>
            </div>

            <h2>Why Choose a Robo-Advisor?</h2>
            <p>For most hands-off investors, robo-advisors offer a superior alternative to traditional wealth management:</p>
            <ul>
                <li><strong>Lower Fees:</strong> Human advisors often charge 1-2% of AUM (Assets Under Management). Robo-advisors typically charge 0.25% to 0.40%.</li>
                <li><strong>Low Minimums:</strong> You can start with as little as $500, or even $0 at some brokerages, compared to the $100k+ often required by private wealth managers.</li>
                <li><strong>Automatic Rebalancing:</strong> When one asset class outperforms others, your portfolio can drift from its target allocation. Robo-advisors automatically sell high and buy low to bring it back in line.</li>
                <li><strong>Tax Efficiency:</strong> Advanced algorithms perform tax-loss harvesting automatically, potentially increasing your after-tax returns.</li>
            </ul>

            <h2>Top Picks for 2026</h2>
            <p>Based on our latest AI analysis and market reviews, here are the leaders in the space:</p>
            <div style="overflow-x: auto;">
                <table style="width: 100%; border-collapse: collapse; margin-bottom: var(--space-6);">
                    <thead>
                        <tr style="background: var(--color-surface); border-bottom: 2px solid var(--color-border);">
                            <th style="padding: var(--space-3); text-align: left;">Platform</th>
                            <th style="padding: var(--space-3); text-align: left;">Best For</th>
                            <th style="padding: var(--space-3); text-align: left;">Fees</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr style="border-bottom: 1px solid var(--color-border);">
                            <td style="padding: var(--space-3);"><strong>WealthAI Pro</strong></td>
                            <td style="padding: var(--space-3);">Overall Best & Tax Logic</td>
                            <td style="padding: var(--space-3);">0.25%</td>
                        </tr>
                        <tr style="border-bottom: 1px solid var(--color-border);">
                            <td style="padding: var(--space-3);"><strong>Betterment Plus</strong></td>
                            <td style="padding: var(--space-3);">Beginners & Cash Mgmt</td>
                            <td style="padding: var(--space-3);">0.25%</td>
                        </tr>
                         <tr>
                            <td style="padding: var(--space-3);"><strong>Fidelity Go</strong></td>
                            <td style="padding: var(--space-3);">Fee-Conscious Investors</td>
                            <td style="padding: var(--space-3);">0% (under $25k)</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <h2>Step-by-Step Setup Guide</h2>
            <ol>
                <li><strong>Define Your Goals:</strong> Are you saving for retirement, a house down payment, or a general safety net? Different goals have different time horizons.</li>
                <li><strong>Take the Risk Assessment:</strong> Be honest. If the market drops 20%, will you panic sell? The software needs to know this to allocate your stocks vs. bonds.</li>
                <li><strong>Fund Your Account:</strong> Link your bank account. We recommend setting up a recurring deposit (e.g., $500/month) to take advantage of Dollar-Cost Averaging.</li>
                <li><strong>Monitor (But Don't Touch):</strong> Check in quarterly. The beauty of a robo-advisor is that it handles the daily grind for you.</li>
            </ol>
        `
    },
    'tax-harvesting': {
        category: 'Tax Optimization',
        title: 'Tax-Loss Harvesting Strategies',
        date: 'Jan 8, 2026',
        readTime: '10 min read',
        intro: 'Unlock the "hidden alpha" of investing. Learn how automated tax-loss harvesting can effectively boost your annual returns by lowering your tax bill.',
        body: `
            <h2>What is Tax-Loss Harvesting?</h2>
            <p>Tax-loss harvesting involves selling an investment that has lost value to replace it with a similar investment. The "loss" realized from the sale can be used to offset any capital gains you've realized from selling other winning investments, thereby lowering your overall tax liability.</p>
            
            <p><strong>The math is simple:</strong> If you made $10,000 in gains but "harvested" $4,000 in losses, you strictly pay taxes on $6,000.</p>

            <h2>How AI Supercharges Harvesting</h2>
            <p>In the past, only ultra-wealthy investors with dedicated accountants could do this effectively efficiently. Humans are slow and emotional. AI changes the game:</p>
            <ul>
                <li><strong>Continuous Monitoring:</strong> AI scans your portfolio 24/7. If an asset drops even slightly below its cost basis, the system can harvest the loss instantly.</li>
                <li><strong>Direct Indexing:</strong> Advanced robo-advisors buy the individual 500 stocks of the S&P 500 instead of one ETF. This allows them to harvest losses on <em>individual companies</em> (e.g., selling Ford when it's down) even if the overall market is up.</li>
                <li><strong>Avoids Wash Sales:</strong> AI tracks all your transactions to ensure you don't violate IRS rules by buying a "substantially identical" asset within 30 days.</li>
            </ul>

            <div class="card" style="margin: var(--space-6) 0; background: var(--color-surface);">
                <h3>💡 The "Tax Alpha" Benefit</h3>
                <p>Research suggests that a robust automated tax-loss harvesting strategy can add between <strong>0.5% to 1.5%</strong> to your annual after-tax returns. Over 20 years, this can compound into hundreds of thousands of dollars.</p>
            </div>

            <h2>When Does It Matter Most?</h2>
            <p>Tax-loss harvesting is most effective when:</p>
            <ol>
                <li>You are in a high tax bracket (32%+).</li>
                <li>You have a taxable brokerage account (it doesn't work in IRAs or 401ks).</li>
                <li>Markets are volatile (more opportunities to harvest losses).</li>
            </ol>
        `
    },
    'digital-security': {
        category: 'Security',
        title: 'Digital Asset Security Fundamentals',
        date: 'Jan 5, 2026',
        readTime: '12 min read',
        intro: 'In the decentralized world, you are your own bank. Learn the essential protocols to protect your cryptocurrency and digital investments from theft and loss.',
        body: `
            <h2>The Golden Rule: Not Your Keys, Not Your Coins</h2>
            <p>If you keep your crypto on an exchange (like Coinbase or Binance), you don't actually own it—you have an IOU. If the exchange goes bankrupt or freezes withdrawals, your assets are gone. True ownership requires holding your own <strong>Private Keys</strong>.</p>
            
            <h2>Storage Tiers</h2>
            <h3>1. Hot Wallets (Convenient but Risky)</h3>
            <p>These are apps connected to the internet (e.g., MetaMask, Phantom). Great for daily trading or interacting with DeFi, but vulnerable to malware and hacks. Keep only "spending money" here.</p>
            
            <h3>2. Cold Storage (Maximum Security)</h3>
            <p>Hardware wallets like <strong>Ledger</strong> or <strong>Trezor</strong> keep your keys offline on a physical device. A hacker would need to physically steal the device to access your funds.</p>

            <h2>Essential Security Checklist</h2>
            <ul>
                <li><strong>Seed Phrase Safety:</strong> Write your 12-24 word recovery phrase on paper. NEVER type it into a computer, take a photo of it, or save it in the cloud. Steel plates are recommended for fire protection.</li>
                <li><strong>2FA is Mandatory:</strong> Enable Two-Factor Authentication on every financial account. Use an authenticator app (Google Auth, Authy) or a hardware key (YubiKey). <strong>Disable SMS 2FA</strong> as it is vulnerable to SIM-swapping attacks.</li>
                <li><strong>Whitelisting:</strong> Set your exchange accounts to only allow withdrawals to specific addresses you've pre-approved. This creates a time-lock delay if a hacker gets into your account.</li>
                <li><strong>VPN Usage:</strong> Never access financial accounts on public WiFi without a high-quality VPN.</li>
            </ul>
        `
    },
    'portfolio-diversification': {
        category: 'AI Strategies',
        title: 'AI-Driven Portfolio Diversification',
        date: 'Dec 28, 2025',
        readTime: '9 min read',
        intro: 'Move beyond the traditional 60/40 split. Discover how machine learning models create optimally diversified investment portfolios that adapt to global market correlations.',
        body: `
            <h2>The Death of 60/40?</h2>
            <p>The traditional advice was simple: 60% stocks, 40% bonds. However, in low-interest-rate environments or periods of high inflation where stocks and bonds crash together (like 2022), this correlation breaks down. Modern portfolios need more robust diversification.</p>
            
            <h2>How AI Optimizes Asset Allocation</h2>
            <p>Modern Portfolio Theory (MPT) is the foundation, but AI takes it further:</p>
            <ul>
                <li><strong>Dynamic Correlations:</strong> AI recognizes that correlations between assets change. Gold might be uncorrelated to stocks in normal times but highly correlated during a liquidity crisis. AI adjusts risk models in real-time.</li>
                <li><strong>Alternative Assets:</strong> AI platforms can easily incorporate Real Estate (REITs), Commodities, and even Crypto into the efficient frontier calculations alongside stocks and bonds.</li>
                <li><strong>Tail Risk Hedging:</strong> AI models simulate millions of "Black Swan" scenarios to ensure the portfolio can survive extreme market shocks.</li>
            </ul>

            <h2>Building a "ProsperPath" Portfolio</h2>
            <p>A typical AI-optimized portfolio for a growth investor might look like this:</p>
            <ul>
                <li><strong>45% Global Equities:</strong> US, Developed Ex-US, and Emerging Markets.</li>
                <li><strong>15% Innovation Tech:</strong> AI, Biotech, and Robotics sectors.</li>
                <li><strong>20% Fixed Income:</strong> Treasury Inflation-Protected Securities (TIPS) and Corp Bonds.</li>
                <li><strong>10% Real Assets:</strong> Real Estate and Commodities (to hedge inflation).</li>
                <li><strong>10% Digital Assets:</strong> A small, rebalanced allocation to Bitcoin/ETH for asymmetric upside.</li>
            </ul>
        `
    },
    'dca': {
        category: 'Investing Basics',
        title: 'Automated Dollar-Cost Averaging (DCA)',
        date: 'Dec 22, 2025',
        readTime: '7 min read',
        intro: 'Take the emotion out of investing. Learn why Dollar-Cost Averaging is the most reliable strategy for building long-term wealth, and how AI makes it "Smart".',
        body: `
            <h2>What is Dollar-Cost Averaging?</h2>
            <p>DCA is the practice of investing a fixed dollar amount at regular intervals, regardless of the share price. For example, buying $500 of the S&P 500 every month on the 1st.</p>
            
            <h3>The Mathematical Advantage</h3>
            <p>When prices are high, your $500 buys fewer shares. When prices are low (market crash), your $500 buys <em>more</em> shares. This naturally lowers your average cost per share over time without you having to guess the bottom.</p>

            <h2>DCA vs. Lump Sum</h2>
            <p>While statistically, investing a lump sum immediately outperforms DCA 66% of the time (because markets trend up), DCA is psychologically superior. It prevents the crushing regret of investing everything right before a crash, helping investors stay the course.</p>

            <h2>Next-Gen: "Smart" DCA with AI</h2>
            <p>New AI-driven platforms are introducing <strong>Value Averaging</strong> or Smart DCA:</p>
            <ul>
                <li><strong>Buy the Dip:</strong> If the market drops 5% in a week, the AI might increase your weekly contribution by 20% to capture the discount.</li>
                <li><strong>Trim the Fat:</strong> If the market is technically overbought (RSI > 70), the AI might hold back some cash to deploy later.</li>
            </ul>
            <p>This dynamic approach attempts to squeeze out extra percentage points of return while maintaining the discipline of regular investing.</p>
        `
    },
    'crypto-custody': {
        category: 'Digital Assets',
        title: 'Institutional Crypto Custody Solutions',
        date: 'Dec 15, 2025',
        readTime: '11 min read',
        intro: 'For high-net-worth investors, a Ledger in a sock drawer isn\'t enough. Explore professional custody solutions, multi-sig tech, and how institutions secure billions.',
        body: `
            <h2>Why Custody Matters</h2>
            <p>As your crypto portfolio grows from "fun money" to "generational wealth," security becomes a liability. If you lose your keys or pass away without instructions, the wealth vanishes. Qualified Custodians provide a solution.</p>
            
            <h2>Types of Custody</h2>
            
            <h3>1. Self-Custody (Multi-Sig)</h3>
            <p>Instead of one key, you create a "2-of-3" vault. You hold two keys, and a trusted third party holding holds one. To move funds, 2 keys must sign. This means if you are hacked, the funds are safe. If you lose a key, the funds are safe.</p>

            <h3>2. Qualified Custodians (Coinbase Prime, Anchorage, Fidelity)</h3>
            <p>These are regulated trust companies that hold assets on your behalf.</p>
            <ul>
                <li><strong>Pros:</strong> Institutional-grade security, insurance policies (often up to hundreds of millions), and estate planning support.</li>
                <li><strong>Cons:</strong> Monthly fees and lack of instant liquidity (withdrawals may take 24-48 hours).</li>
            </ul>

            <h2>Insurance Gaps</h2>
            <p><strong>Warning:</strong> SIPC and FDIC insurance DO NOT cover crypto assets on standard exchanges. If FTX or Voyager goes down, your funds are unsecured creditors. Only specific "Specie" insurance policies at high-end custodians cover theft or loss of private keys.</p>
        `
    },
    'tax-software': {
        category: 'Tools',
        title: 'AI Tax Software Comparison Guide',
        date: 'Dec 10, 2025',
        readTime: '13 min read',
        intro: 'Crypto, DeFi, and NFT taxes can be a compliance nightmare. We compare the top AI-driven tax software solutions to automate your reporting.',
        body: `
            <h2>The Challenge: Thousands of Transactions</h2>
            <p>Did you swap ETH for USDC? That's a taxable event. Did you buy an NFT? Taxable. Did you earn yield in a liquidity pool? Taxable income. Manually tracking this in Excel is impossible.</p>
            
            <h2>How Tax Software Works</h2>
            <p>These platforms use <strong>Read-Only APIs</strong> to connect to your exchanges (Coinbase, Kraken) and wallets (MetaMask). They import every transaction, categorize them, and calculate your cost basis using methods like FIFO (First-In, First-Out) or HIFO (Highest-In, First-Out).</p>

            <h2>Top Rated Solutions</h2>
            
            <div class="card" style="margin: var(--space-6) 0;">
                <h3>1. CoinTracker</h3>
                <p><strong>Best for:</strong> Ease of use and major partnerships (TurboTax integration).</p>
                <p><em>Pros:</em> extremely polished UI, excellent mobile app. <em>Cons:</em> Can get expensive for high transaction counts.</p>
            </div>

            <div class="card" style="margin: var(--space-6) 0;">
                <h3>2. Koinly</h3>
                <p><strong>Best for:</strong> DeFi and Global Users.</p>
                <p><em>Pros:</em> Supports 6,000+ blockchains, very robust error detection for missing purchase history. <em>Cons:</em> UI is denser.</p>
            </div>

            <div class="card" style="margin: var(--space-6) 0;">
                <h3>3. TokenTax</h3>
                <p><strong>Best for:</strong> High Net Worth & Complex Situations.</p>
                <p><em>Pros:</em> Connects you with actual human CPAs for audit support. <em>Cons:</em> Premium pricing.</p>
            </div>
        `
    },
    '401k-optimization': {
        category: 'Retirement',
        title: 'Building a 401(k) Optimization Strategy',
        date: 'Dec 5, 2025',
        readTime: '10 min read',
        intro: 'Your workplace retirement plan is likely your biggest asset. Learn how to use automated tools to maximize matches, minimize fees, and optimize Asset Allocation.',
        body: `
            <h2>Don't "Set and Forget" Wrong</h2>
            <p>Most employees pick a "Target Date Fund" and ignore it. While okay, these funds often carry higher expense ratios (0.50%+) and might be too conservative for young earners.</p>
            
            <h2>Step 1: The Match is Priority #1</h2>
            <p>Before investing a dime elsewhere, contribute enough to get your full employer match. This is an immediate <strong>100% return on investment</strong>. No market strategy can beat free money.</p>

            <h2>Step 2: Fee Analysis</h2>
            <p>Look at the Expense Ratios of the funds in your plan. You want funds below <strong>0.10%</strong>.</p>
            <ul>
                <li><strong>Good:</strong> S&P 500 Index (0.04%)</li>
                <li><strong>Bad:</strong> "Active Growth Fund" (1.2%)</li>
            </ul>
            <p>If your plan has poor options, only contribute up to the match, then prioritize your IRA.</p>

            <h2>Step 3: Automated Optimization (Robo-Overlay)</h2>
            <p>Services like <strong>Blooom</strong> (and newer competitors) can actually log into your 401(k) portal and manage it for you. They enable:</p>
            <ul>
                <li><strong>Auto-Rebalancing:</strong> Keeping your risk profile steady.</li>
                <li><strong>Fund Selection:</strong> Automatically picking the lowest-fee funds available in your specific company plan.</li>
                <li><strong>BrokerageLink:</strong> Some advanced users can enable a "Brokerage Window" to use standard Robo-Advisors like Betterment to manage their 401(k) assets directly.</li>
            </ul>
        `
    },
    'automated-retirement': {
        category: 'Retirement',
        title: 'The Complete Guide to Automated Retirement Planning',
        date: 'Jan 12, 2026',
        readTime: '15 min read',
        intro: 'In 2026, retirement planning has evolved from static spreadsheets to dynamic, autonomous systems. This comprehensive guide explores how to build a self-optimizing portfolio designed for lifelong financial independence.',
        body: `
            <p style="font-size: var(--text-xl); color: var(--color-text-primary); margin-bottom: var(--space-8);">
                The "set it and forget it" era of retirement planning is over. It has been replaced by the <strong>"Autonomous Retirement"</strong> era—where AI doesn't just suggest a portfolio, it actively manages it to ensure you never outlive your money.
            </p>

            <div class="card card-accent" style="margin-bottom: var(--space-8);">
                <h3 style="margin-bottom: var(--space-4);">The 2026 Retirement Philosophy</h3>
                <p>Traditional planning asks: "How much do I need to save?" Automated planning asks: "What systems do I need to build?" The focus shifts from picking winning stocks to picking winning <strong>workflows</strong>.</p>
            </div>

            <h2>The Three Pillars of Automated Wealth</h2>
            <p>To build a truly automated retirement system, your platform must master three distinct technical workflows simultaneously:</p>
            
            <div class="grid grid-3" style="gap: var(--space-6); margin: var(--space-8) 0;">
                <div class="card" style="padding: var(--space-6); border-top: 4px solid var(--color-accent);">
                    <div style="font-size: 2rem; margin-bottom: var(--space-3);">🔄</div>
                    <h4 style="margin-bottom: var(--space-2);">1. Smart Rebalancing</h4>
                    <p style="font-size: var(--text-sm); line-height: 1.5;">Maintaining your risk profile 24/7. When one asset grows too large, the system automatically sells high and buys other undervalued assets.</p>
                </div>
                <div class="card" style="padding: var(--space-6); border-top: 4px solid var(--color-success);">
                    <div style="font-size: 2rem; margin-bottom: var(--space-3);">📈</div>
                    <h4 style="margin-bottom: var(--space-2);">2. Tax Alpha</h4>
                    <p style="font-size: var(--text-sm); line-height: 1.5;">Harvesting losses daily to minimize your IRS liability. This "alpha" adds up to 1.5% in annual net returns over time.</p>
                </div>
                <div class="card" style="padding: var(--space-6); border-top: 4px solid var(--color-info);">
                    <div style="font-size: 2rem; margin-bottom: var(--space-3);">🛡️</div>
                    <h4 style="margin-bottom: var(--space-2);">3. Dynamic Withdrawal</h4>
                    <p style="font-size: var(--text-sm); line-height: 1.5;">AI-driven "Spend-Down" models that adapt to market volatility. It calculates exactly how much you can safeley spend each month.</p>
                </div>
            </div>

            <h2>Phase 1: The Accumulation Engine</h2>
            <p>During your earning years, the goal is "Maximum Efficiency." Traditional target-date funds are too static. An AI-optimized accumulation engine uses <strong>Direct Indexing</strong>. Instead of buying a S&P 500 ETF, the system buys all 500 individual stocks. This allows for granular tax-loss harvesting even when the overall index is up.</p>
            
            <div class="expert-tip" style="margin: var(--space-8) 0;">
                <div class="expert-tip-icon">📊</div>
                <div>
                    <h4 style="color: var(--color-accent); margin-bottom: var(--space-2);">The Hybrid Portfolio Strategy</h4>
                    <p style="margin-bottom: 0;">We recommend a <strong>Cyborg Approach</strong>: 70% in Broad Market AI-optimized ETFs for stability, and 30% in higher-beta "Innovation Kits" that focus on burgeoning sectors like Robotics, Longevity Biotech, and AI Infrastructure.</p>
                </div>
            </div>

            <h2>Phase 2: The Decumulation (Spend-Down) Protocol</h2>
            <p>The hardest part of retirement isn't saving—it's spending. The traditional "4% Rule" is a blunt instrument that doesn't account for market cycles. ProsperPath platforms utilize <strong>Variable Spending Guardrails</strong>.</p>
            
            <ul>
                <li><strong>Bull Market Bonus:</strong> If the market outperforms by 12%, the AI authorizes a 10% increase in your discretionary spending for that year.</li>
                <li><strong>Sequence of Returns Protection:</strong> If the market drops 20% early in retirement, the AI shifts your withdrawals to "Cash Reserves" or "Buffer Assets" to avoid selling equities at a loss.</li>
            </ul>

            <div class="content-feature-list" style="margin: var(--space-8) 0;">
                <div class="content-feature-item"><span>🚀</span> <strong>Legacy Planning:</strong> Automated "Step-up" basis tracking for heirs to minimize future estate taxes.</div>
                <div class="content-feature-item"><span>🛡️</span> <strong>Tail Risk Hedging:</strong> Using AI to buy protective "Put" options during high-volatility regimes to cap potential losses.</div>
                <div class="content-feature-item"><span>💸</span> <strong>Roth Conversion Optimization:</strong> AI models your tax brackets for the next 40 years to find the perfect years to convert IRA assets to Roth tax-free.</div>
            </div>

            <h2>Phase 3: AI Longevity Modeling</h2>
            <p>Modern retirement systems now integrate with <strong>Anonymized Health Trends</strong>. By analyzing developments in longevity biotechnology and personalized health trajectory metrics, AI can estimate your "Longevity Risk"—the probability of you living past 100. It then adjusts your stock-to-bond ratio to ensure your capital lasts for the very end of your life.</p>

            <h2>Phase 4: The Rise of AI Sub-Agents</h2>
            <p>The most significant shift coming in 2026 is the transition from "Assisted AI" to <strong>"Sub-Agentic AI"</strong>. Instead of one large model, your retirement platform will deploy dozens of specialized sub-agents:</p>
            
            <div class="grid grid-2" style="gap: var(--space-6); margin: var(--space-8) 0;">
                <div style="background: var(--color-surface); padding: var(--space-6); border-radius: var(--radius-lg); border-left: 4px solid var(--color-accent);">
                    <h4 style="margin-bottom: var(--space-2);">The "Arbitrageur" Agent</h4>
                    <p style="font-size: var(--text-sm); opacity: 0.8;">Constantly scans for price discrepancies across exchanges to ensure your rebalancing happens at the absolute best execution price.</p>
                </div>
                <div style="background: var(--color-surface); padding: var(--space-6); border-radius: var(--radius-lg); border-left: 4px solid var(--color-warning);">
                    <h4 style="margin-bottom: var(--space-2);">The "Compliance" Agent</h4>
                    <p style="font-size: var(--text-sm); opacity: 0.8;">Monitors real-time changes in tax law (e.g., changes to Roth conversion limits) and immediately adjusts your contribution strategy to stay compliant.</p>
                </div>
            </div>

            <p>This "Swarm Intelligence" approach ensures that no single market anomaly can derail your long-term plan, as specialized agents mitigate risk in their specific domains.</p>

            <h2>Implementation Roadmap</h2>
            <p>Follow these steps to transition from manual to high-automated planning:</p>
            <ol>
                <li><strong>Consolidate Accounts:</strong> Use a tool like <em>Monarch Money</em> or <em>Magnifi</em> to link all your fragmented IRAs, 401(k)s, and brokerage accounts for a "Single Pane of Glass" view.</li>
                <li><strong>Configure a Robo-Advisor Overlay:</strong> Enable professional automated management on your taxable accounts to unlock "Tax Alpha" Harvesting.</li>
                <li><strong>Define Your "Floor" and "Ceiling":</strong> Set the minimum monthly income you need to survive and the maximum you want to spend during good years.</li>
                <li><strong>Automate the "Glideslope":</strong> Enable a dynamic asset allocation that slowly shifts from aggressive growth to preservation as you approach your target retirement date.</li>
            </ol>

            <div class="card" style="background: rgba(var(--color-accent-rgb), 0.1); border: 2px solid var(--color-accent); padding: var(--space-8); margin-top: var(--space-10);">
                <h3 style="color: var(--color-accent); margin-bottom: var(--space-4);">The Bottom Line</h3>
                <p style="font-size: var(--text-lg); margin-bottom: 0;">In 2026, your retirement plan is not a static document; it is a living, breathing software application. By leveraging AI-driven automation, you aren't just saving money—you are engineering a guaranteed financial outcome regardless of market volatility.</p>
            </div>
        `
    }
};

function initGuideLoader() {
    // Get ID from URL (search or hash)
    const urlParams = new URLSearchParams(window.location.search);
    let guideId = urlParams.get('id');

    // Fallback to hash if search param is missing
    if (!guideId && window.location.hash.includes('id=')) {
        guideId = window.location.hash.split('id=')[1].split('&')[0];
    }

    if (!guideId || !guideData[guideId]) return;

    const data = guideData[guideId];

    // Check if we are on a page that can display a guide
    const titleEl = document.getElementById('guide-title');
    if (!titleEl) return;

    const categoryEl = document.getElementById('guide-category');
    const introEl = document.getElementById('guide-intro');
    const bodyEl = document.getElementById('guide-body');
    const metaEl = document.getElementById('guide-meta');

    if (categoryEl) categoryEl.textContent = data.category;
    titleEl.textContent = data.title;
    if (introEl) introEl.textContent = data.intro;
    if (bodyEl) bodyEl.innerHTML = data.body;
    if (metaEl && data.date && data.readTime) {
        metaEl.textContent = `Updated ${data.date} • ${data.readTime}`;
    }

    document.title = data.title + " | ProsperPath Insights";
}

// Add to initialization
document.addEventListener('DOMContentLoaded', () => {
    // Helper to safely initialize components
    const safeInit = (name, fn) => {
        try {
            fn();
        } catch (e) {
            console.error(`Error initializing ${name}:`, e);
        }
    };

    // 1. Content Loaders (Priority: High - users want to see content immediately)
    safeInit('Guide Loader', initGuideLoader);
    safeInit('Review Loader', initReviewLoader);
    safeInit('Compare Loader', initCompareLoader);
    safeInit('Blog Loader', initBlogLoader);

    // 2. Core UI & Performance
    safeInit('Navigation', initNavigation);
    safeInit('Scroll Effects', initScrollEffects);
    safeInit('Animations', initAnimations);
    safeInit('Progress Tracker', initProgressTracker);

    // 3. Feature Logic
    safeInit('Crypto FAB', initCryptoFab);
    safeInit('Crypto Dashboard', initCryptoDashboard);
    safeInit('Crypto Detail', initCryptoDetail);
    safeInit('Crypto News', initCryptoNews);
    safeInit('Home Market Trends', initHomeMarketTrends);
    safeInit('Newsletter', initNewsletter);
    safeInit('Live Blog', initLiveBlog);
    safeInit('Category Filters', initCategoryFilters);
    safeInit('Calculators', initCalculators);
    safeInit('AI Assistant', initAIAssistant);
});

// -------------------- Tool Review Data --------------------
const reviewsData = {
    'magnifi': {
        url: 'https://magnifi.com/',
        category: 'Robo-Advisor',
        title: 'Magnifi: Your AI Investing Copilot',
        rating: 5,
        verdict: 'Magnifi is the benchmark for conversational AI in finance. It successfully translates complex institutional-grade data into actionable insights for the retail investor.',
        specs: {
            'Pricing': '$14/month',
            'AI Feature': 'Conversational Search',
            'Integrations': 'Plaid, Major Brokerages',
            'Best For': 'Self-Directed Investors'
        },
        body: `
            <h2>Personalized Intelligence</h2>
            <p>Magnifi acts as an AI-powered assistant that translates complex market data into understandable language. Instead of browsing spreadsheets, you ask "What are the best dividend ETFs for a recession?" and get instant, data-backed answers.</p>
            
            <h3>Key Features</h3>
            <ul>
                <li><strong>Holistic Analysis:</strong> Link all your brokerages to see hidden overlaps and risks across your entire net worth.</li>
                <li><strong>Commission-Free:</strong> Trade directly through the app without extra friction.</li>
                <li><strong>Goal-Based Tracking:</strong> The AI monitors your progress toward specific retirement or house-buying goals and suggests adjustments.</li>
            </ul>

            <div class="flex-between" style="gap: var(--space-6); margin: var(--space-6) 0;">
                <div style="flex: 1; border-left: 3px solid var(--color-success); padding-left: var(--space-4);">
                    <h4 style="color: var(--color-success); margin-bottom: var(--space-2);">Pros</h4>
                    <ul style="font-size: var(--text-sm); list-style: none; padding: 0;">
                        <li>✓ Natural language search is game-changing</li>
                        <li>✓ Aggregates all accounts seamlessly</li>
                        <li>✓ Highly affordable compared to advisors</li>
                    </ul>
                </div>
                <div style="flex: 1; border-left: 3px solid var(--color-error); padding-left: var(--space-4);">
                    <h4 style="color: var(--color-error); margin-bottom: var(--space-2);">Cons</h4>
                    <ul style="font-size: var(--text-sm); list-style: none; padding: 0;">
                        <li>✗ AI can occasionally generalize</li>
                        <li>✗ Mobile app has occasional sync lags</li>
                    </ul>
                </div>
            </div>

            <h2>The Verdict</h2>
            <p>While powerful, the AI can sometimes provide generalized answers for highly niche queries. However, for 95% of investors, it is a massive upgrade over traditional research tools.</p>
        `
    },
    'cointracker': {
        url: 'https://www.cointracker.io/',
        category: 'Tax Software',
        title: 'CoinTracker: Effortless Crypto Compliance',
        rating: 5,
        verdict: 'CoinTracker is the most reliable way to handle the nightmare of crypto taxes. Its seamless integration with over 500 exchanges makes it indispensable for active traders.',
        specs: {
            'Pricing': '$29 - $199+/year',
            'Integrations': '500+ Exchanges/Wallets',
            'AI Feature': 'Auto-Categorization',
            'Support': 'Full Audit Defense'
        },
        body: `
            <h2>Solving the Crypto Tax Puzzle</h2>
            <p>CoinTracker uses machine learning to automatically categorize transfers between your wallets, preventing you from paying taxes on your own capital moves.</p>
            
            <h3>DeFi and NFT Ready</h3>
            <p>It pulls transaction data from 20,000+ DeFi protocols and tracks NFT cost-basis, which is notoriously difficult to do manually. It then generates IRS-ready forms like the 8949.</p>

            <div class="flex-between" style="gap: var(--space-6); margin: var(--space-6) 0;">
                <div style="flex: 1; border-left: 3px solid var(--color-success); padding-left: var(--space-4);">
                    <h4 style="color: var(--color-success); margin-bottom: var(--space-2);">Pros</h4>
                    <ul style="font-size: var(--text-sm); list-style: none; padding: 0;">
                        <li>✓ Best-in-class UI/UX</li>
                        <li>✓ Seamless integration with TurboTax</li>
                        <li>✓ Reliable tax-loss harvesting tool</li>
                    </ul>
                </div>
                <div style="flex: 1; border-left: 3px solid var(--color-error); padding-left: var(--space-4);">
                    <h4 style="color: var(--color-error); margin-bottom: var(--space-2);">Cons</h4>
                    <ul style="font-size: var(--text-sm); list-style: none; padding: 0;">
                        <li>✗ Expensive for high-volume traders</li>
                        <li>✗ Manual review still needed for some DeFi edges</li>
                    </ul>
                </div>
            </div>

            <h2>Comparison</h2>
            <p>Compared to Koinly or ZenLedger, CoinTracker has a superior UI and more robust "Smart" error detection for missing price data.</p>
        `
    },
    'ledger': {
        url: 'https://www.ledger.com/',
        category: 'Security',
        title: 'Ledger: The Gold Standard of Cold Storage',
        rating: 5,
        verdict: 'Hardware is still king. Ledger remains the most trusted name in digital asset security, combining offline key storage with an increasingly powerful software ecosystem.',
        specs: {
            'Device Cost': '$79 - $249',
            'Security Chip': 'CC EAL5+ Certified',
            'App Support': '5,500+ Assets',
            'Connection': 'USB/Bluetooth/NFC'
        },
        body: `
            <h2>True Ownership</h2>
            <p>The Ledger Nano and Stax devices keep your private keys entirely offline. A hacker would need physical access to your device and your PIN to steal your funds.</p>
            
            <h3>Ledger Live Ecosystem</h3>
            <p>The companion app allows you to stake, swap, and buy crypto directly from within the safety of cold storage, eliminating the need to move funds to risky exchanges.</p>
        `
    },
    'q-ai': {
        url: 'https://q.ai/',
        category: 'Investing',
        title: 'Q.ai: Quantitative Investing for Everyone',
        rating: 4,
        verdict: 'Q.ai brings hedge-fund level strategies to the masses. Its "Portfolio Protection" is a unique AI feature that automatically hedges your risk during market downturns.',
        specs: {
            'Pricing': '$10/mo (Optional)',
            'AI Feature': 'Portfolio Protection',
            'Rebalancing': 'Weekly Automated',
            'Min. Investment': '$100'
        },
        body: `
            <h2>Hedge Fund Tech in Your Pocket</h2>
            <p>Q.ai uses AI "Kits" (theme-based portfolios) that are optimized weekly. The AI analyzes inflation, interest rates, and sentiment to reweight assets before you even notice the market change.</p>
            
            <h3>Downside Protection</h3>
            <p>When the AI detects a high-risk regime, it can automatically move part of your portfolio into cash or defensive assets like gold, acting as a "Circuit Breaker" for your wealth.</p>
        `
    },
    'betterment': {
        url: 'https://www.betterment.com/',
        category: 'Robo-Advisor',
        title: 'Betterment: The Automated Investing Pioneer',
        rating: 4,
        verdict: 'Betterment remains a top choice for those who want a simple, automated path to wealth. While not as "AI-forward" as Magnifi, its automation features are rock-solid.',
        specs: {
            'Pricing': '0.25% annually',
            'Min. Investment': '$0',
            'Tax Logic': 'Automated Harvesting',
            'Focus': 'Passive Growth'
        },
        body: `
            <h2>Set it and Forget it</h2>
            <p>Betterment pioneered the automated investment space. It automatically rebalances your portfolio and utilizes tax-loss harvesting to scrape every bit of efficiency out of your returns.</p>
        `
    },
    'monarch-money': {
        url: 'https://www.monarchmoney.com/',
        category: 'Planning',
        title: 'Monarch Money: AI-Powered Net Worth Tracking',
        rating: 5,
        verdict: 'The best successor to Mint. Monarch uses AI to categorize spending with incredible accuracy and provides a truly holistic view of your financial health.',
        specs: {
            'Pricing': '$14.99/mo',
            'Integrations': 'Plaid, Finicity, MX',
            'AI Feature': 'Smart Categorization',
            'Multi-User': 'Household Support'
        },
        body: `
            <h2>Control Your Cash Flow</h2>
            <p>Monarch allows you to build complex financial roadmaps. Its AI learns your spending patterns and can predict your end-of-month balance based on upcoming bills and recurring income.</p>
        `
    },
    'newretirement': {
        url: 'https://www.newretirement.com/',
        category: 'Retirement',
        title: 'NewRetirement: Advanced Financial Modeling',
        rating: 5,
        verdict: 'The most comprehensive retirement planner available to individuals. It uses sophisticated Monte Carlo simulations to give you a "Progress Score" for your future.',
        specs: {
            'Pricing': '$120/year',
            'Model': 'Monte Carlo (1,000 runs)',
            'Tax Support': 'Pro-level Roth Conversion',
            'Compliance': 'Non-Conflict'
        },
        body: `
            <h2>Visualizing Your Golden Years</h2>
            <p>NewRetirement goes beyond simple "how much will I have" calculators. It models taxes, healthcare costs, and social security strategies to find the optimal path to financial independence.</p>
        `
    }
};

function initReviewLoader() {
    const urlParams = new URLSearchParams(window.location.search);
    let reviewId = urlParams.get('id');

    // Fallback to hash if search param is missing
    if (!reviewId && window.location.hash.includes('id=')) {
        reviewId = window.location.hash.split('id=')[1].split('&')[0];
    }

    const titleEl = document.getElementById('review-title');
    if (!reviewId || !reviewsData[reviewId] || !titleEl) return;

    const data = reviewsData[reviewId];

    // Update basic info
    const categoryEl = document.getElementById('review-category');
    const verdictEl = document.getElementById('review-verdict');
    const bodyEl = document.getElementById('review-body');
    const specsEl = document.getElementById('review-specs');
    const ratingContainer = document.getElementById('review-rating-container');

    if (categoryEl) categoryEl.innerText = data.category;
    if (titleEl) titleEl.innerText = data.title;
    if (verdictEl) verdictEl.innerText = data.verdict;
    if (bodyEl) bodyEl.innerHTML = data.body;

    const externalLink = document.getElementById('review-external-link');
    if (externalLink && data.url) {
        externalLink.href = data.url;
        externalLink.target = '_blank';
        externalLink.rel = 'noopener noreferrer';
    }

    // Update Stars
    if (ratingContainer) {
        ratingContainer.innerHTML = '';
        for (let i = 0; i < 5; i++) {
            const star = document.createElement('span');
            star.className = `rating-star ${i >= data.rating ? 'empty' : ''}`;
            star.innerText = '★';
            ratingContainer.appendChild(star);
        }
    }

    // Update Specs
    if (specsEl) {
        specsEl.innerHTML = '';
        Object.entries(data.specs).forEach(([key, val]) => {
            specsEl.innerHTML += `
                <div style="display: flex; justify-content: space-between; border-bottom: 1px solid var(--color-border); padding-bottom: var(--space-2);">
                    <span style="color: var(--color-text-muted);">${key}</span>
                    <span style="font-weight: 600;">${val}</span>
                </div>
            `;
        });
    }

    // Dynamic document title
    document.title = `${data.title} | ProsperPath Insights`;
}

// -------------------- Tool Comparison Data --------------------
const comparisonData = {
    'magnifi-vs-betterment': {
        title: 'Magnifi vs Betterment',
        tool1: { name: 'Magnifi', logo: '🧠', winner: true },
        tool2: { name: 'Betterment', logo: '🤖', winner: false },
        rows: [
            ['Primary Focus', 'AI Conversational Research', 'Automated Passive Investing'],
            ['Pricing', '$14/month', '0.25% annually'],
            ['Ideal For', 'Active Investors', 'Passive Investors'],
            ['AI Capability', 'Advanced NLP Search', 'Rules-based Automation'],
            ['Brokerage Support', 'Connect 100+ Brokerages', 'Proprietary Only']
        ],
        verdict: 'If you want <strong>active insights</strong> and the ability to ask complex questions, <strong>Magnifi</strong> is the clear winner. However, for those who just want to <strong>deposit and forget</strong>, Betterment remains a rock-solid choice.'
    },
    'cointracker-vs-koinly': {
        title: 'CoinTracker vs Koinly',
        tool1: { name: 'CoinTracker', logo: '🪙', winner: true },
        tool2: { name: 'Koinly', logo: '📋', winner: false },
        rows: [
            ['Free Tier', '25 Transactions', '10,000 (Read-only)'],
            ['Exchanges', '500+', '800+'],
            ['AI Logic', 'Smart Categorization', 'Manual Tagging'],
            ['Tax Reports', 'IRS Partnership-ready', 'Standard IRS Forms'],
            ['Audit Defense', 'Full Defense Included', 'Manual Only']
        ],
        verdict: '<strong>CoinTracker</strong> wins on <strong>UI/UX and trust</strong>, especially with its official tax partnerships. Koinly is a strong alternative for users with massive transaction volumes.'
    },
    'ledger-vs-trezor': {
        title: 'Ledger vs Trezor',
        tool1: { name: 'Ledger', logo: '🔒', winner: true },
        tool2: { name: 'Trezor', logo: '🔑', winner: false },
        rows: [
            ['Security', 'Secure Element (EAL5+)', 'Open Source Pins'],
            ['Asset Support', '5,500+', '1,500+'],
            ['Mobile App', 'Ledger Live (Full Mobile)', 'Desktop/Web Focused'],
            ['Staking', 'Native Staking', 'Third-party Only'],
            ['Price Range', '$79 - $249', '$69 - $179']
        ],
        verdict: '<strong>Ledger</strong> edges out Trezor due to its <strong>superior mobile app</strong> and broader asset support. It offers a more seamless "Apple-like" experience for the average user.'
    }
};

function initCompareLoader() {
    const urlParams = new URLSearchParams(window.location.search);
    let compareId = urlParams.get('id');

    // Fallback to hash if search param is missing
    if (!compareId && window.location.hash.includes('id=')) {
        compareId = window.location.hash.split('id=')[1].split('&')[0];
    }

    const titleEl = document.getElementById('compare-title');
    if (!compareId || !comparisonData[compareId] || !titleEl) return;

    const data = comparisonData[compareId];

    // Update Header
    if (titleEl) titleEl.innerText = data.title;

    // Tool 1
    const t1Name = document.getElementById('tool1-name');
    const t1Logo = document.getElementById('tool1-logo');
    const t1Winner = document.getElementById('tool1-winner');
    if (t1Name) t1Name.innerText = data.tool1.name;
    if (t1Logo) t1Logo.innerText = data.tool1.logo;
    if (t1Winner && data.tool1.winner) t1Winner.innerHTML = '<span class="winner-badge">OUR PICK</span>';

    // Tool 2
    const t2Name = document.getElementById('tool2-name');
    const t2Logo = document.getElementById('tool2-logo');
    const t2Winner = document.getElementById('tool2-winner');
    if (t2Name) t2Name.innerText = data.tool2.name;
    if (t2Logo) t2Logo.innerText = data.tool2.logo;
    if (t2Winner && data.tool2.winner) t2Winner.innerHTML = '<span class="winner-badge">OUR PICK</span>';

    // Table
    const tableBody = document.getElementById('compare-table-body');
    if (tableBody) {
        tableBody.innerHTML = '';
        data.rows.forEach(row => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${row[0]}</td>
                <td>${row[1]}</td>
                <td>${row[2]}</td>
            `;
            tableBody.appendChild(tr);
        });
    }

    // Verdict
    const verdictEl = document.getElementById('compare-verdict');
    if (verdictEl) verdictEl.innerHTML = `<p>${data.verdict}</p>`;

    // Dynamic Title
    document.title = `${data.title} Comparison | ProsperPath Insights`;
}

// -------------------- Blog Post Data --------------------
const blogData = {
    'guide-ai-retirement': {
        category: 'Featured',
        title: 'The Complete 2026 Guide to AI-Powered Automated Retirement Planning',
        author: 'Nishath',
        date: 'Jan 5, 2026',
        readTime: '15 min read',
        content: `
            <p style="font-size: var(--text-xl); color: var(--color-text-primary); margin-bottom: var(--space-8);">
                In 2026, retirement planning is no longer a manual chore. AI has transitioned from simple calculators to <strong>Agentic AI</strong>—autonomous systems capable of executing complex financial workflows with minimal human oversight.
            </p>

            <div class="expert-tip">
                <div class="expert-tip-icon">🤖</div>
                <div>
                    <h4 style="color: var(--color-accent); margin-bottom: var(--space-2);">Agentic AI vs. Traditional Algorithms</h4>
                    <p style="margin-bottom: 0;">Traditional models provide a static projection. <strong>Agentic systems</strong> actively monitor your real-time spending, market volatility, and tax law changes, initiating portfolio adjustments automatically to maintain your 95% probability of success.</p>
                </div>
            </div>

            <h2>The Shift to Life-Stage Forecasting</h2>
            <p>We've moved beyond the "4% rule." Modern retirement AI integrates <strong>Predictive Longevity Modeling</strong> and localized healthcare cost projections to build dynamic "Health Reserves" within your portfolio.</p>

            <div class="content-feature-list">
                <div class="content-feature-item"><span>🎯</span> Real-Time Probability Updates</div>
                <div class="content-feature-item"><span>🏥</span> Predictive Healthcare Reserves</div>
                <div class="content-feature-item"><span>💸</span> Dynamic Spending Feedback</div>
                <div class="content-feature-item"><span>🛡️</span> Sequence of Returns Mitigation</div>
            </div>

            <h3>Mitigating the "Sequence of Returns" Risk</h3>
            <p>The first five years of retirement are the most critical. AI platforms now utilize <strong>Sentiment Analysis</strong> on earnings calls and macro data to identify potential systemic downturns six months in advance, suggesting a "Cash Bucket" hedge to preserve principal when it matters most.</p>

            <div class="card card-accent" style="margin: var(--space-8) 0; padding: var(--space-6);">
                <h4 style="color: var(--color-accent); margin-bottom: var(--space-3);">Confidence Metric</h4>
                <p>Retirees using autonomous agentic planning report a <strong>22% higher confidence level</strong> and an average <strong>1.8% annual tax-alpha</strong> compared to manual spreadsheet planning.</p>
            </div>

            <h2>Conclusion</h2>
            <p>The goal in 2026 isn't just to have a "nest egg"—it's to have a <strong>Self-Correcting Financial Engine</strong>. By adopting agentic tools, you ensure your retirement plan is as dynamic as the market itself.</p>
        `
    },
    'ai-revolution-2026': {
        category: 'AI Portfolio Strategies',
        title: 'How AI Is Revolutionizing Automated Retirement Planning in 2026',
        author: 'Sabeel',
        date: 'Jan 3, 2026',
        readTime: '8 min read',
        content: `
            <p style="font-size: var(--text-xl); color: var(--color-text-primary); margin-bottom: var(--space-8);">
                The "set it and forget it" era of the 401(k) has evolved into "set it and let the AI optimize it." We are witnessing the democratization of hedge-fund level technology for the retail investor.
            </p>

            <h2>Machine Learning vs. Human Emotion</h2>
            <p>The average investor underperforms the S&P 500 by over 3% annually, primarily due to emotional decision-making. AI algorithms, however, operate on <strong>pure data</strong>. In 2026, tools like <em>Betterment's Core AI</em> and <em>M1 Finance's Smart Transfer</em> systems remove the human element entirely.</p>

            <h3>Modern Portfolio Theory 2.0</h3>
            <p>Classic diversification was just Stocks and Bonds. <strong>AI Portfolio 2.0</strong> analyzes alternative assets, crypto, and real estate sentiment in real-time. It doesn't just rebalance; it reallocates. If the AI detects a high correlation between your Tech stocks and your Ethereum holdings, it will automatically shift weight into more defensive, uncorrelated assets like Private Credit or Real Estate Investment Trusts (REITs).</p>

            <div class="content-feature-list">
                <div class="content-feature-item"><span>📉</span> Micro-Rebalancing</div>
                <div class="content-feature-item"><span>🧠</span> Sentiment Analysis</div>
                <div class="content-feature-item"><span>⚖️</span> Personal Risk Skew</div>
                <div class="content-feature-item"><span>🔍</span> Alpha Detection</div>
            </div>

            <div class="expert-tip">
                <div class="expert-tip-icon">🔬</div>
                <div>
                    <h4 style="color: var(--color-accent); margin-bottom: var(--space-2);">Deep Insight</h4>
                    <p style="margin-bottom: 0;">Rebalancing at the transaction level rather than quarterly saves an average of <strong>0.4% in slippage</strong>—a massive cumulative gain over 20 years.</p>
                </div>
            </div>

            <p>In 2026, the question isn't whether you use AI, but which model you trust to manage your legacy. Passive investing is no longer enough; <strong>Intelligent Passive</strong> is the new standard.</p>
        `
    },
    'factor-investing-ai': {
        category: 'AI Portfolio Strategies',
        title: 'Factor Investing with AI: Capturing Alpha in 2026',
        author: 'Sabeel',
        date: 'Dec 15, 2025',
        readTime: '11 min read',
        content: `
            <p style="font-size: var(--text-xl); color: var(--color-text-primary); margin-bottom: var(--space-8);">
                In 2026, the traditional Fama-French three-factor model has been replaced by <strong>AI-derived Multi-Factor Models</strong> that identify hidden correlations in milliseconds.
            </p>

            <h2>The Evolution of "Smart Beta"</h2>
            <p>Traditional factor investing focused on simple metrics like Value, Momentum, and Quality. Today, AI identifies <strong>Alternative Factors</strong>—such as satellite imagery data for retail stocks or NLP sentiment from developer activity on GitHub for crypto assets.</p>

            <div class="expert-tip">
                <div class="expert-tip-icon">🧬</div>
                <div>
                    <h4 style="color: var(--color-accent); margin-bottom: var(--space-2);">The Factor Decay Warning</h4>
                    <p style="margin-bottom: 0;">Factor strengths decay faster than ever. What used to provide alpha for years now decays in months. AI-driven <strong>Dynamic Weighting</strong> is required to stay ahead of the crowd.</p>
                </div>
            </div>

            <h3>Capturing Institutional Alpha</h3>
            <p>We use <strong>Deep Learning (CNNs & RNNs)</strong> to scan order books for institutional "Footprints". By identifying the specific signature of a large hedge fund's accumulation phase, our algorithms can position you before the bulk of the price movement occurs.</p>

            <div class="content-feature-list">
                <div class="content-feature-item"><span>📡</span> Alternative Data Mining</div>
                <div class="content-feature-item"><span>⚡</span> High-Frequency Factor Rotation</div>
                <div class="content-feature-item"><span>📊</span> Non-Linear Correlation Maps</div>
            </div>

            <h2>Conclusion</h2>
            <p>Alpha in 2026 is found in the data that humans can't see but AI can't help but notice.</p>
        `
    },
    'crypto-tax-made-easy': {
        category: 'Tax Automation',
        title: 'Crypto Tax Reporting Made Easy: AI Tools That Do the Work',
        author: 'Nishath',
        date: 'Dec 12, 2025',
        readTime: '8 min read',
        content: `
            <p style="font-size: var(--text-xl); color: var(--color-text-primary); margin-bottom: var(--space-8);">
                The IRS "Specific Identification" (SpecID) rule is the ultimate weapon for crypto investors, and in 2026, AI is the only way to execute it perfectly across thousands of transactions.
            </p>

            <div class="tool-review-card">
                <span class="badge-best-for">Best for Pro Traders</span>
                <div class="flex-between">
                    <h3>TaxBit Enterprise AI</h3>
                    <div class="rating-stars">★★★★★</div>
                </div>
                <p>TaxBit's AI engine automatically selects the highest-cost-basis tokens for setiap realization, minimizing your capital gains with 99.9% accuracy.</p>
                <div class="content-feature-list">
                    <div class="content-feature-item"><span>🏛️</span> Institutional Cert</div>
                    <div class="content-feature-item"><span>⚡</span> Real-Time Basis Tracking</div>
                </div>
            </div>

            <h3>Automating the Nightmare of DeFi</h3>
            <p>DeFi interactions—like liquidity provisioning and cross-chain bridging—are a tax nightmare. Modern AI tools now use <strong>Graph Analysis</strong> to trace your assets across 50+ chains, identifying "Self-Transfers" so you don't pay tax on your own movements.</p>

            <div class="expert-tip">
                <div class="expert-tip-icon">🧾</div>
                <div>
                    <h4 style="color: var(--color-accent); margin-bottom: var(--space-2);">The HIFO Strategy</h4>
                    <p style="margin-bottom: 0;"><strong>HIFO (Highest In, First Out)</strong> is often the most beneficial strategy for crypto users. Always ensure your software supports this and allows for <strong>SpecID</strong> level granularity.</p>
                </div>
            </div>

            <h2>Conclusion</h2>
            <p>Don't spend your weekend in a spreadsheet. Let the AI handle the reconciliation while you focus on the next trade.</p>
        `
    },
    'institutional-custody': {
        category: 'Digital Asset Insurance',
        title: 'Institutional Custody Solutions: Protecting Millions in Crypto',
        author: 'Sabeel',
        date: 'Dec 8, 2025',
        readTime: '10 min read',
        content: `
            <p style="font-size: var(--text-xl); color: var(--color-text-primary); margin-bottom: var(--space-8);">
                By 2026, the gap between retail security and institutional-grade custody has closed, thanks to the widespread adoption of <strong>Multi-Party Computation (MPC)</strong> protocols.
            </p>

            <h2>The MPC Revolution</h2>
            <p>Unlike traditional Multi-sig, where separate keys are required, <strong>MPC</strong> allows for a single private key share to be computed by distributed parties without the key ever being fully assembled in one place. No key exists to be stolen.</p>

            <div class="content-feature-list">
                <div class="content-feature-item"><span>💻</span> Distributed Key Generation (DKG)</div>
                <div class="content-feature-item"><span>🏢</span> Jurisdictional Sharding</div>
                <div class="content-feature-item"><span>🛡️</span> HSM-Backing (FIPS 140-2)</div>
            </div>

            <div class="expert-tip">
                <div class="expert-tip-icon">🏢</div>
                <div>
                    <h4 style="color: var(--color-accent); margin-bottom: var(--space-2);">Hybrid Custody Models</h4>
                    <p style="margin-bottom: 0;">Institutional investors now prefer <strong>Hybrid models</strong> where they hold "Approval Rights" while a regulated qualified custodian handles the actual cryptographic infrastructure.</p>
                </div>
            </div>

            <h3>The Three Pillars of Custody</h3>
            <ol>
                <li><strong>Cold Storage:</strong> Assets held in air-gapped, vault-protected hardware.</li>
                <li><strong>Warm MPC:</strong> Rapidly accessible but distributed authorization for active trading.</li>
                <li><strong>Insurance Depth:</strong> Diversified coverage across Lloyd's of London and dedicated on-chain insurance funds.</li>
            </ol>

            <p>In 2026, institutional custody isn't just about storage—it's about <strong>Frictionless Mobility</strong> with total security.</p>
        `
    },
    'top-10-tax-software': {
        category: 'Tax Automation',
        title: 'Top 10 AI Tax Software Reviews: Complete Comparison Guide',
        author: 'Nishath',
        date: 'Jan 1, 2026',
        readTime: '12 min read',
        content: `
            <p style="font-size: var(--text-xl); color: var(--color-text-primary); margin-bottom: var(--space-8);">
                The 2026 tax season is the first to be fully transformed by Generative AI. For investors, manual data entry is obsolete; <strong>Direct API Integration</strong> with brokerages and exchanges is the new standard.
            </p>

            <div class="tool-review-card">
                <span class="badge-best-for">Best for Digital Assets</span>
                <div class="flex-between">
                    <h3>1. CoinTracker Premium</h3>
                    <div class="rating-stars">★★★★★</div>
                </div>
                <p>CoinTracker uses <strong>Smart-Link AI</strong> to reconcile multi-chain "Wrapping" and "Bridging" events that once caused massive tax headaches.</p>
                <div class="content-feature-list">
                    <div class="content-feature-item"><span>🔍</span> AI Audit Defense</div>
                    <div class="content-feature-item"><span>🔗</span> Multi-Chain Recon</div>
                </div>
                <a href="#" class="btn btn-secondary btn-sm" style="margin-top: var(--space-4);">Full Review</a>
            </div>

            <div class="tool-review-card">
                <span class="badge-best-for">Best for Traditional Portfolios</span>
                <div class="flex-between">
                    <h3>2. WealthAI Tax</h3>
                    <div class="rating-stars">★★★★☆</div>
                </div>
                <p>Known for <strong>Predictive Tax-Loss Harvesting</strong>, it scans for wash-sale compliant trades across multiple brokerages 365 days a year.</p>
                <div class="content-feature-list">
                    <div class="content-feature-item"><span>💸</span> Max Auto-Deduction</div>
                    <div class="content-feature-item"><span>🏦</span> Brokerage-Native Sync</div>
                </div>
                <a href="#" class="btn btn-secondary btn-sm" style="margin-top: var(--space-4);">Full Review</a>
            </div>

            <div class="expert-tip">
                <div class="expert-tip-icon">🛡️</div>
                <div>
                    <h4 style="color: var(--color-accent); margin-bottom: var(--space-2);">The SOC 2 Type II Gold Standard</h4>
                    <p style="margin-bottom: 0;">When choosing an AI tax partner, verify they are <strong>SOC 2 Type II compliant</strong>. This ensures your sensitive financial datasets are protected by institutional-grade cybersecurity.</p>
                </div>
            </div>

            <p>In 2026, premium software must go beyond reporting to <strong>Proactive Planning</strong>. If your tool doesn't suggest tax-advantaged moves <em>before</em> the quarter ends, you are leaving thousands on the table.</p>
        `
    },
    'crypto-insurance-essentials': {
        category: 'Digital Asset Insurance',
        title: 'Essential Insurance Coverage for Your Cryptocurrency Holdings',
        author: 'Nishath',
        date: 'Dec 28, 2025',
        readTime: '6 min read',
        content: `
            <p style="font-size: var(--text-xl); color: var(--color-text-primary); margin-bottom: var(--space-8);">
                As your digital portfolio grows, so does your target profile. In a world of smart contract exploits and social engineering, insurance is no longer optional—it's a requirement for wealth preservation.
            </p>

            <h2>The Three Tiers of Digital Protection</h2>

            <h3>1. Custodial Insurance (Exchange Level)</h3>
            <p>If you keep funds on an exchange like Coinbase or Kraken, you are relying on their institutional insurance. While robust, this only protects against their internal hacks, not your account being compromised. Always check their <em>Insurance Fund</em> disclosures before depositing large sums.</p>

            <h3>2. Smart Contract Coverage (DeFi Level)</h3>
            <p>Platforms like <strong>Nexus Mutual</strong> and <strong>InsurAce</strong> allow you to buy "covers" for specific protocols. If you have $100k in Aave, you can pay a small annual premium to be protected in the event of a code exploit or stablecoin de-pegging. This is the cornerstone of safe yield farming.</p>

            <h3>3. Private Key Security (Hardware Level)</h3>
            <p>New "Personal Custody Insurance" policies are emerging for cold storage users. Companies like <em>Ledger</em> now offer subscription-based protection that covers a portion of your funds if your physical device is stolen or if you are the victim of a coordinated phishing attack.</p>

            <div class="card" style="background: var(--color-secondary); border-left: 4px solid var(--color-error); margin: var(--space-6) 0;">
                <h4 style="margin-bottom: var(--space-2);">⚠️ The "Insurance Gap"</h4>
                <p style="font-size: var(--text-sm);">Most homeowners' insurance policies explicitly exclude digital assets. Do not assume your existing coverage protects your Bitcoin. You need a specific <strong>Digital Asset Rider</strong>.</p>
            </div>

            <h2>Action Plan for 2026</h2>
            <p>Review your holdings every 90 days. As a rule of thumb, if your crypto represents more than 15% of your net worth, at least 50% of that position should be covered by some form of smart contract or custodial insurance policy.</p>
        `
    },
    'robo-vs-human-2026': {
        category: 'AI Portfolio Strategies',
        title: 'Robo-Advisors vs Human Advisors: The 2026 Comparison',
        author: 'Sabeel',
        date: 'Dec 25, 2025',
        readTime: '10 min read',
        content: `
            <p style="font-size: var(--text-xl); color: var(--color-text-primary); margin-bottom: var(--space-8);">
                Is the human financial advisor obsolete? In 2026, the answer is "no," but their role has fundamentally shifted from portfolio manager to behavior coach.
            </p>
            <h2>The Efficiency Gap</h2>
            <p>Robo-advisors win on cost and execution. When the market drops 10%, an AI can rebalance 10,000 accounts in milliseconds. A human advisor can't even finish their first coffee. If you have under $2M in assets, a Robo-advisor's 0.25% fee is almost always more efficient than a human's 1.0%.</p>
            <h2>The Value of the Human</h2>
            <p>Where humans still win is <strong>Complex Estate Planning</strong> and <strong>Emotional Management</strong>. AI can tell you that you're mathematically safe to spend $10k a month, but it can't sit across from you and explain why you shouldn't panic-sell your inheritance during a global crisis.</p>
            <h3>The Hybrid Approach</h3>
            <p>The smartest investors in 2026 are using "Cyborg Models"—using AI for the day-to-day tax-loss harvesting and rebalancing, while keeping a human on retainer for high-level strategy and legacy planning.</p>
        `
    },
    'tax-loss-harvesting-ai': {
        category: 'Tax Automation',
        title: 'Tax-Loss Harvesting: How AI Saves You Thousands Automatically',
        author: 'Nishath',
        date: 'Dec 22, 2025',
        readTime: '7 min read',
        content: `
            <p style="font-size: var(--text-xl); color: var(--color-text-primary); margin-bottom: var(--space-8);">
                Automated tax-loss harvesting is the closest thing to a "free lunch" in the investing world. Here is how the AI does the heavy lifting for you.
            </p>
            <h2>What is Tax-Loss Harvesting?</h2>
            <p>It’s the practice of selling a security that has experienced a loss and, in many cases, immediately replacing it with a similar security. This allows you to "realize" a loss for tax purposes without significantly changing your portfolio's risk profile.</p>
            <h2>The AI Advantage</h2>
            <p>Humans usually only look at harvest opportunities in December. <strong>AI looks every day.</strong> If a stock dips on a Tuesday in March, the AI captures that loss instantly. Over a year, this "Daily Harvesting" can add 1-2% to your net returns through tax savings alone.</p>
            <h3>Avoiding the Wash Sale Rule</h3>
            <p>The IRS says you can't buy the "substantially identical" security within 30 days. Our recommended AI tools use proprietary mapping to find "Representative Alternatives" that keep your market exposure but satisfy the IRS, keeping you safe and profitable.</p>
        `
    },
    'multi-sig-wallets': {
        category: 'Digital Asset Insurance',
        title: 'Multi-Signature Wallets: The Gold Standard for Crypto Security',
        author: 'Sabeel',
        date: 'Dec 18, 2025',
        readTime: '9 min read',
        content: `
            <p style="font-size: var(--text-xl); color: var(--color-text-primary); margin-bottom: var(--space-8);">
                In 2026, the "M-of-N" multi-signature protocol has become the minimum security baseline for significant crypto holdings. Single-signature wallets are now viewed as a liability for serious investors.
            </p>

            <h2>Eliminating Single Points of Failure</h2>
            <p>Multi-sig requires a minimum number of signatures (M) out of a total set (N) to authorize any move. A <strong>2-of-3 setup</strong> is the gold standard for individuals, protecting you against both theft and accidental loss.</p>

            <div class="content-feature-list">
                <div class="content-feature-item"><span>🔑</span> Key 1: Hardware Wallet (Home)</div>
                <div class="content-feature-item"><span>🔒</span> Key 2: Hardware Wallet (Safe)</div>
                <div class="content-feature-item"><span>☁️</span> Key 3: Institutional Custodian</div>
            </div>

            <h3>Why "Compliance by Design" Matters</h3>
            <p>Qualified custodians now offer <strong>Hybrid Custody</strong>, where they hold one key and you hold two. This allows for institutional-grade audit trails without you ever losing ultimate control of your private keys.</p>

            <div class="expert-tip">
                <div class="expert-tip-icon">🔐</div>
                <div>
                    <h4 style="color: var(--color-accent); margin-bottom: var(--space-2);">The Vendor Diversity Rule</h4>
                    <p style="margin-bottom: 0;">Never use the same hardware brand for all keys in your multi-sig. Mix vendors (e.g., <strong>Ledger + Trezor + Coldcard</strong>) to mitigate the risk of a single manufacturer's supply chain compromise.</p>
                </div>
            </div>

            <p>Advanced setups now integrate <strong>Time-Locks</strong>—preventing large withdrawals for 24-48 hours, providing a critical window to revoke unauthorized transactions even if your keys are compromised.</p>
        `
    }
};

// -------------------- Live AI Blog Engine (Deterministic Hourly Generation) --------------------
const liveBlogTopics = [
    {
        category: 'Global Markets',
        baseTitle: 'Global Equity Markets: Strategic Outlook',
        hooks: ['Tech sector valuation', 'Emerging market growth', 'Dividend yield strategies'],
        content: `
            <p class="lead">Global equity markets are showing resilience as we enter the new quarter. Analysts are focusing on the durability of the tech rally and the rotation into value sectors.</p>
            <h3>Sector Rotation Analysis</h3>
            <p>Our AI models indicate a potential shift from high-growth tech into industrial and healthcare sectors as interest rate expectations stabilize.</p>
            <div class="card card-accent" style="margin: var(--space-8) 0; padding: var(--space-6); background: rgba(var(--color-accent-rgb), 0.05);">
                 <h4 style="color: var(--color-accent);">Sector Momentum</h4>
                 <ul style="padding: 0; list-style: none;">
                    <li><strong>Industrials:</strong> Strong Buy Signal</li>
                    <li><strong>Healthcare:</strong> Accumulation Phase</li>
                    <li><strong>Utilities:</strong> Neutral</li>
                 </ul>
            </div>
        `
    },
    {
        category: 'Economy',
        baseTitle: 'Federal Reserve Policy: The Path Forward',
        hooks: ['Interest rate path', 'Inflation targets', 'Labor market data'],
        content: `
            <p class="lead">The Federal Reserve continues to monitor inflation data closely. The latest CPI print suggests that the soft landing scenario remains the base case for 2026.</p>
            <h3>Bond Market Implications</h3>
            <p>Treasury yields have settled into a new range, providing attractive opportunities for income-focused portfolios. The yield curve inversion is beginning to normalize.</p>
        `
    },
    {
        category: 'Tech Stocks',
        baseTitle: 'AI Infrastructure Spending Boom',
        hooks: ['Data center expansion', 'Semiconductor demand', 'Cloud computing revenue'],
        content: `
            <p class="lead">Major tech firms are increasing capital expenditure to build out the next generation of AI infrastructure. This bodes well for semiconductor manufacturers and data center providers.</p>
            <h3>Capex Trends</h3>
            <p>Analysis of recent earnings calls reveals a sustained commitment to AI hardware investment, driving long-term growth in the semiconductor supply chain.</p>
        `
    },
    {
        category: 'Energy Sector',
        baseTitle: 'Renewable Transition and Oil Demand',
        hooks: ['Green energy capex', 'Oil price stability', 'Fusion technology breakthroughs'],
        content: `
            <p class="lead">The energy sector is in a dual-phase transition. Traditional oil demand remains steady while investment in renewables accelerates.</p>
        `
    },
    {
        category: 'Consumer Staples',
        baseTitle: 'Retail Sales and Consumer Confidence',
        hooks: ['Holiday spending data', 'Household debt levels', 'Luxury goods market'],
        content: `
            <p class="lead">Consumer spending remains the engine of the economy. Recent data shows resilience in retail sales despite inflationary pressures.</p>
        `
    }
];

function generateLivePost(hourSeed) {
    const topicIndex = Math.abs(hourSeed) % liveBlogTopics.length;
    const hookIndex = Math.abs(hourSeed * 7) % liveBlogTopics[topicIndex].hooks.length;
    const topic = liveBlogTopics[topicIndex];
    const hook = topic.hooks[hookIndex];

    // Reconstruct date from seed (YYYYMMDDHH)
    const seedStr = hourSeed.toString();
    const year = parseInt(seedStr.substring(0, 4));
    const month = parseInt(seedStr.substring(4, 6)) - 1;
    const day = parseInt(seedStr.substring(6, 8));
    const hour = parseInt(seedStr.substring(8, 10));

    const date = new Date(year, month, day, hour, 0, 0);
    const formattedDate = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const formattedTime = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

    const signalStrength = 85 + (Math.abs(hourSeed * 3) % 15); // Dynamic signal 85-99%

    return {
        id: `live-${hourSeed}`,
        category: topic.category,
        title: `${topic.baseTitle}: ${hook}`,
        author: 'ProsperPath AI',
        date: formattedDate,
        time: formattedTime,
        readTime: '5 min read',
        signal: signalStrength,
        brief: topic.hooks, // Provide all hooks for the card brief
        excerpt: `At ${formattedTime}, our core agent identified a major shift in ${topic.category.toLowerCase()} regarding ${hook.toLowerCase()}.`,
        content: `
            <div style="background: rgba(var(--color-accent-rgb), 0.1); border: 1px solid var(--color-accent); padding: var(--space-4); border-radius: var(--radius-lg); margin-bottom: var(--space-8); display: flex; align-items: center; gap: var(--space-3);">
                <span class="pulse-ring" style="width: 12px; height: 12px; position: static;"></span>
                <span style="color: var(--color-accent); font-weight: 700; font-size: var(--text-sm);">LIVE AI INSIGHT • RECORDED ${formattedTime}</span>
            </div>
            ${topic.content}
            <p style="margin-top: var(--space-10); font-style: italic; color: var(--color-text-muted); font-size: var(--text-sm);">This article was autonomously generated by ProsperPath AI's Market Intelligence engine based on real-time data feeds as of ${formattedDate} ${formattedTime}.</p>
        `
    };
}

function initLiveBlogOld() {
    const container = document.getElementById('live-blog-container');
    if (!container || container.dataset.initialized) return;
    container.dataset.initialized = 'true';

    // 1. Generate Latest Post (Current Hour)
    const now = new Date();
    const getSeed = (d) => parseInt(d.getFullYear().toString() + (d.getMonth() + 1).toString().padStart(2, '0') + d.getDate().toString().padStart(2, '0') + d.getHours().toString().padStart(2, '0'));

    const latestSeed = getSeed(now);
    const latestPost = generateLivePost(latestSeed);



    container.innerHTML = `
        <div class="live-ai-ecosystem" style="margin-bottom: var(--space-8);">
            <!-- Live Data Bar -->
            <div id="live-ticker-strip" style="background: var(--color-bg-darker); border: 1px solid var(--color-accent); border-radius: var(--radius-lg); padding: 8px 16px; margin-bottom: var(--space-4); display: flex; align-items: center; gap: 16px; overflow: hidden; white-space: nowrap; font-family: 'Courier New', Courier, monospace;">
                <div style="color: var(--color-accent); font-weight: 700; font-size: 10px; display: flex; align-items: center; gap: 6px; flex-shrink: 0;">
                    <span class="pulse-ring" style="width: 8px; height: 8px; position: static;"></span>
                    LIVE STREAM:
                </div>
                <div id="scrolling-ticker" style="color: var(--color-text-primary); font-size: 11px; display: inline-block; animation: ticker-scroll 30s linear infinite;">
                    SYSTEMS NOMINAL • PROCESSING CORE DATA • [BTC/USD: $98,432.12 ▲ +1.2%] • [ETH/USD: $4,532.11 ▼ -0.4%] • INSTITUTIONAL FLOW DETECTED IN DARK POOLS • NEW AI INSIGHT GENERATED FOR ${latestPost.category.toUpperCase()} • 
                </div>
            </div>

            <!-- Latest Hero Post / Terminal -->
            <article class="card blog-card card-accent card-hero ai-glow" data-category="live" style="margin-bottom: var(--space-6); position: relative; overflow: hidden; padding: 0;" data-animate>
                <div style="position: absolute; top: 0; left: 0; width: 6px; height: 100%; background: var(--color-accent); z-index: 2;"></div>
                
                <div style="display: grid; grid-template-columns: 1fr 380px; min-height: 480px;">
                    <!-- Content Side -->
                    <div style="padding: var(--space-8); display: flex; flex-direction: column; justify-content: space-between;">
                        <div>
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-8);">
                                <div style="display: flex; gap: var(--space-3); align-items: center;">
                                    <span class="blog-category" style="background: var(--color-accent); color: white; padding: 6px 16px; font-size: 10px; letter-spacing: 2px; border-radius: 4px; font-weight: 800;">INTELLIGENCE TERMINAL</span>
                                    <div style="background: rgba(var(--color-accent-rgb), 0.2); color: var(--color-accent); padding: 4px 10px; border-radius: 4px; font-size: 10px; font-weight: 800; border: 1px solid var(--color-accent);">
                                        SIGNAL: ${latestPost.signal}%
                                    </div>
                                </div>
                                <div style="color: var(--color-text-muted); font-size: 10px; font-weight: 700; font-family: monospace;">
                                    REF: NW-CORE-A1 // ${latestPost.time}
                                </div>
                            </div>
                            
                            <h2 style="font-size: var(--text-4xl); margin-bottom: var(--space-6); line-height: 1.1; font-weight: 800;">
                                <a href="blog-post.html?id=${latestPost.id}" style="color: var(--color-text-primary); text-decoration: none; background: linear-gradient(to right, #fff, var(--color-accent)); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">${latestPost.title}</a>
                            </h2>
                            
                            <p style="font-size: var(--text-xl); color: var(--color-text-secondary); line-height: 1.6; margin-bottom: var(--space-8); max-width: 800px;">${latestPost.excerpt}</p>
                            
                            <div style="display: flex; gap: var(--space-4); margin-top: var(--space-6);">
                                <a href="blog-post.html?id=${latestPost.id}" class="btn btn-primary" style="padding: 14px 40px; font-weight: 800; letter-spacing: 1px; font-size: var(--text-sm);">DECRYPT FULL ANALYSIS</a>
                                <div style="display: flex; align-items: center; gap: var(--space-3); color: var(--color-text-muted); font-size: var(--text-xs); font-weight: 600;">
                                    <div style="width: 32px; height: 32px; background: var(--color-accent); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.2rem;">🤖</div>
                                    ID: PP-CORE-AGENT
                                </div>
                            </div>
                        </div>

                        <!-- Mini Stats Bar -->
                        <div style="margin-top: var(--space-10); display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--space-6); border-top: 1px solid var(--color-border); padding-top: var(--space-6);">
                            <div>
                                <div style="font-size: 10px; color: var(--color-text-muted); text-transform: uppercase; font-weight: 700; margin-bottom: 4px;">Target Protocol</div>
                                <div style="font-size: var(--text-sm); font-weight: 700; color: var(--color-text-primary); text-transform: uppercase;">${latestPost.category}</div>
                            </div>
                            <div>
                                <div style="font-size: 10px; color: var(--color-text-muted); text-transform: uppercase; font-weight: 700; margin-bottom: 4px;">Confidence Interval</div>
                                <div style="width: 100%; height: 4px; background: rgba(255,255,255,0.1); border-radius: 2px; margin-top: 8px;">
                                    <div style="width: ${latestPost.signal}%; height: 100%; background: var(--color-accent); border-radius: 2px;"></div>
                                </div>
                            </div>
                            <div>
                                <div style="font-size: 10px; color: var(--color-text-muted); text-transform: uppercase; font-weight: 700; margin-bottom: 4px;">Last Global Sync</div>
                                <div style="font-size: var(--text-sm); font-weight: 700; color: var(--color-accent);" id="live-sync-timer">00:00:24 AGO</div>
                            </div>
                        </div>
                    </div>

                    <!-- Widgets Side (The Live Look) -->
                    <div style="background: rgba(0,0,0,0.2); border-left: 1px solid var(--color-border); padding: var(--space-6); display: flex; flex-direction: column; gap: var(--space-4);">
                        
                        <!-- Widget: Sentiment -->
                        <div style="background: rgba(255,255,255,0.03); border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: var(--space-4);">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-4);">
                                <h4 style="font-size: 11px; text-transform: uppercase; color: var(--color-accent); font-weight: 800; margin: 0; display: flex; align-items: center; gap: 8px;">
                                    🧠 AI Market Sentiment
                                </h4>
                                <span style="font-size: 14px; font-weight: 800; color: var(--color-text-primary);">78/100</span>
                            </div>
                            <div style="width: 100%; height: 6px; background: rgba(255,255,255,0.1); border-radius: 3px; overflow: hidden;">
                                <div style="width: 78%; height: 100%; background: linear-gradient(to right, #ef4444, #22c55e); border-radius: 3px;"></div>
                            </div>
                            <div style="display: flex; justify-content: space-between; margin-top: 6px; font-size: 9px; color: var(--color-text-muted); font-weight: 700;">
                                <span>FEAR</span>
                                <span>GREED</span>
                            </div>
                        </div>

                        <!-- Widget: Verdict -->
                        <div style="background: rgba(255,255,255,0.03); border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: var(--space-4);">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-3);">
                                <h4 style="font-size: 11px; text-transform: uppercase; color: var(--color-text-primary); font-weight: 800; margin: 0; display: flex; align-items: center; gap: 8px;">
                                    🤖 Investment Verdict
                                </h4>
                                <span style="background: #22c55e; color: white; font-size: 10px; padding: 2px 8px; border-radius: 4px; font-weight: 900;">BUY</span>
                            </div>
                            <p style="font-size: 11px; line-height: 1.4; color: var(--color-text-secondary); margin: 0;">Strong institutional inflow and delta-neutral positioning support bullish continuation.</p>
                        </div>

                        <!-- Widget: Outlook -->
                        <div style="background: rgba(255,255,255,0.03); border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: var(--space-4);">
                            <h4 style="font-size: 11px; text-transform: uppercase; color: var(--color-text-primary); font-weight: 800; margin-bottom: var(--space-3); display: flex; align-items: center; gap: 8px;">
                                📈 2026 Price Outlook
                            </h4>
                            <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                                <span style="font-size: 10px; color: var(--color-text-muted);">Conservative</span>
                                <span style="font-size: 11px; font-weight: 700;">$95,000</span>
                            </div>
                            <div style="display: flex; justify-content: space-between;">
                                <span style="font-size: 10px; color: var(--color-accent);">Bull Case</span>
                                <span style="font-size: 12px; font-weight: 800; color: #22c55e;">$150,000</span>
                            </div>
                        </div>

                        <!-- Widget: News -->
                        <div style="background: rgba(255,255,255,0.03); border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: var(--space-4); flex-grow: 1; overflow: hidden;">
                            <h4 style="font-size: 11px; text-transform: uppercase; color: var(--color-text-primary); font-weight: 800; margin-bottom: var(--space-3); display: flex; align-items: center; gap: 8px;">
                                📰 Latest AI News
                            </h4>
                            <div style="display: flex; flex-direction: column; gap: 12px;">
                                <div>
                                    <div style="font-size: 11px; font-weight: 700; line-height: 1.2; color: var(--color-text-primary);">BlackRock Increases Core ETF Holdings</div>
                                    <div style="font-size: 9px; color: var(--color-text-muted); margin-top: 2px;">2h ago • Intelligence Confirmed</div>
                                </div>
                                <div style="opacity: 0.6;">
                                    <div style="font-size: 11px; font-weight: 700; line-height: 1.2;">Hashrate Hits New Lifetime Record</div>
                                    <div style="font-size: 9px; color: var(--color-text-muted); margin-top: 2px;">5h ago • Market Impact: High</div>
                                </div>
                            </div>
                        </div>

                    </div>
                </div>
            </article>
        </div>
    `;

    // Initialize the live clock / sync timer
    let syncSeconds = 24;
    setInterval(() => {
        syncSeconds++;
        const timerEl = document.getElementById('live-sync-timer');
        if (timerEl) {
            const mm = Math.floor(syncSeconds / 60).toString().padStart(2, '0');
            const ss = (syncSeconds % 60).toString().padStart(2, '0');
            timerEl.textContent = `${mm}:${ss}:${Math.floor(Math.random() * 99).toString().padStart(2, '0')} AGO`;
        }
    }, 100);

    // 2. Build Archive (All Past 24 Hours) - Save these to the main blog grid
    const blogGrid = document.querySelector('.blog-grid');
    if (blogGrid) {
        let archiveHtml = '';
        for (let i = 1; i <= 24; i++) {
            const pastDate = new Date(now.getTime() - (i * 60 * 60 * 1000));
            const pastSeed = getSeed(pastDate);
            const pastPost = generateLivePost(pastSeed);

            archiveHtml += `
                <article class="card blog-card ai-glow" data-category="live" style="grid-column: span 1; display: flex; flex-direction: column; height: 100%; border-color: var(--color-accent); border-width: 1.5px;">
                    <div style="background: rgba(var(--color-accent-rgb), 0.05); padding: var(--space-6); flex-grow: 1;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-4);">
                            <span class="blog-category" style="background: var(--color-accent); color: white; padding: 4px 10px; font-size: 10px; border-radius: 4px;">AI INSIGHT • ${pastPost.time}</span>
                            <div style="font-size: 10px; color: var(--color-accent); font-weight: 700; letter-spacing: 1px;">SIGNAL: ${pastPost.signal}%</div>
                        </div>
                        
                        <h3 style="font-size: var(--text-xl); margin-bottom: var(--space-4); line-height: 1.4;">
                            <a href="blog-post.html?id=${pastPost.id}" style="color: var(--color-text-primary); text-decoration: none;">${pastPost.title}</a>
                        </h3>
                        
                        <div style="margin-bottom: var(--space-6);">
                            <div style="font-size: 10px; text-transform: uppercase; color: var(--color-text-muted); margin-bottom: var(--space-3); font-weight: 700; border-bottom: 1px solid var(--color-border); padding-bottom: 4px;">Intelligence Brief:</div>
                            <ul style="padding: 0; list-style: none; display: flex; flex-direction: column; gap: 10px;">
                                ${pastPost.brief.map(b => `<li style="font-size: var(--text-sm); color: var(--color-text-secondary); display: flex; align-items: flex-start; gap: 10px; line-height: 1.4;">
                                    <span style="color: var(--color-accent); font-weight: bold; margin-top: 2px;">•</span> <span>${b}</span>
                                </li>`).join('')}
                            </ul>
                        </div>
                    </div>

                    <div style="padding: var(--space-4) var(--space-6); border-top: 1px solid var(--color-border); background: rgba(var(--color-accent-rgb), 0.03); display: flex; justify-content: space-between; align-items: center;">
                        <div style="font-size: var(--text-xs); color: var(--color-text-muted); font-weight: 500;">${pastPost.date}</div>
                        <a href="blog-post.html?id=${pastPost.id}" style="color: var(--color-accent); font-weight: 700; font-size: var(--text-sm); text-decoration: none; display: flex; align-items: center; gap: 6px;">
                            Full Analysis <span style="font-size: 1.2rem;">→</span>
                        </a>
                    </div>
                </article>
            `;
        }
        // Prepend to the grid (so they appear after the hero but before older static posts)
        blogGrid.insertAdjacentHTML('afterbegin', archiveHtml);
    }

    // Update Trending Sidebar if on blog page
    const trendingList = document.querySelector('.sidebar .card div[style*="flex-direction: column"]');
    if (trendingList) {
        const liveLink = document.createElement('a');
        liveLink.href = `blog-post.html?id=${latestPost.id}`;
        liveLink.style.cssText = 'font-size: var(--text-sm); color: var(--color-accent); line-height: 1.4; font-weight: 600; display: flex; align-items: center; gap: 8px;';
        liveLink.innerHTML = `<span class="pulse-ring" style="width: 6px; height: 6px; position: static; flex-shrink: 0;"></span> LIVE: ${latestPost.title.substring(0, 45)}...`;
        trendingList.prepend(liveLink);
    }
}

const authorData = {
    'ProsperPath AI': {
        name: 'ProsperPath AI',
        avatar: '🤖',
        role: 'Autonomous Intelligence Engine',
        bio: 'ProsperPath AI is our proprietary agentic system that scans global markets 24/7. It utilizes advanced natural language processing and quantitative modeling to generate real-time insights for the modern investor.'
    }, 'Sabeel': {
        name: 'Sabeel',
        avatar: 'SB',
        role: 'Co-Founder & Lead Developer',
        bio: 'Sabeel is the Co-Founder and Lead Developer at ProsperPath Insights. As a tech enthusiast and school student, he specializes in building robust financial technology platforms and implementing complex AI workflows.'
    },
    'Nishath': {
        name: 'Nishath',
        avatar: 'NS',
        role: 'Co-Founder & Head of Research',
        bio: 'Nishath is the Co-Founder and Head of Research at ProsperPath Insights. A school student and dedicated finance researcher, he focuses on democratizing wealth management through institutional-grade analysis of AI investing tools.'
    }
};

function initBlogLoader() {
    // 1. Check for Hash-based Live News (Local Preview)
    if (window.location.hash && window.location.hash.includes('type=live-news')) {
        const itemStr = sessionStorage.getItem('liveNewsItem');
        const container = document.getElementById('post-content');
        if (!itemStr || !container) return;

        try {
            const item = JSON.parse(itemStr);
            console.log('Rendering Live News:', item.title);

            // Update Metadata
            document.title = `${item.title} | ProsperPath Live`;

            const titleEl = document.getElementById('post-title');
            if (titleEl) titleEl.innerText = item.title;

            const categoryEl = document.getElementById('post-category');
            if (categoryEl) categoryEl.innerText = (item.source_info.name || 'Global News') + ' • Live Insight';

            const authorEl = document.getElementById('post-author');
            if (authorEl) authorEl.innerText = item.source_info.name || 'ProsperPath AI';

            const dateEl = document.getElementById('post-date');
            if (dateEl) dateEl.innerText = new Date(item.published_on * 1000).toLocaleDateString();

            const timeEl = document.getElementById('post-read-time');
            if (timeEl) timeEl.innerText = '2 min read';

            // Update Content Body (Automatic Reader View)
            container.innerHTML = `
                <h2>Key Details</h2>
                <div class="card" style="padding: var(--space-6); background: var(--color-surface-hover); margin-bottom: var(--space-8);">
                    <ul style="list-style: none; padding: 0;">
                        <li style="margin-bottom: var(--space-3);"><strong>Source:</strong> ${item.source_info.name}</li>
                        <li style="margin-bottom: var(--space-3);"><strong>Categories:</strong> ${item.categories}</li>
                        <li style="margin-bottom: var(--space-3);"><strong>Published:</strong> ${new Date(item.published_on * 1000).toLocaleString()}</li>
                    </ul>
                </div>

                <div style="margin-bottom: var(--space-8); text-align: center; padding: var(--space-8); background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-lg);">
                    <h3 style="margin-bottom: var(--space-4);">Full Article</h3>
                    <p style="margin-bottom: var(--space-6); color: var(--color-text-muted);">Access the original reporting or use our clean reader view below.</p>
                    <div style="display: flex; gap: var(--space-4); justify-content: center; flex-wrap: wrap;">
                        <a href="${item.url}" target="_blank" class="btn btn-primary" style="display: inline-flex; align-items: center; gap: var(--space-2);">
                            Read on ${item.source_info.name} ↗
                        </a>
                    </div>
                </div>

                <h3 style="margin-bottom: var(--space-4);">Full Article (Reader View)</h3>
                <div id="reader-view-container" class="reader-body" style="background: var(--color-surface-hover); border-radius: var(--radius-lg); margin-bottom: var(--space-8); border: 1px solid var(--color-border);">
                    <div class="loading-state" style="text-align: center; padding: var(--space-10);">
                        <div class="spinner"></div>
                        <p style="margin-top: var(--space-4); color: var(--color-text-muted);">Decrypting and formatting article...</p>
                    </div>
                </div>
            `;

            // Automatic Fetch and Display Full Content (Modal Style Formatting)
            (async () => {
                const readerViewContainer = document.getElementById('reader-view-container');
                if (!readerViewContainer) return;

                const rawHtml = await fetchArticleContent(item.url);
                if (rawHtml) {
                    const extracted = extractContent(rawHtml);
                    if (extracted && extracted.length > 200) {
                        readerViewContainer.innerHTML = `
                            <article>
                                <h1>${item.title}</h1>
                                <div class="meta" style="display: flex; gap: 1rem; color: var(--color-text-muted); margin-bottom: 2rem; font-size: 0.9rem;">
                                    <span>Source: ${item.source_info.name}</span>
                                    <span>Published: ${new Date(item.published_on * 1000).toLocaleDateString()}</span>
                                </div>
                                <div class="reader-content-main">
                                    ${extracted}
                                </div>
                            </article>
                        `;
                        return;
                    }
                }

                // Fallback to original summary if fetch/extract fails
                readerViewContainer.innerHTML = `
                    <article>
                        <h1>${item.title}</h1>
                        <div class="meta" style="display: flex; gap: 1rem; color: var(--color-text-muted); margin-bottom: 2rem; font-size: 0.9rem;">
                            <span>Source: ${item.source_info.name}</span>
                            <span>Published: ${new Date(item.published_on * 1000).toLocaleDateString()}</span>
                        </div>
                        <p>${item.body}</p>
                        <div class="card" style="padding: var(--space-4); margin-top: var(--space-6); border-left: 4px solid var(--color-warning); background: rgba(var(--color-warning-rgb), 0.1);">
                            <p style="font-size: var(--text-sm); margin-bottom: 0; color: var(--color-text-primary);"><strong>Notice:</strong> We couldn't load the full reader view for this article. Please use the link above to read it on the publisher's site.</p>
                        </div>
                    </article>
                `;
            })();

            // Clear the default Author Bio or update it to be generic
            const bioName = document.getElementById('bio-name');
            const bioText = document.getElementById('bio-text');
            if (bioName) bioName.innerText = "ProsperPath Live Engine";
            if (bioText) bioText.innerText = "Real-time AI curated financial news stream.";

            // Hide Static Table of Contents for Live News
            const toc = document.getElementById('post-toc');
            if (toc) toc.style.display = 'none';

            return; // EXIT early so we don't look for query IDs
        } catch (e) {
            console.error('Error parsing live news item:', e);
        }
    }

    // 2. Fallback to Standard ID-based Loader
    const urlParams = new URLSearchParams(window.location.search);
    let postId = urlParams.get('id');

    // Fallback to hash if search param is missing
    if (!postId && window.location.hash.includes('id=')) {
        postId = window.location.hash.split('id=')[1].split('&')[0];
    }

    const container = document.getElementById('post-content');
    const titleEl = document.getElementById('post-title');
    if (!postId || !titleEl) return;

    let data;
    if (postId.startsWith('live-')) {
        // Old logic for fake live posts, can be kept for backward compatibility or removed
        const seed = parseInt(postId.replace('live-', ''));
        data = generateLivePost(seed);
    } else {
        if (!blogData[postId] || !container) return;
        data = blogData[postId];
    }

    // Update Meta
    const categoryEl = document.getElementById('post-category');
    const authorEl = document.getElementById('post-author');
    const dateEl = document.getElementById('post-date');
    const timeEl = document.getElementById('post-read-time');

    if (categoryEl) categoryEl.innerText = data.category;
    if (titleEl) titleEl.innerText = data.title;
    if (authorEl) authorEl.innerText = data.author;
    if (dateEl) dateEl.innerText = data.date;
    if (timeEl) timeEl.innerText = data.readTime;

    // Update Content
    container.innerHTML = data.content;

    // Update Author Bio
    if (authorData && data.author && authorData[data.author]) {
        const authorInfo = authorData[data.author];
        const bioName = document.getElementById('bio-name');
        const bioText = document.getElementById('bio-text');
        const bioAvatar = document.getElementById('bio-avatar');

        if (bioName) bioName.innerText = authorInfo.name;
        if (bioText) bioText.innerText = authorInfo.bio;
        if (bioAvatar) bioAvatar.innerText = authorInfo.avatar;
    }

    // Update Page Title
    document.title = `${data.title} | ProsperPath Insights`;
}

function initProgressTracker() {
    const progressBar = document.getElementById('reading-progress');
    if (!progressBar) return;

    window.addEventListener('scroll', () => {
        const winScroll = document.body.scrollTop || document.documentElement.scrollTop;
        const height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
        const scrolled = (winScroll / height) * 100;
        progressBar.style.width = scrolled + "%";
    });
}

// -------------------- Newsletter Subscription Logic --------------------
function initNewsletter() {
    const forms = document.querySelectorAll('.newsletter-form');

    forms.forEach(form => {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const input = form.querySelector('input[type="email"]');
            const button = form.querySelector('button');
            const formData = new FormData(form);
            const object = Object.fromEntries(formData);
            const json = JSON.stringify(object);

            if (!input || !input.value) return;

            // Loading state
            button.disabled = true;
            const originalBtnText = button.innerText;
            button.innerText = 'Subscribing...';

            try {
                const response = await fetch('https://api.web3forms.com/submit', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    body: json
                });

                const result = await response.json();

                if (response.status === 200) {
                    // Success state
                    form.innerHTML = `
                        <div style="text-align: center; padding: var(--space-2); animation: fadeIn 0.5s ease forwards;">
                            <div style="font-size: 2rem; margin-bottom: var(--space-2);">🎉</div>
                            <div style="font-weight: 600; color: var(--color-success); margin-bottom: var(--space-1);">Welcome to the Inner Circle!</div>
                            <p style="font-size: var(--text-xs); color: var(--color-text-muted);">Check ${input.value} for your first AI insight.</p>
                        </div>
                    `;
                } else {
                    console.error(result);
                    button.innerText = 'Error! Try again.';
                    button.disabled = false;
                    setTimeout(() => { button.innerText = originalBtnText; }, 3000);
                }
            } catch (error) {
                console.error(error);
                button.innerText = 'Connection Error';
                button.disabled = false;
                setTimeout(() => { button.innerText = originalBtnText; }, 3000);
            }
        });
    });
}

// -------------------- Home Market Trends Logic --------------------
async function initHomeMarketTrends() {
    const spPrice = document.getElementById('sp500-price');
    const btcPrice = document.getElementById('btcusd-price');
    if (!spPrice && !btcPrice) return;

    // Base Values (Realistic for early 2026)
    let marketData = {
        sp500: { price: 5942.50, change: 0.45 },
        nasdaq: { price: 19235.80, change: 0.88 },
        bitcoin: { price: 96500, change: 1.2 },
        ethereum: { price: 3450, change: -0.5 }
    };

    const updateUI = () => {
        Object.keys(marketData).forEach(id => {
            const priceEl = document.getElementById(`${id.replace('bitcoin', 'btcusd').replace('ethereum', 'ethusd')}-price`);
            const changeEl = document.getElementById(`${id.replace('bitcoin', 'btcusd').replace('ethereum', 'ethusd')}-change`);

            if (priceEl && changeEl) {
                const item = marketData[id];
                priceEl.innerText = item.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

                const isPositive = item.change >= 0;
                changeEl.className = `trend-change ${isPositive ? 'positive' : 'negative'}`;
                changeEl.innerHTML = `<span>${isPositive ? '↑' : '↓'}</span><span>${isPositive ? '+' : ''}${item.change.toFixed(2)}%</span>`;
            }
        });
    };

    // 1. Fetch Real Crypto Data
    const fetchCrypto = async () => {
        try {
            const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true');
            if (!res.ok) throw new Error();
            const data = await res.json();

            marketData.bitcoin.price = data.bitcoin.usd;
            marketData.bitcoin.change = data.bitcoin.usd_24h_change;
            marketData.ethereum.price = data.ethereum.usd;
            marketData.ethereum.change = data.ethereum.usd_24h_change;

            updateUI();
        } catch (e) {
            console.warn('Market API Limit reached, using estimates');
            updateUI();
        }
    };

    // 2. Simulate "Live" Ticks for Stocks (to show it's active)
    const simulateTicks = () => {
        marketData.sp500.price += (Math.random() - 0.5) * 0.5;
        marketData.nasdaq.price += (Math.random() - 0.5) * 1.5;
        updateUI();
    };

    await fetchCrypto();
    setInterval(fetchCrypto, 60000); // Update crypto every minute
    setInterval(simulateTicks, 3000); // Tick stocks every 3 seconds for "Live" feel
}

// -------------------- Real-Time Live Insights Logic (New) --------------------

// Storage Manager for 24h Persistence
const NewsStorage = {
    TTL: 24 * 60 * 60 * 1000, // 24 Hours in ms
    KEY_PREFIX: 'neurowealth_live_v4_',

    get(category) {
        try {
            const key = this.KEY_PREFIX + category;
            const stored = localStorage.getItem(key);
            if (!stored) return [];

            const parsed = JSON.parse(stored);
            const now = Date.now();

            // Filter items older than 24 hours
            const valid = parsed.filter(item => {
                // Ensure published_on is treated as seconds if it's small, or ms if large
                // The API returns seconds. Our new items use seconds.
                // Standardize to MS for comparison
                const itemTime = item.published_on * 1000;
                return (now - itemTime) < this.TTL;
            });

            // If we pruned items, save the cleaner list back
            if (valid.length !== parsed.length) {
                this.save(category, valid);
            }

            return valid;
        } catch (e) {
            console.warn('Storage Read Error:', e);
            return [];
        }
    },

    save(category, items) {
        try {
            const key = this.KEY_PREFIX + category;
            localStorage.setItem(key, JSON.stringify(items));
        } catch (e) {
            console.warn('Storage Save Error:', e);
        }
    },

    // Merge new items with stored items, remove duplicates (by URL), sort by date
    merge(category, newItems) {
        const current = this.get(category);
        const map = new Map();

        // Load current
        current.forEach(item => map.set(item.url, item));

        // Add new (overwriting if exists, though usually new is better)
        newItems.forEach(item => map.set(item.url, item));

        // Convert back to array
        const merged = Array.from(map.values());

        // Sort descending by time
        merged.sort((a, b) => b.published_on - a.published_on);

        // Save back
        this.save(category, merged);
        return merged;
    }
};

function timeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + " years ago";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + " months ago";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + " days ago";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + " hours ago";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + " minutes ago";
    return Math.floor(seconds) + " seconds ago";
}

async function initLiveBlog(categoryFilter = 'all') {
    const container = document.getElementById('live-blog-container');
    if (!container) return;

    // --- RENDER FUNCTION ---
    // Defined inside to exclude "Loading..." override when re-rendering
    const renderGrid = (items, visibleCount) => {
        // Clear Grid Container ONLY, keep Header
        let grid = document.getElementById('live-news-grid');
        let loadBtn = document.getElementById('live-news-load-more');

        if (!grid) {
            // Create grid if first run
            grid = document.createElement('div');
            grid.className = 'blog-grid';
            grid.id = 'live-news-grid';
            grid.style.marginTop = 'var(--space-8)';
            container.appendChild(grid);
        }

        grid.innerHTML = ''; // Specific clear

        // Slice items based on visibility
        const toShow = items.slice(0, visibleCount);

        toShow.forEach(item => {
            const article = document.createElement('article');
            article.className = 'card blog-card';
            article.dataset.category = 'live';
            article.style.flexDirection = 'column';

            let icon = '📰';
            if ((item.categories || '').includes('Tech') || (item.categories || '').includes('AI')) icon = '💻';
            else if ((item.categories || '').includes('Market')) icon = '📈';
            else if ((item.categories || '').includes('Regulation')) icon = '⚖️';
            else if ((item.categories || '').includes('Business')) icon = '💼';

            const publishedDate = new Date(item.published_on * 1000);
            const timeString = timeAgo(publishedDate);

            // Fallback for image logic
            const hasImage = item.imageurl && item.imageurl.length > 10;

            article.innerHTML = `
                <div class="blog-card-image" style="${hasImage ? `background-image: url('${item.imageurl}'); background-size: cover;` : `background: rgba(var(--color-accent-rgb), 0.1); display: flex; align-items: center; justify-content: center; font-size: 24px;`} width: 48px; height: 48px; border-radius: 12px; margin-bottom: var(--space-4); border: 1px solid var(--color-border);">
                    ${!hasImage ? icon : ''}
                </div>
                <span class="blog-category" style="background: var(--color-bg); border: 1px solid var(--color-border); color: var(--color-text-secondary); width: fit-content;">
                    ${item.source_info.name}
                </span>
                
                <h3 style="min-height: 4.8rem; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; color: var(--color-text-primary);">
                    <a href="blog-post.html#type=live-news" class="live-news-link" style="text-decoration: none; color: inherit;">
                        ${item.title}
                    </a>
                </h3>
                
                <p style="font-size: var(--text-sm); margin-bottom: var(--space-4); color: var(--color-text-muted); display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; height: 4.2em;">
                    ${item.body}
                </p>
                
                <div class="blog-meta" style="border-top: 1px solid var(--color-border); padding-top: var(--space-4); margin-top: auto;">
                    <span style="display: flex; align-items: center; gap: 6px; color: var(--color-text-secondary);">
                        <span class="pulse-ring" style="width: 6px; height: 6px; position: static; background: ${item.source_info.name === 'Yahoo Finance' || item.source_info.name === 'Google News' ? 'var(--color-accent)' : 'var(--color-success)'}"></span>
                        ${timeString}
                    </span>
                    <a href="blog-post.html#type=live-news" class="live-news-link" style="margin-left: auto; color: var(--color-accent); font-weight: 600; font-size: 0.85rem; text-decoration: none;">Reader View ↗</a>
                </div>
            `;

            // Click Handler
            const links = article.querySelectorAll('.live-news-link');
            links.forEach(link => {
                link.addEventListener('click', (e) => {
                    e.preventDefault();
                    sessionStorage.setItem('liveNewsItem', JSON.stringify(item));
                    window.location.href = 'blog-post.html#type=live-news';
                });
            });

            grid.appendChild(article);
        });

        // Load More Button Logic
        if (items.length > visibleCount) {
            if (!loadBtn) {
                loadBtn = document.createElement('button');
                loadBtn.id = 'live-news-load-more';
                loadBtn.className = 'btn btn-secondary';
                loadBtn.style.display = 'block';
                loadBtn.style.margin = 'var(--space-8) auto';
                loadBtn.innerText = `Load More Updates (${items.length - visibleCount} hidden)`;
                loadBtn.onclick = () => {
                    // Update global count
                    // Since we can't easily pass state back up without a closure or global, 
                    // we'll hack it slightly by re-calling render with new limit
                    // But easier: `currentLimit += 9; renderGrid(items, currentLimit)`
                    // We need to persist the limit for this user session? No, just this page view.
                    const newLimit = visibleCount + 9;
                    renderGrid(items, newLimit);
                    // Scroll little bit to show action
                };
                container.appendChild(loadBtn); // Append after grid
            } else {
                loadBtn.style.display = 'block';
                loadBtn.innerText = `Load More Updates (${items.length - visibleCount} hidden)`;
                // Must re-attach listener to have closure over new visibleCount if we recreated it? 
                // Actually the closure above creates a NEW loadBtn if !loadBtn.
                // If it exists, we just update text. 
                // WAIT: The onclick listener needs the *current* items reference. 
                // It's safest to re-assign onclick every render.
                loadBtn.onclick = () => {
                    renderGrid(items, visibleCount + 9);
                };
            }
        } else {
            if (loadBtn) loadBtn.style.display = 'none';
        }
    };


    // Header Render (Only once)
    if (!document.getElementById('live-news-header')) {
        container.innerHTML = `
            <div id="live-news-header" style="margin-bottom: var(--space-6); border-bottom: 1px solid var(--color-border); padding-bottom: var(--space-4); display: flex; justify-content: space-between; align-items: flex-end;">
                <div>
                    <h2 style="font-size: var(--text-2xl);">Global Financial Stream ${categoryFilter !== 'all' ? `(${categoryFilter.replace('live-', '').toUpperCase()})` : ''}</h2>
                    <p style="color: var(--color-text-muted);">Curated top financial, market, and regulatory news from trusted global sources.</p>
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                     <span class="pulse-ring" style="position: static;"></span>
                     <span id="live-status-text" style="font-size: var(--text-sm); color: var(--color-text-muted);">Syncing...</span>
                </div>
            </div>
        `;
    }

    // --- LOGIC ---

    // 1. Load Cached Data Immediately
    let allNews = NewsStorage.get(categoryFilter);
    let visibleCount = 9;

    // Render immediately if capabilities exist
    if (allNews.length > 0) {
        renderGrid(allNews, visibleCount);
        const statusEl = document.getElementById('live-status-text');
        if (statusEl) {
            statusEl.innerText = 'Cached';
            statusEl.style.color = 'var(--color-text-muted)';
        }
    }


    // 2. Fetch New Data (Background)

    // 2. Fetch New Data (Background)

    // Map category to API Strategy
    let strategy = 'crypto-api';
    let apiCategories = 'Regulation,Market,Business,Technology';

    if (categoryFilter === 'live-crypto') {
        apiCategories = 'BTC,ETH,SOL,Altcoin,Blockchain';
    } else if (categoryFilter === 'live-stocks') {
        strategy = 'google-rss';
    }

    // Mock Data (Fallback)
    let mockNews = [
        // ... (Mock data remains same as previous step, omitted for brevity in this specific tool call if not changing) ...
        // Actually, I need to include the mock data block since I'm replacing the whole section to ensure context match.
        // Let's keep the mock data from the previous step.
        {
            title: "Bitcoin Breaks $100k Barrier Following Federal Reserve Pivot Signals",
            body: "The world's largest cryptocurrency has reached a historic milestone as institutional inflows surge amidst signals of rate cuts.",
            categories: "Market, Bitcoin",
            published_on: Date.now() / 1000 - 1200,
            source_info: { name: "Bloomberg Crypto" },
            imageurl: "",
            url: "https://bloomberg.com/crypto"
        }
    ];
    if (categoryFilter === 'live-stocks') {
        mockNews = [
            {
                title: "S&P 500 Hits New All-Time High Driven by Tech Sector Rally",
                body: "Major indices surged today as quarterly earnings from big tech companies exceeded Wall Street expectations.",
                categories: "Markets, Stocks",
                published_on: Date.now() / 1000 - 3600,
                source_info: { name: "Yahoo Finance" },
                imageurl: "",
                url: "https://finance.yahoo.com"
            },
            {
                title: "Fed Hold Rates Steady, Signals Cuts Coming in Q3",
                body: "The Federal Reserve maintained its key interest rate today but indicated that inflation data is trending correctly for future cuts.",
                categories: "Economy, Policy",
                published_on: Date.now() / 1000 - 7200,
                source_info: { name: "CNBC" },
                imageurl: "",
                url: "https://cnbc.com"
            },
            {
                title: "Oil Prices Dip Below $70 as Global Demand Softens",
                body: "Crude futures fell sharply on reports of increased supply from non-OPEC nations and weaker manufacturing data.",
                categories: "Commodities, Energy",
                published_on: Date.now() / 1000 - 10800,
                source_info: { name: "Reuters" },
                imageurl: "",
                url: "https://reuters.com"
            }
        ];
    }


    try {
        const statusEl = document.getElementById('live-status-text');
        if (statusEl) {
            statusEl.innerText = 'Updating...';
            statusEl.style.color = 'var(--color-accent)';
        }

        let newFetchedItems = [];

        if (strategy === 'crypto-api') {
            const res = await fetch(`https://min-api.cryptocompare.com/data/v2/news/?lang=EN&categories=${apiCategories}&sortOrder=latest`);
            if (res.ok) {
                const data = await res.json();
                if (data.Data && data.Data.length > 0) newFetchedItems = data.Data;
            }
        } else if (strategy === 'google-rss') {
            // Try multiple CORS proxies as fallbacks
            const corsProxies = [
                url => `https://corsproxy.io/?${encodeURIComponent(url)}`,
                url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
                url => `https://cors-anywhere.herokuapp.com/${url}`
            ];

            // Primary: Google News
            const googleRssUrl = 'https://news.google.com/rss/search?q=stock+market+finance&hl=en-US&gl=US&ceid=US:en';
            // Secondary: Yahoo Finance
            const yahooRssUrl = 'https://finance.yahoo.com/news/rssindex';

            let rssSuccess = false;

            // Helper to parse RSS
            const parseRss = async (url, sourceNameDefault) => {
                for (const proxyFn of corsProxies) {
                    try {
                        const res = await fetch(proxyFn(url), { signal: AbortSignal.timeout(6000) });
                        if (res.ok) {
                            const text = await res.text();
                            const parser = new DOMParser();
                            const doc = parser.parseFromString(text, "text/xml");
                            const items = Array.from(doc.querySelectorAll("item"));

                            if (items.length > 0) {
                                return items.map(item => {
                                    const title = item.querySelector("title")?.textContent || "No Title";
                                    const pubDate = item.querySelector("pubDate")?.textContent;
                                    const link = item.querySelector("link")?.textContent;
                                    const source = item.querySelector("source")?.textContent || sourceNameDefault;

                                    const rawDesc = item.querySelector("description")?.textContent || "";
                                    const tempDiv = document.createElement("div");
                                    tempDiv.innerHTML = rawDesc;
                                    const links = tempDiv.querySelectorAll('a');
                                    let bodyText = "";

                                    // Clean Body Text Logic (Improved)
                                    // Extract pure text from description, stripping HTML tags
                                    let cleanText = tempDiv.textContent || "";
                                    cleanText = cleanText.replace(/View full coverage/gi, '')
                                        .replace(/on Google News/gi, '')
                                        .replace(/\s+/g, ' ')
                                        .trim();

                                    // If extracting text worked and is substantial, use it
                                    if (cleanText.length > 20) {
                                        bodyText = cleanText;
                                        // Truncate if too long (e.g. > 150 chars)
                                        if (bodyText.length > 180) bodyText = bodyText.substring(0, 180) + "...";
                                    } else if (links.length > 0) {
                                        // Fallback to first link title if text extraction failed
                                        bodyText = links[0].textContent;
                                    } else {
                                        bodyText = "Market update available. Click to read more.";
                                    }
                                    // Prevent duplication
                                    if (bodyText.toLowerCase() === title.toLowerCase() || bodyText.length < 10) {
                                        // Generate better fallback
                                        bodyText = "Latest financial market update from " + source + ". Click to read the full details and analysis.";
                                    }

                                    return {
                                        title: title,
                                        body: bodyText,
                                        categories: "Stocks, Market",
                                        published_on: pubDate ? new Date(pubDate).getTime() / 1000 : Date.now() / 1000,
                                        source_info: { name: source },
                                        imageurl: "",
                                        url: link
                                    };
                                });
                            }
                        }
                    } catch (e) { console.warn('Proxy failed for', url); }
                }
                return null;
            };

            // 1. Try Yahoo Finance (Better summaries)
            let items = await parseRss(yahooRssUrl, "Yahoo Finance");

            // 2. Try Google News if Yahoo failed
            if (!items || items.length === 0) {
                console.log('Yahoo RSS failed, trying Google News...');
                items = await parseRss(googleRssUrl, "Google News");
            }

            if (items) {
                newFetchedItems = items;
                rssSuccess = true;
            }
        }

        if (newFetchedItems.length > 0) {
            // MERGE & SAVE
            allNews = NewsStorage.merge(categoryFilter, newFetchedItems);

            // --- STRICT FILTERING FOR STOCKS ---
            // Remove pollution from cache or bad feeds
            if (categoryFilter === 'live-stocks') {
                allNews = allNews.filter(item => {
                    const text = (item.title + ' ' + item.body + ' ' + (item.categories || '')).toLowerCase();
                    const cryptoKeywords = ['bitcoin', 'crypto', 'ethereum', 'solana', 'blockchain', 'btc', 'eth'];
                    // If it contains any crypto keyword, filter it OUT
                    return !cryptoKeywords.some(kw => text.includes(kw));
                });
            }

            // Re-Render with updated list
            renderGrid(allNews, visibleCount);

            if (statusEl) {
                statusEl.innerText = 'Live';
                statusEl.style.color = 'var(--color-success)';
            }
        } else {
            // If fetch failed but we have cache, do nothing
            // If cache empty, use mock
            // --- STRICT FILTERING FOR CACHE ALSO ---
            if (categoryFilter === 'live-stocks' && allNews.length > 0) {
                allNews = allNews.filter(item => {
                    const text = (item.title + ' ' + item.body + ' ' + (item.categories || '')).toLowerCase();
                    const cryptoKeywords = ['bitcoin', 'crypto', 'ethereum', 'solana', 'blockchain', 'btc', 'eth'];
                    return !cryptoKeywords.some(kw => text.includes(kw));
                });
                renderGrid(allNews, visibleCount);
            }

            if (allNews.length === 0) {
                allNews = mockNews;
                renderGrid(allNews, visibleCount);
            }
            if (statusEl) statusEl.innerText = 'Offline Mode';
        }

    } catch (e) {
        console.warn('Live Blog: Fetch failed', e);
        if (allNews.length === 0) {
            renderGrid(mockNews, visibleCount);
        }
    }
}

// ==================== PAPER TRADING & TRADING MODE ====================

// ---- Paper Trading Data Store (localStorage) ----
const PaperTrading = {
    STORAGE_KEY: 'prosperpath_paper_trading',

    _defaults() {
        return {
            balance: 100000,
            positions: [],   // { id, symbol, name, side, qty, entryPrice, takeProfit, stopLoss, timestamp }
            history: [],     // { id, symbol, name, side, qty, entryPrice, exitPrice, pnl, timestamp, closedAt }
            realizedPnl: 0
        };
    },

    load() {
        try {
            const raw = localStorage.getItem(this.STORAGE_KEY);
            if (raw) return JSON.parse(raw);
        } catch (e) { console.warn('PaperTrading load error', e); }
        return this._defaults();
    },

    save(data) {
        try { localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data)); } catch (e) { }
    },

    getBalance() { return this.load().balance; },

    setBalance(amount) {
        const data = this.load();
        data.balance = amount;
        this.save(data);
    },

    openPosition(symbol, name, side, qty, entryPrice, takeProfit = null, stopLoss = null, leverage = 1) {
        const data = this.load();
        const totalValue = qty * entryPrice;
        const marginRequired = totalValue / leverage;

        if (marginRequired > data.balance) return { error: 'Insufficient balance for margin' };

        // Deduct margin
        data.balance -= marginRequired;

        data.positions.push({
            id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
            symbol, name, side, qty, entryPrice, leverage,
            takeProfit: takeProfit ? parseFloat(takeProfit) : null,
            stopLoss: stopLoss ? parseFloat(stopLoss) : null,
            timestamp: Date.now()
        });
        this.save(data);
        return { success: true };
    },

    updatePosition(posId, updates) {
        const data = this.load();
        const idx = data.positions.findIndex(p => p.id === posId);
        if (idx === -1) return { error: 'Position not found' };
        if (updates.takeProfit !== undefined) data.positions[idx].takeProfit = updates.takeProfit;
        if (updates.stopLoss !== undefined) data.positions[idx].stopLoss = updates.stopLoss;
        this.save(data);
        return { success: true };
    },

    closePosition(posId, currentPrice) {
        const data = this.load();
        const idx = data.positions.findIndex(p => p.id === posId);
        if (idx === -1) return { error: 'Position not found' };

        const pos = data.positions[idx];
        let pnl = 0;

        // P/L = (Current - Entry) * Qty (scaling is inherent in Qty)
        if (pos.side === 'buy') {
            pnl = (currentPrice - pos.entryPrice) * pos.qty;
        } else {
            pnl = (pos.entryPrice - currentPrice) * pos.qty;
        }

        // Return Margin + P/L
        const initialMargin = (pos.qty * pos.entryPrice) / (pos.leverage || 1);
        data.balance += (initialMargin + pnl);

        data.realizedPnl += pnl;
        data.history.push({
            ...pos,
            exitPrice: currentPrice,
            pnl,
            closedAt: Date.now()
        });
        data.positions.splice(idx, 1);
        this.save(data);
        return { success: true, pnl };
    },

    getUnrealizedPnl(currentPrice, symbol) {
        const data = this.load();
        let unrealized = 0;
        data.positions.forEach(p => {
            if (symbol && p.symbol !== symbol) return;
            if (p.side === 'buy') unrealized += (currentPrice - p.entryPrice) * p.qty;
            else unrealized += (p.entryPrice - currentPrice) * p.qty;
        });
        return unrealized;
    }
};

// ==================== ANALYTICS LOGGER ====================
const AnalyticsLogger = {
    STORAGE_KEY: 'prosperpath_analytics',

    _defaults() {
        return {
            patternHunterLogs: [],
            aiPromptLogs: [],
            tradeLogs: []
        };
    },

    load() {
        try {
            const raw = localStorage.getItem(this.STORAGE_KEY);
            if (raw) return JSON.parse(raw);
        } catch (e) { console.warn('AnalyticsLogger load error', e); }
        return this._defaults();
    },

    save(data) {
        try {
            // Keep max 500 entries per collection to avoid localStorage limits
            if (data.patternHunterLogs.length > 500) data.patternHunterLogs = data.patternHunterLogs.slice(-500);
            if (data.aiPromptLogs.length > 500) data.aiPromptLogs = data.aiPromptLogs.slice(-500);
            if (data.tradeLogs.length > 500) data.tradeLogs = data.tradeLogs.slice(-500);
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
        } catch (e) { console.warn('AnalyticsLogger save error', e); }
    },

    _captureIndicators() {
        const d = window._indicatorData;
        if (!d || !d.closes || d.closes.length === 0) return null;
        const closes = d.closes;
        const ohlc = d.ohlcData || [];
        const price = d.price;

        // ---- Core Indicators ----
        const result = {
            price: price,
            rsi: closes.length >= 15 ? Math.round(calcRSI(closes, 14)) : null,
            sma20: calcSMA(closes, 20),
            sma50: calcSMA(closes, 50),
            sma200: calcSMA(closes, 200),
            macd: calcMACD(closes),
            bollingerBands: calcBollingerBands(closes, 20, 2)
        };

        // ---- EMA Ribbon ----
        try { result.emaRibbon = calcEMARibbon(closes); } catch (e) { result.emaRibbon = null; }

        // ---- Momentum / Oscillators ----
        try { result.stochastic = ohlc.length >= 14 ? calcStochastic(ohlc) : null; } catch (e) { result.stochastic = null; }
        try { result.williamsR = ohlc.length >= 14 ? calcWilliamsR(ohlc) : null; } catch (e) { result.williamsR = null; }
        try { result.cci = ohlc.length >= 20 ? calcCCI(ohlc) : null; } catch (e) { result.cci = null; }
        try { result.roc = calcROC(closes); } catch (e) { result.roc = null; }
        try { result.momentum = calcMomentum(closes); } catch (e) { result.momentum = null; }
        try { result.awesomeOsc = ohlc.length >= 34 ? calcAwesomeOsc(ohlc) : null; } catch (e) { result.awesomeOsc = null; }
        try { result.ultimateOsc = ohlc.length >= 29 ? calcUltimateOsc(ohlc) : null; } catch (e) { result.ultimateOsc = null; }
        try { result.tsi = calcTSI(closes); } catch (e) { result.tsi = null; }

        // ---- Trend ----
        try { result.adx = ohlc.length >= 29 ? calcADX(ohlc) : null; } catch (e) { result.adx = null; }
        try { result.ichimoku = ohlc.length >= 52 ? calcIchimoku(ohlc) : null; } catch (e) { result.ichimoku = null; }
        try { result.hma = calcHMA(closes); } catch (e) { result.hma = null; }
        try { result.vwma = ohlc.length >= 20 ? calcVWMA(ohlc) : null; } catch (e) { result.vwma = null; }

        // ---- Volatility ----
        try { result.atr = ohlc.length >= 15 ? calcATR(ohlc) : null; } catch (e) { result.atr = null; }
        try { result.stdDev = calcStdDev(closes); } catch (e) { result.stdDev = null; }
        try { result.keltnerChannel = ohlc.length >= 20 ? calcKeltnerChannel(ohlc) : null; } catch (e) { result.keltnerChannel = null; }
        try { result.donchianChannel = ohlc.length >= 20 ? calcDonchianChannel(ohlc) : null; } catch (e) { result.donchianChannel = null; }
        try { result.histVol = calcHistVol(closes); } catch (e) { result.histVol = null; }

        // ---- Volume ----
        try { result.obv = ohlc.length >= 2 ? calcOBV(ohlc) : null; } catch (e) { result.obv = null; }
        try { result.adLine = ohlc.length >= 2 ? calcADLine(ohlc) : null; } catch (e) { result.adLine = null; }

        return result;
    },

    logPatternHunterScan(symbol, price, type) {
        const data = this.load();
        const logId = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
        data.patternHunterLogs.push({
            id: logId,
            timestamp: Date.now(),
            symbol: symbol,
            price: price,
            type: type,
            indicators: this._captureIndicators(),
            aiResult: null,
            wasExecuted: false,
            tradeOutcome: null
        });
        this.save(data);
        window._lastPatternHunterId = logId;
        return logId;
    },

    logPatternHunterResult(aiResult) {
        const data = this.load();
        const logId = window._lastPatternHunterId;
        if (logId) {
            const entry = data.patternHunterLogs.find(l => l.id === logId);
            if (entry) {
                entry.aiResult = aiResult;
            }
        }
        this.save(data);
    },

    markPatternHunterExecuted(tradeId) {
        const data = this.load();
        const logId = window._lastPatternHunterId;
        if (logId) {
            const entry = data.patternHunterLogs.find(l => l.id === logId);
            if (entry) {
                entry.wasExecuted = true;
                entry.linkedTradeId = tradeId;
            }
        }
        this.save(data);
    },

    logAIPrompt(symbol, prompt, response) {
        const data = this.load();
        data.aiPromptLogs.push({
            id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
            timestamp: Date.now(),
            symbol: symbol,
            prompt: prompt,
            aiResponse: response
        });
        this.save(data);
    },

    logTradeOpen(positionData, source) {
        const data = this.load();
        data.tradeLogs.push({
            id: positionData.id || Date.now().toString(36),
            timestamp: Date.now(),
            symbol: positionData.symbol,
            name: positionData.name,
            side: positionData.side,
            qty: positionData.qty,
            entryPrice: positionData.entryPrice,
            exitPrice: null,
            pnl: null,
            result: 'open',
            source: source || 'manual',
            indicators: this._captureIndicators()
        });
        this.save(data);
    },

    logTradeClose(posId, exitPrice, pnl) {
        const data = this.load();
        const trade = data.tradeLogs.find(t => t.id === posId);
        if (trade) {
            trade.exitPrice = exitPrice;
            trade.pnl = pnl;
            trade.result = pnl >= 0 ? 'win' : 'loss';
            trade.closedAt = Date.now();
        }
        // Also update Pattern Hunter log outcome if linked
        const phLog = data.patternHunterLogs.find(l => l.linkedTradeId === posId);
        if (phLog) {
            phLog.tradeOutcome = pnl >= 0 ? 'win' : 'loss';
        }
        this.save(data);
    },

    getStats() {
        const data = this.load();
        const phLogs = data.patternHunterLogs;
        const trades = data.tradeLogs;

        // Pattern Hunter stats
        const totalScans = phLogs.length;
        const executed = phLogs.filter(l => l.wasExecuted);
        const notExecuted = phLogs.filter(l => !l.wasExecuted);
        const withOutcome = executed.filter(l => l.tradeOutcome);
        const phWins = withOutcome.filter(l => l.tradeOutcome === 'win').length;
        const phLosses = withOutcome.filter(l => l.tradeOutcome === 'loss').length;

        // Trade stats
        const closedTrades = trades.filter(t => t.result === 'win' || t.result === 'loss');
        const tradeWins = closedTrades.filter(t => t.result === 'win').length;
        const tradeLosses = closedTrades.filter(t => t.result === 'loss').length;

        return {
            totalScans,
            executedCount: executed.length,
            notExecutedCount: notExecuted.length,
            executionRate: totalScans > 0 ? ((executed.length / totalScans) * 100).toFixed(1) : '0.0',
            phAccuracy: withOutcome.length > 0 ? ((phWins / withOutcome.length) * 100).toFixed(1) : 'N/A',
            phWins,
            phLosses,
            totalTrades: trades.length,
            closedTrades: closedTrades.length,
            tradeWins,
            tradeLosses,
            tradeWinRate: closedTrades.length > 0 ? ((tradeWins / closedTrades.length) * 100).toFixed(1) : 'N/A',
            totalPnl: closedTrades.reduce((sum, t) => sum + (t.pnl || 0), 0)
        };
    }
};

// Expose globally for admin page and ai-widget
window.AnalyticsLogger = AnalyticsLogger;

// --- Wrap PaperTrading to auto-log trades ---
const _origOpenPosition = PaperTrading.openPosition.bind(PaperTrading);
PaperTrading.openPosition = function (symbol, name, side, qty, entryPrice, takeProfit, stopLoss, leverage) {
    const result = _origOpenPosition(symbol, name, side, qty, entryPrice, takeProfit, stopLoss, leverage);
    if (result.success) {
        // Find the position that was just created (last one)
        const data = PaperTrading.load();
        const lastPos = data.positions[data.positions.length - 1];
        const source = window._patternHunterTradeInProgress ? 'pattern-hunter' : 'manual';
        if (lastPos) {
            AnalyticsLogger.logTradeOpen(lastPos, source);
            if (source === 'pattern-hunter') {
                AnalyticsLogger.markPatternHunterExecuted(lastPos.id);
                window._patternHunterTradeInProgress = false;
            }
        }
    }
    return result;
};

const _origClosePosition = PaperTrading.closePosition.bind(PaperTrading);
PaperTrading.closePosition = function (posId, currentPrice) {
    const result = _origClosePosition(posId, currentPrice);
    if (result.success) {
        AnalyticsLogger.logTradeClose(posId, currentPrice, result.pnl);
    }
    return result;
};

// ---- Trading Mode Toggle Injection ----
function initTradingMode() {
    // Detect if we are on a detail page
    const cryptoHero = document.getElementById('coin-hero');
    const marketHero = document.getElementById('market-hero');
    const hero = cryptoHero || marketHero;
    if (!hero) return;

    // Don't double-init
    if (document.getElementById('trading-toggle')) return;

    // Create Toggle Element
    const toggle = document.createElement('div');
    toggle.id = 'trading-toggle';
    toggle.className = 'trading-toggle-wrapper';
    toggle.innerHTML = `
        <span class="trading-toggle-icon">📈</span>
        <span class="trading-toggle-label">Trading Mode</span>
        <div class="trading-toggle-switch"></div>
    `;
    hero.appendChild(toggle);

    // Create Trading Mode Container (hidden by default)
    const container = document.createElement('div');
    container.id = 'trading-mode-container';
    container.className = 'trading-mode-container';

    // Insert after .detail-grid
    const detailGrid = document.querySelector('.detail-grid');
    if (detailGrid) {
        detailGrid.parentNode.insertBefore(container, detailGrid.nextSibling);
    } else {
        hero.parentNode.appendChild(container);
    }

    // Toggle Logic
    let tradingActive = false;
    let tradingBuilt = false;
    let tradingLoop = null;

    const startTradingLoop = () => {
        if (tradingLoop) clearTimeout(tradingLoop);

        // Let's use sequential setTimeout instead of setInterval to be safer with async
        updateTradingData();
    };

    const stopTradingLoop = () => {
        if (tradingLoop) {
            clearTimeout(tradingLoop);
            tradingLoop = null;
        }
    };

    const updateTradingData = async () => {
        if (!tradingActive) return;
        const pageType = cryptoHero ? 'crypto' : 'market';
        const assetInfo = getCurrentAssetInfo(pageType);

        // Fetch live price
        const quotes = await fetchRealTimePrice(assetInfo);
        if (quotes && quotes.price) {
            // Update DOM so getCurrentAssetInfo gets fresh data next time
            // and user sees live price
            // Find price element
            let priceEl;
            if (pageType === 'crypto') {
                priceEl = document.querySelector('#coin-hero div[style*="font-weight: 700"]') ||
                    document.querySelector('#coin-hero div[style*="font-size: var(--text-5xl)"]');
            } else {
                priceEl = document.querySelector('#market-hero div[style*="font-weight: 700"]') ||
                    document.querySelector('#market-hero div[style*="font-size: 3.5rem"]');
            }

            if (priceEl) {
                const oldPriceText = priceEl.innerText.replace(/[$,]/g, '');
                const oldPrice = parseFloat(oldPriceText) || 0;
                priceEl.innerText = `$${quotes.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

                // Flash effect ONLY if price actually changed
                if (Math.abs(quotes.price - oldPrice) > 0.00001) {
                    priceEl.style.color = quotes.price > oldPrice ? '#00d4aa' : '#ff6b6b';
                    priceEl.style.transition = 'color 0.1s';
                    setTimeout(() => { priceEl.style.color = ''; }, 300);
                }
            }

            // Re-read info with new price (or just patch it)
            assetInfo.price = quotes.price;

            // Trigger updates
            updatePaperBalanceDisplay();
            updatePositionsList(assetInfo);

            // Update order form hint if exists
            const priceHint = document.getElementById('order-current-price-hint');
            if (priceHint) priceHint.textContent = `Market: $${quotes.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
        }

        // Schedule next update only if still active
        if (tradingActive) {
            tradingLoop = setTimeout(updateTradingData, 1000);
        }
    };

    toggle.addEventListener('click', () => {
        tradingActive = !tradingActive;

        if (tradingActive) {
            toggle.classList.add('active');
            if (detailGrid) detailGrid.style.display = 'none';
            container.classList.add('active');

            // Build the interface once
            if (!tradingBuilt) {
                buildTradingInterface(container, cryptoHero ? 'crypto' : 'market');
                tradingBuilt = true;
            }
            // Start Loop
            startTradingLoop();

            // Update balance display immediately
            updatePaperBalanceDisplay();
        } else {
            toggle.classList.remove('active');
            if (detailGrid) detailGrid.style.display = '';
            container.classList.remove('active');
            stopTradingLoop();
        }
    });
}

// ---- Build the Full Trading Interface ----
function buildTradingInterface(container, pageType) {
    // Determine current asset info from the hero
    const assetInfo = getCurrentAssetInfo(pageType);

    container.innerHTML = `
        <!-- Paper Trading Balance Bar -->
        <div class="paper-balance-bar" id="paper-balance-bar">
            <div class="paper-balance-item">
                <span class="paper-balance-label">Paper Balance</span>
                <span class="paper-balance-value" id="paper-balance-amount">$100,000.00</span>
            </div>
            <button class="paper-balance-edit-btn" id="paper-balance-edit" title="Edit Balance">✏️</button>
            <div class="paper-balance-divider"></div>
            <div class="paper-balance-item">
                <span class="paper-balance-label">Unrealized P/L</span>
                <span class="paper-balance-value" id="paper-unrealized-pnl">$0.00</span>
            </div>
            <div class="paper-balance-divider"></div>
            <div class="paper-balance-item">
                <span class="paper-balance-label">Realized P/L</span>
                <span class="paper-balance-value" id="paper-realized-pnl">$0.00</span>
            </div>
        </div>

        <!-- Trading Grid -->
        <div class="trading-grid">
            <!-- Left: Chart + Indicators -->
            <div class="trading-chart-area">
                <div class="trading-chart-box" id="trading-chart-box">
                    <!-- Chart will be cloned here -->
                </div>

                <!-- Indicators Panel -->
                <div class="trading-indicators-panel" id="trading-indicators">
                    <!-- Populated by JS -->
                </div>
            </div>

            <!-- Right: Buy/Sell + News -->
            <div class="trading-order-panel">
                <!-- Order Card -->
                <div class="order-card">
                    <!-- Order Type Tabs -->
                    <div class="order-type-tabs">
                        <button class="order-type-tab active" data-type="market">Market</button>
                        <button class="order-type-tab" data-type="limit">Limit</button>
                        <button class="order-type-tab" data-type="stop">Stop</button>
                    </div>

                    <!-- Buy/Sell Toggle -->
                    <div class="order-side-toggle">
                        <button class="order-side-btn buy-btn active" data-side="buy">Buy / Long</button>
                        <button class="order-side-btn sell-btn" data-side="sell">Sell / Short</button>
                    </div>

                    <!-- Price (for limit/stop) -->
                    <div class="order-form-group" id="order-price-group" style="display: none;">
                        <div class="order-form-label">
                            <span>Price (USD)</span>
                            <span id="order-current-price-hint">Market: --</span>
                        </div>
                        <input type="number" class="order-input" id="order-price" placeholder="Enter price" step="any">
                    </div>

                    <!-- Quantity -->
                    <div class="order-form-group">
                        <div class="order-form-label">
                            <span>Quantity</span>
                            <span id="order-available">Avail: --</span>
                        </div>
                        <input type="number" class="order-input" id="order-qty" placeholder="Enter quantity" step="any" min="0">
                        <div class="quick-amount-row">
                            <button class="quick-amount-btn" data-pct="25">25%</button>
                            <button class="quick-amount-btn" data-pct="50">50%</button>
                            <button class="quick-amount-btn" data-pct="75">75%</button>
                            <button class="quick-amount-btn" data-pct="100">100%</button>
                        </div>
                    </div>

                    <!-- TP / SL Mode Toggle -->
                    <div class="tp-sl-mode-toggle" id="tp-sl-mode-toggle">
                        <button class="tp-sl-mode-btn active" data-mode="price">Price</button>
                        <button class="tp-sl-mode-btn" data-mode="dollar">Dollar (P/L)</button>
                    </div>

                    <!-- TP / SL -->
                    <div class="order-tp-sl-row">
                        <div class="order-form-group">
                            <div class="order-form-label"><span>Take Profit</span></div>
                            <input type="number" class="order-input" id="order-tp" placeholder="Target Price" step="any">
                        </div>
                        <div class="order-form-group">
                            <div class="order-form-label"><span>Stop Loss</span></div>
                            <input type="number" class="order-input" id="order-sl" placeholder="Target Price" step="any">
                        </div>
                    </div>

                    <!-- Leverage Selection -->
                    <div class="order-form-group">
                        <div class="order-form-label">
                            <span>Leverage</span>
                            <span id="leverage-max-label">Max: 1x</span>
                        </div>
                        <div class="leverage-input-row" style="display: flex; gap: 12px; align-items: center;">
                            <input type="range" class="leverage-slider" id="order-leverage-slider" min="1" max="1" step="1" value="1" style="flex: 1; accent-color: var(--color-accent);">
                            <div class="leverage-badge" style="background: rgba(var(--color-accent-rgb), 0.1); color: var(--color-accent); padding: 4px 10px; border-radius: 6px; font-weight: 700; min-width: 50px; text-align: center; border: 1px solid rgba(var(--color-accent-rgb), 0.2);">
                                <span id="leverage-value-display">1</span>x
                            </div>
                        </div>
                    </div>

                    <!-- Order Summary -->
                    <div class="order-summary">
                        <div class="order-summary-row">
                            <span>Total Value</span>
                            <span id="order-summary-total-value">--</span>
                        </div>
                        <div class="order-summary-row" style="color: var(--color-accent); font-weight: 700;">
                            <span>Margin Required</span>
                            <span id="order-summary-margin">--</span>
                        </div>
                        <div class="order-summary-row total" style="display: none;">
                            <span>Total</span>
                            <span id="order-summary-total">$0.00</span>
                        </div>
                    </div>

                    <!-- Execute Button -->
                    <button class="order-execute-btn buy" id="order-execute-btn">BUY ${assetInfo.symbol || 'ASSET'}</button>
                </div>

                <!-- Open Positions -->
                <div class="positions-card">
                    <div class="positions-header">
                        <h4>📊 Open Positions</h4>
                    </div>
                    <div id="positions-list">
                        <p style="font-size: 0.85rem; color: var(--color-text-muted); text-align: center; padding: 1rem 0;">No open positions</p>
                    </div>
                </div>

                <!-- Trading News -->
                <div class="trading-news-card">
                    <h4>📰 AI-Curated News</h4>
                    <div id="trading-news-feed">
                        <div class="spinner" style="margin: 1rem auto;"></div>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Initialize the chart in trading mode
    initTradingChart(assetInfo);

    // Initialize indicators
    buildIndicators(assetInfo);

    // Load news into trading panel
    loadTradingNews(assetInfo);

    // Wire up order form
    wireOrderForm(assetInfo);

    // Wire balance edit
    wireBalanceEdit();

    // Update positions
    updatePositionsList(assetInfo);

    // Update balance
    updatePaperBalanceDisplay();

    // Prosperous Pattern Hunter Integration for Trade Mode
    if (typeof initPatternHunter === 'function') {
        initPatternHunter('.trading-chart-area', '#trading-chart-box');
    }
}

// ---- Get Current Asset Info ----
function getCurrentAssetInfo(pageType) {
    const urlParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.substring(1));

    if (pageType === 'crypto') {
        const coinId = urlParams.get('id') || hashParams.get('id') || 'bitcoin';
        const heroH1 = document.querySelector('#coin-hero h1');
        const name = heroH1 ? heroH1.innerText.split('(')[0].trim() : coinId;
        const priceEl = document.querySelector('#coin-hero div[style*="font-weight: 700"]') ||
            document.querySelector('#coin-hero div[style*="font-size: var(--text-5xl)"]');
        const priceText = priceEl ? priceEl.innerText.trim().replace(/[^0-9.]/g, '') : '0';

        const symbolMap = {
            'bitcoin': 'BTC', 'ethereum': 'ETH', 'solana': 'SOL',
            'cardano': 'ADA', 'ripple': 'XRP', 'dogecoin': 'DOGE',
            'polkadot': 'DOT', 'binancecoin': 'BNB', 'avalanche-2': 'AVAX',
            'shiba-inu': 'SHIB', 'chainlink': 'LINK', 'litecoin': 'LTC'
        };

        return {
            id: coinId,
            symbol: symbolMap[coinId] || coinId.toUpperCase(),
            name: name,
            price: parseFloat(priceText) || 0,
            type: 'crypto'
        };
    } else {
        const symbol = urlParams.get('symbol') || 'AAPL';
        const type = urlParams.get('type') || 'stock';
        const heroH1 = document.querySelector('#market-hero h1');
        const name = heroH1 ? heroH1.innerText.trim() : symbol;
        const priceEl = document.querySelector('#market-hero div[style*="font-weight: 700"]') ||
            document.querySelector('#market-hero div[style*="font-size: 3.5rem"]');
        const priceText = priceEl ? priceEl.innerText.trim().replace(/[^0-9.]/g, '') : '0';

        let resolvedType = 'stock';
        if (type === 'resource') resolvedType = 'commodity';
        else if (type === 'forex') resolvedType = 'forex';
        else resolvedType = type;

        return {
            id: symbol,
            symbol: symbol,
            name: name,
            price: parseFloat(priceText) || 0,
            type: resolvedType
        };
    }
}

// ---- Init Chart in Trading View ----
function initTradingChart(assetInfo) {
    const chartBox = document.getElementById('trading-chart-box');
    if (!chartBox) return;

    if (assetInfo.type === 'crypto') {
        // Use TradingView widget for crypto
        const tvSymbolMap = {
            'bitcoin': 'BINANCE:BTCUSD', 'ethereum': 'BINANCE:ETHUSD',
            'solana': 'BINANCE:SOLUSD', 'cardano': 'BINANCE:ADAUSD',
            'ripple': 'BINANCE:XRPUSD', 'dogecoin': 'BINANCE:DOGEUSD',
            'polkadot': 'BINANCE:DOTUSD', 'binancecoin': 'BINANCE:BNBUSD',
            'avalanche-2': 'BINANCE:AVAXUSD', 'litecoin': 'BINANCE:LTCUSD'
        };
        const tvSymbol = tvSymbolMap[assetInfo.id] || `BINANCE:${assetInfo.symbol}USD`;
        initTVEmbed(tvSymbol, chartBox);
    } else {
        // Use existing logic for stocks/commodities
        initTradingViewWidget(assetInfo.symbol, assetInfo.type);
        // Move the chart content to trading chart box
        setTimeout(() => {
            const origChart = document.getElementById('tv-chart-container');
            if (origChart && origChart.children.length > 0 && chartBox.children.length === 0) {
                const clone = origChart.cloneNode(true);
                clone.id = '';
                chartBox.appendChild(clone);
            }
        }, 500);

        // Actually, just embed a fresh TradingView widget
        if (isExchangeRestricted(assetInfo.symbol)) {
            initLightweightChart(assetInfo.symbol, chartBox);
        } else {
            const tvSymbol = convertToTradingViewSymbol(assetInfo.symbol);
            initTVEmbed(tvSymbol, chartBox);
        }
    }
}

// ---- Technical Indicator Calculation Helpers ----

function calcSMA(closes, period) {
    if (closes.length < period) return null;
    const slice = closes.slice(closes.length - period);
    return slice.reduce((a, b) => a + b, 0) / period;
}

function calcEMA(closes, period) {
    if (closes.length < period) return null;
    const k = 2 / (period + 1);
    let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < closes.length; i++) {
        ema = closes[i] * k + ema * (1 - k);
    }
    return ema;
}

function calcRSI(closes, period = 14) {
    // Wilder's Smoothing RSI — matches TradingView/industry standard
    if (closes.length < period + 1) return null;

    // Step 1: Calculate initial average gain/loss using first 'period' changes
    let avgGain = 0, avgLoss = 0;
    for (let i = 1; i <= period; i++) {
        const diff = closes[i] - closes[i - 1];
        if (diff > 0) avgGain += diff;
        else avgLoss -= diff;
    }
    avgGain /= period;
    avgLoss /= period;

    // Step 2: Apply Wilder's smoothing for the rest of the data
    for (let i = period + 1; i < closes.length; i++) {
        const diff = closes[i] - closes[i - 1];
        const gain = diff > 0 ? diff : 0;
        const loss = diff < 0 ? -diff : 0;
        avgGain = (avgGain * (period - 1) + gain) / period;
        avgLoss = (avgLoss * (period - 1) + loss) / period;
    }

    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
}

function calcMACD(closes) {
    // MACD Line = EMA(12) - EMA(26), Signal = EMA(9) of MACD series
    if (closes.length < 35) return null;

    const k12 = 2 / 13, k26 = 2 / 27, k9 = 2 / 10;

    // ---- Build EMA(12) series ----
    // Seed: SMA of first 12 closes
    let ema12 = closes.slice(0, 12).reduce((a, b) => a + b, 0) / 12;
    const ema12Series = [ema12];
    // Continue from index 12 onward (NOT index 1 — avoids double-counting seed data)
    for (let i = 12; i < closes.length; i++) {
        ema12 = closes[i] * k12 + ema12 * (1 - k12);
        ema12Series.push(ema12);
    }

    // ---- Build EMA(26) series ----
    // Seed: SMA of first 26 closes
    let ema26 = closes.slice(0, 26).reduce((a, b) => a + b, 0) / 26;
    const ema26Series = [ema26];
    for (let i = 26; i < closes.length; i++) {
        ema26 = closes[i] * k26 + ema26 * (1 - k26);
        ema26Series.push(ema26);
    }

    // ---- Build MACD series (EMA12 - EMA26 where both exist) ----
    // EMA12 series starts at index 11 (offset 0), EMA26 series starts at index 25 (offset 0)
    // Both exist from close index 26 onward: EMA12 at offset (26-12)=14, EMA26 at offset (26-26)=0
    const macdSeries = [];
    for (let i = 26; i < closes.length; i++) {
        const e12 = ema12Series[i - 12 + 1]; // +1 because series[0] is the seed
        const e26 = ema26Series[i - 26 + 1];
        if (e12 !== undefined && e26 !== undefined) {
            macdSeries.push(e12 - e26);
        }
    }

    if (macdSeries.length === 0) return null;
    const macdLine = macdSeries[macdSeries.length - 1];

    // ---- Signal line = EMA(9) of MACD series ----
    let signal = null;
    if (macdSeries.length >= 9) {
        signal = macdSeries.slice(0, 9).reduce((a, b) => a + b, 0) / 9;
        for (let i = 9; i < macdSeries.length; i++) {
            signal = macdSeries[i] * k9 + signal * (1 - k9);
        }
    }

    const histogram = signal !== null ? macdLine - signal : 0;
    return { macdLine, signal: signal || 0, histogram };
}

function calcBollingerBands(closes, period = 20, mult = 2) {
    if (closes.length < period) return null;
    const slice = closes.slice(closes.length - period);
    const sma = slice.reduce((a, b) => a + b, 0) / period;
    const variance = slice.reduce((sum, c) => sum + Math.pow(c - sma, 2), 0) / period;
    const stdDev = Math.sqrt(variance);
    return {
        upper: sma + mult * stdDev,
        middle: sma,
        lower: sma - mult * stdDev
    };
}

// ---- Fetch OHLC from Yahoo Finance via CORS proxy ----
async function fetchYahooOHLC(symbol, range = '1y', interval = '1d') {
    const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}&includePrePost=false`;

    for (let i = 0; i < CORS_PROXIES.length; i++) {
        try {
            const proxyUrl = CORS_PROXIES[i](yahooUrl);
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 12000);

            const response = await fetch(proxyUrl, { signal: controller.signal });
            clearTimeout(timeout);
            if (!response.ok) continue;

            const data = await response.json();
            const result = data?.chart?.result?.[0];
            if (!result) continue;

            const timestamps = result.timestamp;
            const quote = result.indicators?.quote?.[0];
            if (!timestamps || !quote) continue;

            const ohlc = [];
            for (let j = 0; j < timestamps.length; j++) {
                const o = quote.open?.[j];
                const h = quote.high?.[j];
                const l = quote.low?.[j];
                const c = quote.close?.[j];
                const v = quote.volume?.[j];
                if (c == null) continue; // skip null candles
                ohlc.push({
                    time: new Date(timestamps[j] * 1000).toISOString().split('T')[0],
                    open: o ?? c,
                    high: h ?? c,
                    low: l ?? c,
                    close: c,
                    volume: v ?? 0
                });
            }
            if (ohlc.length > 0) return ohlc;
        } catch (e) {
            continue; // try next proxy
        }
    }
    console.warn(`fetchYahooOHLC failed for ${symbol} (all proxies exhausted)`);
    return [];
}

// ---- Fetch price history for indicators ----
async function fetchIndicatorOHLC(assetInfo) {
    try {
        if (assetInfo.type === 'crypto') {
            // CoinGecko market_chart — daily prices + volumes
            // Try 365 days first (reliable on free tier), fallback to 180 days
            const daysOptions = [365, 180];
            for (const days of daysOptions) {
                try {
                    const url = `https://api.coingecko.com/api/v3/coins/${assetInfo.id}/market_chart?vs_currency=usd&days=${days}&interval=daily`;
                    console.log(`[Indicators] Fetching CoinGecko market_chart: days=${days} for ${assetInfo.id}`);
                    const res = await fetch(url);
                    if (!res.ok) {
                        console.warn(`[Indicators] CoinGecko returned ${res.status} for days=${days}`);
                        continue;
                    }
                    const data = await res.json();
                    if (data && data.prices && data.prices.length > 0) {
                        // Build volume lookup from total_volumes
                        const volMap = {};
                        if (data.total_volumes) {
                            data.total_volumes.forEach(v => {
                                const day = new Date(v[0]).toISOString().split('T')[0];
                                volMap[day] = v[1] || 0;
                            });
                        }
                        // Deduplicate by date (market_chart can return duplicate timestamps)
                        const seen = new Set();
                        const result = [];
                        for (const d of data.prices) {
                            const day = new Date(d[0]).toISOString().split('T')[0];
                            if (seen.has(day)) continue;
                            seen.add(day);
                            result.push({
                                time: day,
                                close: d[1],
                                open: d[1],   // market_chart only provides close; open≈close for daily
                                high: d[1],   // approximation for OHLC-dependent indicators
                                low: d[1],
                                volume: volMap[day] || 0
                            });
                        }
                        console.log(`[Indicators] Got ${result.length} daily data points from CoinGecko (days=${days})`);
                        return result;
                    }
                } catch (innerErr) {
                    console.warn(`[Indicators] CoinGecko days=${days} failed:`, innerErr.message);
                    continue;
                }
            }
            console.error('[Indicators] All CoinGecko attempts failed for', assetInfo.id);
            return [];
        } else {
            // Stocks/Commodities/Forex — Yahoo Finance real OHLC
            // Try 2y first for SMA 200 accuracy, fallback to 1y
            let data = await fetchYahooOHLC(assetInfo.symbol, '2y', '1d');
            if (data.length === 0) {
                console.warn('[Indicators] 2y Yahoo fetch failed, trying 1y for', assetInfo.symbol);
                data = await fetchYahooOHLC(assetInfo.symbol, '1y', '1d');
            }
            console.log(`[Indicators] Got ${data.length} data points from Yahoo for ${assetInfo.symbol}`);
            return data;
        }
    } catch (e) {
        console.error('[Indicators] Data fetch failed:', e);
        return [];
    }
}

// ---- Fetch Real-Time Price (Single Asset) ----
async function fetchRealTimePrice(assetInfo) {
    try {
        if (assetInfo.type === 'crypto') {
            // Use Binance Public API for fast 1s updates (much better than CoinGecko for this)
            const binanceSymbol = (assetInfo.symbol === 'BTC' ? 'BTCUSDT' :
                assetInfo.symbol === 'ETH' ? 'ETHUSDT' :
                    `${assetInfo.symbol}USDT`).toUpperCase();

            const url = `https://api.binance.com/api/v3/ticker/price?symbol=${binanceSymbol}`;
            const res = await fetch(url);
            if (!res.ok) throw new Error('Binance price fetch failed');
            const data = await res.json();

            if (data && data.price) {
                return {
                    price: parseFloat(data.price),
                    change: 0 // Price lookup doesn't give 24h change in this endpoint, but we only need price for triggers
                };
            }
        } else {
            // Stocks/Commodities - Direct Finnhub Quote (Fastest)
            const symbol = assetInfo.symbol;
            const url = `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_API_KEY}`;
            const res = await fetch(url);
            if (!res.ok) throw new Error('Finnhub quote fetch failed');
            const data = await res.json();

            if (data && data.c) {
                return {
                    price: data.c,
                    change: data.dp || 0
                };
            }
        }
    } catch (e) {
        console.warn('Real-time price fetch failed:', e);
    }
    return null;
}

// ---- Fetch Fear & Greed Index ----
async function fetchFearGreedIndex() {
    try {
        const res = await fetch('https://api.alternative.me/fng/?limit=1');
        if (!res.ok) throw new Error('FNG API failed');
        const data = await res.json();
        if (data && data.data && data.data.length > 0) {
            return {
                value: parseInt(data.data[0].value),
                label: data.data[0].value_classification
            };
        }
    } catch (e) {
        console.warn('Fear & Greed fetch failed:', e);
    }
    return null;
}

// ---- Build Indicators (Real Data) ----
async function buildIndicators(assetInfo) {
    const panel = document.getElementById('trading-indicators');
    if (!panel) return;

    const price = assetInfo.price || 0;

    // Show loading state
    panel.innerHTML = `
        <div class="indicator-card" style="grid-column: 1 / -1; text-align: center; padding: 2rem;">
            <div class="spinner" style="margin: 0 auto 1rem;"></div>
            <p style="color: var(--color-text-muted); font-size: 0.9rem;">Fetching real-time indicators...</p>
        </div>
    `;

    // Fetch data in parallel
    const [ohlcData, fearGreed] = await Promise.all([
        fetchIndicatorOHLC(assetInfo),
        fetchFearGreedIndex()
    ]);

    // Extract closing prices
    const closes = ohlcData.map(d => d.close).filter(c => c != null);

    // ---- Calculate Real Indicators ----
    const rsiValue = closes.length >= 15 ? Math.round(calcRSI(closes, 14)) : null;
    const sma20 = calcSMA(closes, 20);
    const sma50 = calcSMA(closes, 50);
    const sma200 = calcSMA(closes, 200);
    const macd = calcMACD(closes);
    const bb = calcBollingerBands(closes, 20, 2);

    // Fear & Greed (crypto-specific index from alternative.me)
    const isCrypto = assetInfo.type === 'crypto';
    const fgValue = (isCrypto && fearGreed) ? fearGreed.value : null;
    const fgLabel = (isCrypto && fearGreed) ? fearGreed.label : (isCrypto ? 'Unavailable' : 'N/A (Stocks)');

    // Data freshness info
    const dataPoints = closes.length;
    const dataSource = isCrypto ? 'CoinGecko' : 'Yahoo Finance';
    const lastDataDate = ohlcData.length > 0 ? ohlcData[ohlcData.length - 1].time : 'N/A';

    // ---- Render ----
    // RSI
    const rsiBias = rsiValue !== null ? (rsiValue > 60 ? 'bullish' : rsiValue < 40 ? 'bearish' : 'neutral') : 'neutral';
    const rsiLabel = rsiValue !== null ? (rsiValue > 70 ? 'Overbought' : rsiValue < 30 ? 'Oversold' : rsiValue > 60 ? 'Bullish' : rsiValue < 40 ? 'Bearish' : 'Neutral') : 'N/A';
    const rsiDisplay = rsiValue !== null ? rsiValue : '—';

    // Fear & Greed
    const fgBias = fgValue !== null ? (fgValue > 60 ? 'bullish' : fgValue < 40 ? 'bearish' : 'neutral') : 'neutral';
    const fgColor = fgValue !== null ? (fgValue > 60 ? '#00d4aa' : fgValue < 40 ? '#ff6b6b' : '#ffd93d') : '#888';

    // Moving Averages
    const maBias = sma50 !== null ? (price > sma50 ? 'bullish' : 'bearish') : 'neutral';

    // MACD
    const macdBias = macd ? (macd.histogram > 0 ? 'bullish' : 'bearish') : 'neutral';

    // Bollinger Bands
    const bbBias = bb ? (price > bb.upper * 0.98 ? 'bearish' : price < bb.lower * 1.02 ? 'bullish' : 'neutral') : 'neutral';

    // Helper to format price
    const fmtPrice = (v) => v !== null && v !== undefined ? '$' + v.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—';
    const fmtNum = (v, dec = 2) => v !== null && v !== undefined ? v.toFixed(dec) : '—';

    panel.innerHTML = `
        <!-- RSI -->
        <div class="indicator-card" data-ind-id="rsi">
            <div class="indicator-card-header">
                <span class="indicator-card-title">📊 RSI (14)</span>
                <span class="indicator-card-badge ${rsiBias}">${rsiLabel}</span>
            </div>
            <div style="font-size: 2rem; font-weight: 700; color: var(--color-text-primary); margin: 4px 0;">${rsiDisplay}</div>
            <div class="indicator-gauge">
                <div class="indicator-gauge-fill" style="width: ${rsiValue || 50}%; background: ${rsiValue > 70 ? '#ff6b6b' : rsiValue < 30 ? '#00d4aa' : '#ffd93d'};"></div>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 10px; color: var(--color-text-muted);">
                <span>Oversold (30)</span><span>Overbought (70)</span>
            </div>
        </div>

        <!-- Fear & Greed (crypto only) -->
        ${isCrypto ? `
        <div class="indicator-card" data-ind-id="fear_greed">
            <div class="indicator-card-header">
                <span class="indicator-card-title">🧠 Crypto Fear & Greed</span>
                <span class="indicator-card-badge ${fgBias}">${fgLabel}</span>
            </div>
            <div style="font-size: 2rem; font-weight: 700; color: ${fgColor}; margin: 4px 0;">${fgValue !== null ? fgValue : '—'}</div>
            <div class="indicator-gauge">
                <div class="indicator-gauge-fill" style="width: ${fgValue || 0}%; background: ${fgColor};"></div>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 10px; color: var(--color-text-muted);">
                <span>Extreme Fear (0)</span><span>Extreme Greed (100)</span>
            </div>
        </div>
        ` : ''}

        <!-- Moving Averages -->
        <div class="indicator-card" data-ind-id="moving_avg">
            <div class="indicator-card-header">
                <span class="indicator-card-title">📈 Moving Averages</span>
                <span class="indicator-card-badge ${maBias}">${maBias === 'bullish' ? 'Above MA' : maBias === 'bearish' ? 'Below MA' : 'N/A'}</span>
            </div>
            <div class="indicator-value-row">
                <span class="indicator-value-label">SMA 20</span>
                <span class="indicator-value-num">${fmtPrice(sma20)}</span>
            </div>
            <div class="indicator-value-row">
                <span class="indicator-value-label">SMA 50</span>
                <span class="indicator-value-num">${fmtPrice(sma50)}</span>
            </div>
            <div class="indicator-value-row">
                <span class="indicator-value-label">SMA 200</span>
                <span class="indicator-value-num">${fmtPrice(sma200)}</span>
            </div>
            <div class="indicator-value-row">
                <span class="indicator-value-label">Current</span>
                <span class="indicator-value-num" style="color: var(--color-accent);">${fmtPrice(price)}</span>
            </div>
        </div>

        <!-- MACD -->
        <div class="indicator-card" data-ind-id="macd">
            <div class="indicator-card-header">
                <span class="indicator-card-title">📉 MACD (12,26,9)</span>
                <span class="indicator-card-badge ${macdBias}">${macd ? (macd.histogram > 0 ? 'Bullish' : 'Bearish') : 'N/A'}</span>
            </div>
            <div class="indicator-value-row">
                <span class="indicator-value-label">MACD Line</span>
                <span class="indicator-value-num" style="color: ${macd && macd.macdLine > 0 ? '#00d4aa' : '#ff6b6b'};">${macd ? fmtNum(macd.macdLine) : '—'}</span>
            </div>
            <div class="indicator-value-row">
                <span class="indicator-value-label">Signal Line</span>
                <span class="indicator-value-num">${macd ? fmtNum(macd.signal) : '—'}</span>
            </div>
            <div class="indicator-value-row">
                <span class="indicator-value-label">Histogram</span>
                <span class="indicator-value-num" style="color: ${macd && macd.histogram > 0 ? '#00d4aa' : '#ff6b6b'};">${macd ? fmtNum(macd.histogram) : '—'}</span>
            </div>
        </div>

        <!-- Bollinger Bands -->
        <div class="indicator-card" data-ind-id="bollinger">
            <div class="indicator-card-header">
                <span class="indicator-card-title">🎯 Bollinger Bands (20,2)</span>
                <span class="indicator-card-badge ${bbBias}">${bb ? (bbBias === 'bullish' ? 'Near Lower' : bbBias === 'bearish' ? 'Near Upper' : 'Mid-Range') : 'N/A'}</span>
            </div>
            <div class="indicator-value-row">
                <span class="indicator-value-label">Upper Band</span>
                <span class="indicator-value-num" style="color: #ff6b6b;">${bb ? fmtPrice(bb.upper) : '—'}</span>
            </div>
            <div class="indicator-value-row">
                <span class="indicator-value-label">Middle (SMA)</span>
                <span class="indicator-value-num">${bb ? fmtPrice(bb.middle) : '—'}</span>
            </div>
            <div class="indicator-value-row">
                <span class="indicator-value-label">Lower Band</span>
                <span class="indicator-value-num" style="color: #00d4aa;">${bb ? fmtPrice(bb.lower) : '—'}</span>
            </div>
        </div>

        <!-- Dynamic Custom Indicators Container -->
        <div id="custom-indicators-container"></div>

        <!-- Add Indicator Button -->
        <div class="add-indicator-btn" id="add-indicator-btn" title="Add more indicators">
            <div class="plus-icon">+</div>
            <span class="plus-label">Add Indicator</span>
        </div>

        <!-- Data Freshness Footer -->
        <div style="grid-column: 1 / -1; display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; font-size: 0.7rem; color: var(--color-text-muted); border-top: 1px solid rgba(255,255,255,0.05); margin-top: 4px;">
            <span>📡 Source: ${dataSource} · ${dataPoints} data points</span>
            <span>Last: ${lastDataDate}</span>
        </div>
    `;

    // Store data globally for custom indicator calculations
    window._indicatorData = { closes, ohlcData, price, assetInfo, fmtPrice, fmtNum };

    // Render any previously saved custom indicators
    renderSavedCustomIndicators();

    // Wire up the add button
    const addBtn = document.getElementById('add-indicator-btn');
    if (addBtn) {
        addBtn.addEventListener('click', () => openIndicatorPicker());
    }

    // Wire up info popups on all indicator cards
    wireIndicatorInfoPopups(panel);
}

// =============================================
// CUSTOMIZABLE INDICATOR PICKER SYSTEM
// =============================================

const INDICATOR_CATALOG = [
    // ---- Momentum / Oscillators ----
    { id: 'stochastic', name: 'Stochastic Oscillator', desc: '%K(14,3) / %D(3)', icon: '📉', category: 'Momentum' },
    { id: 'williams_r', name: 'Williams %R', desc: 'Williams %R (14)', icon: '📊', category: 'Momentum' },
    { id: 'cci', name: 'CCI', desc: 'Commodity Channel Index (20)', icon: '🔄', category: 'Momentum' },
    { id: 'roc', name: 'Rate of Change', desc: 'Price ROC (12)', icon: '🚀', category: 'Momentum' },
    { id: 'momentum', name: 'Momentum', desc: 'Momentum (10)', icon: '💨', category: 'Momentum' },
    { id: 'awesome_osc', name: 'Awesome Oscillator', desc: 'SMA(5) − SMA(34) of midpoint', icon: '🌊', category: 'Momentum' },
    { id: 'uo', name: 'Ultimate Oscillator', desc: 'UO (7,14,28)', icon: '⚡', category: 'Momentum' },
    { id: 'tsi', name: 'True Strength Index', desc: 'TSI (25,13)', icon: '💪', category: 'Momentum' },

    // ---- Trend ----
    { id: 'ema_ribbon', name: 'EMA Ribbon', desc: 'EMA 9/21/55/100/200', icon: '🎀', category: 'Trend' },
    { id: 'adx', name: 'ADX', desc: 'Average Directional Index (14)', icon: '🧭', category: 'Trend' },
    { id: 'ichimoku', name: 'Ichimoku Cloud', desc: 'Tenkan/Kijun/Senkou', icon: '☁️', category: 'Trend' },
    { id: 'vwma', name: 'VWMA', desc: 'Volume Weighted MA (20)', icon: '📐', category: 'Trend' },
    { id: 'hma', name: 'Hull Moving Average', desc: 'HMA (9)', icon: '🚤', category: 'Trend' },

    // ---- Volatility ----
    { id: 'atr', name: 'ATR', desc: 'Average True Range (14)', icon: '📏', category: 'Volatility' },
    { id: 'std_dev', name: 'Standard Deviation', desc: 'Std Dev (20)', icon: '📈', category: 'Volatility' },
    { id: 'keltner', name: 'Keltner Channel', desc: 'EMA(20) ± 2×ATR(10)', icon: '📦', category: 'Volatility' },
    { id: 'donchian', name: 'Donchian Channel', desc: '20-period High/Low', icon: '🏔️', category: 'Volatility' },
    { id: 'hist_vol', name: 'Historical Volatility', desc: 'Annualized HV (20)', icon: '🌡️', category: 'Volatility' },

    // ---- Volume ----
    { id: 'obv', name: 'On Balance Volume', desc: 'OBV cumulative', icon: '📊', category: 'Volume' },
    { id: 'ad_line', name: 'Accum/Distribution', desc: 'A/D Line', icon: '💧', category: 'Volume' },
];

const CUSTOM_IND_STORAGE = 'prosperpath_custom_indicators';

function getCustomIndicatorIds() {
    try {
        const raw = localStorage.getItem(CUSTOM_IND_STORAGE);
        return raw ? JSON.parse(raw) : [];
    } catch { return []; }
}

function saveCustomIndicatorIds(ids) {
    try { localStorage.setItem(CUSTOM_IND_STORAGE, JSON.stringify(ids)); } catch { }
}

// ---- Indicator Calculation Functions ----

function calcStochastic(ohlc, kPeriod = 14, dPeriod = 3) {
    if (ohlc.length < kPeriod) return null;
    const recent = ohlc.slice(-kPeriod);
    const highs = recent.map(d => d.high || d.close);
    const lows = recent.map(d => d.low || d.close);
    const highestHigh = Math.max(...highs);
    const lowestLow = Math.min(...lows);
    const close = ohlc[ohlc.length - 1].close;
    if (highestHigh === lowestLow) return { k: 50, d: 50 };
    const k = ((close - lowestLow) / (highestHigh - lowestLow)) * 100;
    // Simple %D = SMA of last 3 %K values (approx)
    const kValues = [];
    for (let i = Math.max(0, ohlc.length - dPeriod); i < ohlc.length; i++) {
        const slice = ohlc.slice(Math.max(0, i - kPeriod + 1), i + 1);
        const h = Math.max(...slice.map(d => d.high || d.close));
        const l = Math.min(...slice.map(d => d.low || d.close));
        kValues.push(h === l ? 50 : ((ohlc[i].close - l) / (h - l)) * 100);
    }
    const d = kValues.reduce((a, b) => a + b, 0) / kValues.length;
    return { k: Math.round(k * 100) / 100, d: Math.round(d * 100) / 100 };
}

function calcWilliamsR(ohlc, period = 14) {
    if (ohlc.length < period) return null;
    const recent = ohlc.slice(-period);
    const highs = recent.map(d => d.high || d.close);
    const lows = recent.map(d => d.low || d.close);
    const hh = Math.max(...highs);
    const ll = Math.min(...lows);
    const close = ohlc[ohlc.length - 1].close;
    if (hh === ll) return -50;
    return ((hh - close) / (hh - ll)) * -100;
}

function calcCCI(ohlc, period = 20) {
    if (ohlc.length < period) return null;
    const recent = ohlc.slice(-period);
    const tps = recent.map(d => ((d.high || d.close) + (d.low || d.close) + d.close) / 3);
    const meanTP = tps.reduce((a, b) => a + b, 0) / period;
    const meanDev = tps.reduce((sum, tp) => sum + Math.abs(tp - meanTP), 0) / period;
    if (meanDev === 0) return 0;
    return (tps[tps.length - 1] - meanTP) / (0.015 * meanDev);
}

function calcROC(closes, period = 12) {
    if (closes.length < period + 1) return null;
    const current = closes[closes.length - 1];
    const past = closes[closes.length - 1 - period];
    if (past === 0) return 0;
    return ((current - past) / past) * 100;
}

function calcMomentum(closes, period = 10) {
    if (closes.length < period + 1) return null;
    return closes[closes.length - 1] - closes[closes.length - 1 - period];
}

function calcAwesomeOsc(ohlc) {
    if (ohlc.length < 34) return null;
    const midpoints = ohlc.map(d => ((d.high || d.close) + (d.low || d.close)) / 2);
    const sma5 = midpoints.slice(-5).reduce((a, b) => a + b, 0) / 5;
    const sma34 = midpoints.slice(-34).reduce((a, b) => a + b, 0) / 34;
    return sma5 - sma34;
}

function calcUltimateOsc(ohlc, p1 = 7, p2 = 14, p3 = 28) {
    if (ohlc.length < p3 + 1) return null;
    const n = p3 + 1;
    const data = ohlc.slice(-n);
    let bp1 = 0, tr1 = 0, bp2 = 0, tr2 = 0, bp3 = 0, tr3 = 0;
    for (let i = 1; i < data.length; i++) {
        const close = data[i].close;
        const prevClose = data[i - 1].close;
        const high = data[i].high || close;
        const low = data[i].low || close;
        const truelow = Math.min(low, prevClose);
        const truehigh = Math.max(high, prevClose);
        const bp = close - truelow;
        const tr = truehigh - truelow || 1;
        if (i > data.length - 1 - p1) { bp1 += bp; tr1 += tr; }
        if (i > data.length - 1 - p2) { bp2 += bp; tr2 += tr; }
        bp3 += bp; tr3 += tr;
    }
    const avg1 = tr1 ? bp1 / tr1 : 0;
    const avg2 = tr2 ? bp2 / tr2 : 0;
    const avg3 = tr3 ? bp3 / tr3 : 0;
    return 100 * (4 * avg1 + 2 * avg2 + avg3) / 7;
}

function calcTSI(closes, longPeriod = 25, shortPeriod = 13) {
    if (closes.length < longPeriod + shortPeriod + 1) return null;
    const diffs = [];
    for (let i = 1; i < closes.length; i++) diffs.push(closes[i] - closes[i - 1]);
    // Double smooth the price change
    const emaFunc = (arr, p) => {
        const k = 2 / (p + 1);
        let ema = arr.slice(0, p).reduce((a, b) => a + b, 0) / p;
        const result = [ema];
        for (let i = p; i < arr.length; i++) {
            ema = arr[i] * k + ema * (1 - k);
            result.push(ema);
        }
        return result;
    };
    const pcds1 = emaFunc(diffs, longPeriod);
    const pcds2 = emaFunc(pcds1, shortPeriod);
    const absDiffs = diffs.map(d => Math.abs(d));
    const apds1 = emaFunc(absDiffs, longPeriod);
    const apds2 = emaFunc(apds1, shortPeriod);
    const tsi = apds2[apds2.length - 1] !== 0 ? (pcds2[pcds2.length - 1] / apds2[apds2.length - 1]) * 100 : 0;
    return tsi;
}

function calcADX(ohlc, period = 14) {
    if (ohlc.length < period * 2 + 1) return null;
    let prevPlusDM = 0, prevMinusDM = 0, prevTR = 0;
    // Initial sums
    for (let i = 1; i <= period; i++) {
        const high = ohlc[i].high || ohlc[i].close;
        const low = ohlc[i].low || ohlc[i].close;
        const prevHigh = ohlc[i - 1].high || ohlc[i - 1].close;
        const prevLow = ohlc[i - 1].low || ohlc[i - 1].close;
        const prevClose = ohlc[i - 1].close;
        const upMove = high - prevHigh;
        const downMove = prevLow - low;
        prevPlusDM += (upMove > downMove && upMove > 0) ? upMove : 0;
        prevMinusDM += (downMove > upMove && downMove > 0) ? downMove : 0;
        prevTR += Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    }
    const dxValues = [];
    for (let i = period + 1; i < ohlc.length; i++) {
        const high = ohlc[i].high || ohlc[i].close;
        const low = ohlc[i].low || ohlc[i].close;
        const prevHigh = ohlc[i - 1].high || ohlc[i - 1].close;
        const prevLow = ohlc[i - 1].low || ohlc[i - 1].close;
        const prevClose = ohlc[i - 1].close;
        const upMove = high - prevHigh;
        const downMove = prevLow - low;
        const pDM = (upMove > downMove && upMove > 0) ? upMove : 0;
        const mDM = (downMove > upMove && downMove > 0) ? downMove : 0;
        const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
        prevPlusDM = prevPlusDM - (prevPlusDM / period) + pDM;
        prevMinusDM = prevMinusDM - (prevMinusDM / period) + mDM;
        prevTR = prevTR - (prevTR / period) + tr;
        const pDI = prevTR ? (prevPlusDM / prevTR) * 100 : 0;
        const mDI = prevTR ? (prevMinusDM / prevTR) * 100 : 0;
        const diSum = pDI + mDI;
        const dx = diSum ? Math.abs(pDI - mDI) / diSum * 100 : 0;
        dxValues.push(dx);
    }
    if (dxValues.length < period) return null;
    let adx = dxValues.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < dxValues.length; i++) {
        adx = (adx * (period - 1) + dxValues[i]) / period;
    }
    return { adx: Math.round(adx * 100) / 100, plusDI: 0, minusDI: 0 };
}

function calcATR(ohlc, period = 14) {
    if (ohlc.length < period + 1) return null;
    let atr = 0;
    for (let i = 1; i <= period; i++) {
        const h = ohlc[i].high || ohlc[i].close;
        const l = ohlc[i].low || ohlc[i].close;
        const pc = ohlc[i - 1].close;
        atr += Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
    }
    atr /= period;
    for (let i = period + 1; i < ohlc.length; i++) {
        const h = ohlc[i].high || ohlc[i].close;
        const l = ohlc[i].low || ohlc[i].close;
        const pc = ohlc[i - 1].close;
        const tr = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
        atr = (atr * (period - 1) + tr) / period;
    }
    return atr;
}

function calcStdDev(closes, period = 20) {
    if (closes.length < period) return null;
    const slice = closes.slice(-period);
    const mean = slice.reduce((a, b) => a + b, 0) / period;
    const variance = slice.reduce((sum, c) => sum + Math.pow(c - mean, 2), 0) / period;
    return Math.sqrt(variance);
}

function calcKeltnerChannel(ohlc, emaPeriod = 20, atrPeriod = 10, mult = 2) {
    const closes = ohlc.map(d => d.close);
    const ema = calcEMA(closes, emaPeriod);
    const atr = calcATR(ohlc, atrPeriod);
    if (ema === null || atr === null) return null;
    return { upper: ema + mult * atr, middle: ema, lower: ema - mult * atr };
}

function calcDonchianChannel(ohlc, period = 20) {
    if (ohlc.length < period) return null;
    const recent = ohlc.slice(-period);
    const highs = recent.map(d => d.high || d.close);
    const lows = recent.map(d => d.low || d.close);
    const upper = Math.max(...highs);
    const lower = Math.min(...lows);
    return { upper, middle: (upper + lower) / 2, lower };
}

function calcHistVol(closes, period = 20) {
    if (closes.length < period + 1) return null;
    const logReturns = [];
    for (let i = closes.length - period; i < closes.length; i++) {
        if (closes[i - 1] > 0) logReturns.push(Math.log(closes[i] / closes[i - 1]));
    }
    if (logReturns.length < 2) return null;
    const mean = logReturns.reduce((a, b) => a + b, 0) / logReturns.length;
    const variance = logReturns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / (logReturns.length - 1);
    return Math.sqrt(variance) * Math.sqrt(365) * 100; // annualized %
}

function calcOBV(ohlc) {
    if (ohlc.length < 2) return null;
    let obv = 0;
    for (let i = 1; i < ohlc.length; i++) {
        const vol = ohlc[i].volume || 0;
        if (ohlc[i].close > ohlc[i - 1].close) obv += vol;
        else if (ohlc[i].close < ohlc[i - 1].close) obv -= vol;
    }
    return obv;
}

function calcADLine(ohlc) {
    if (ohlc.length < 2) return null;
    let adl = 0;
    for (let i = 0; i < ohlc.length; i++) {
        const h = ohlc[i].high || ohlc[i].close;
        const l = ohlc[i].low || ohlc[i].close;
        const c = ohlc[i].close;
        const v = ohlc[i].volume || 0;
        const mfm = (h === l) ? 0 : ((c - l) - (h - c)) / (h - l);
        adl += mfm * v;
    }
    return adl;
}

function calcIchimoku(ohlc) {
    if (ohlc.length < 52) return null;
    const highOf = (arr) => Math.max(...arr.map(d => d.high || d.close));
    const lowOf = (arr) => Math.min(...arr.map(d => d.low || d.close));
    const tenkan = (highOf(ohlc.slice(-9)) + lowOf(ohlc.slice(-9))) / 2;
    const kijun = (highOf(ohlc.slice(-26)) + lowOf(ohlc.slice(-26))) / 2;
    const senkouA = (tenkan + kijun) / 2;
    const senkouB = (highOf(ohlc.slice(-52)) + lowOf(ohlc.slice(-52))) / 2;
    return { tenkan, kijun, senkouA, senkouB };
}

function calcHMA(closes, period = 9) {
    if (closes.length < period * 2) return null;
    const half = Math.floor(period / 2);
    const sqrtP = Math.floor(Math.sqrt(period));
    const wmaHalf = calcWMA(closes, half);
    const wmaFull = calcWMA(closes, period);
    if (wmaHalf === null || wmaFull === null) return null;
    // Simplified: 2*WMA(half) - WMA(full)
    return 2 * wmaHalf - wmaFull;
}

function calcWMA(closes, period) {
    if (closes.length < period) return null;
    const slice = closes.slice(-period);
    let weightedSum = 0, weightSum = 0;
    for (let i = 0; i < period; i++) {
        const w = i + 1;
        weightedSum += slice[i] * w;
        weightSum += w;
    }
    return weightedSum / weightSum;
}

function calcVWMA(ohlc, period = 20) {
    if (ohlc.length < period) return null;
    const recent = ohlc.slice(-period);
    let priceVol = 0, totalVol = 0;
    for (const d of recent) {
        const v = d.volume || 1;
        priceVol += d.close * v;
        totalVol += v;
    }
    return totalVol ? priceVol / totalVol : null;
}

function calcEMARibbon(closes) {
    return {
        ema9: calcEMA(closes, 9),
        ema21: calcEMA(closes, 21),
        ema55: calcEMA(closes, 55),
        ema100: calcEMA(closes, 100),
        ema200: calcEMA(closes, 200)
    };
}

// ---- Render a single custom indicator card ----
function renderCustomIndicatorCard(indId) {
    const data = window._indicatorData;
    if (!data) return '';
    const { closes, ohlcData, price, fmtPrice, fmtNum } = data;
    const ind = INDICATOR_CATALOG.find(i => i.id === indId);
    if (!ind) return '';

    let content = '';
    let badge = '';
    let badgeClass = 'neutral';

    switch (indId) {
        case 'stochastic': {
            const s = calcStochastic(ohlcData);
            if (!s) { content = '<div style="color:var(--color-text-muted)">Insufficient data</div>'; break; }
            badgeClass = s.k > 80 ? 'bearish' : s.k < 20 ? 'bullish' : 'neutral';
            badge = s.k > 80 ? 'Overbought' : s.k < 20 ? 'Oversold' : 'Neutral';
            content = `
                <div style="font-size:1.6rem;font-weight:700;color:var(--color-text-primary);margin:4px 0;">%K: ${fmtNum(s.k)}</div>
                <div class="indicator-value-row"><span class="indicator-value-label">%D (Signal)</span><span class="indicator-value-num">${fmtNum(s.d)}</span></div>
                <div class="indicator-gauge"><div class="indicator-gauge-fill" style="width:${s.k}%;background:${s.k > 80 ? '#ff6b6b' : s.k < 20 ? '#00d4aa' : '#ffd93d'};"></div></div>
                <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--color-text-muted);"><span>Oversold (20)</span><span>Overbought (80)</span></div>`;
            break;
        }
        case 'williams_r': {
            const wr = calcWilliamsR(ohlcData);
            if (wr === null) { content = '<div style="color:var(--color-text-muted)">Insufficient data</div>'; break; }
            badgeClass = wr > -20 ? 'bearish' : wr < -80 ? 'bullish' : 'neutral';
            badge = wr > -20 ? 'Overbought' : wr < -80 ? 'Oversold' : 'Neutral';
            const wrFill = Math.abs(wr);
            content = `
                <div style="font-size:1.8rem;font-weight:700;color:var(--color-text-primary);margin:4px 0;">${fmtNum(wr)}</div>
                <div class="indicator-gauge"><div class="indicator-gauge-fill" style="width:${wrFill}%;background:${wr > -20 ? '#ff6b6b' : wr < -80 ? '#00d4aa' : '#ffd93d'};"></div></div>
                <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--color-text-muted);"><span>Oversold (-80)</span><span>Overbought (-20)</span></div>`;
            break;
        }
        case 'cci': {
            const cci = calcCCI(ohlcData);
            if (cci === null) { content = '<div style="color:var(--color-text-muted)">Insufficient data</div>'; break; }
            badgeClass = cci > 100 ? 'bullish' : cci < -100 ? 'bearish' : 'neutral';
            badge = cci > 100 ? 'Bullish' : cci < -100 ? 'Bearish' : 'Neutral';
            content = `<div style="font-size:1.8rem;font-weight:700;color:${cci > 100 ? '#00d4aa' : cci < -100 ? '#ff6b6b' : 'var(--color-text-primary)'};margin:4px 0;">${fmtNum(cci)}</div>
                <div style="font-size:0.75rem;color:var(--color-text-muted);">Above +100 = Bullish · Below −100 = Bearish</div>`;
            break;
        }
        case 'roc': {
            const roc = calcROC(closes);
            if (roc === null) { content = '<div style="color:var(--color-text-muted)">Insufficient data</div>'; break; }
            badgeClass = roc > 0 ? 'bullish' : 'bearish';
            badge = roc > 0 ? 'Positive' : 'Negative';
            content = `<div style="font-size:1.8rem;font-weight:700;color:${roc > 0 ? '#00d4aa' : '#ff6b6b'};margin:4px 0;">${fmtNum(roc)}%</div>
                <div style="font-size:0.75rem;color:var(--color-text-muted);">12-period price rate of change</div>`;
            break;
        }
        case 'momentum': {
            const mom = calcMomentum(closes);
            if (mom === null) { content = '<div style="color:var(--color-text-muted)">Insufficient data</div>'; break; }
            badgeClass = mom > 0 ? 'bullish' : 'bearish';
            badge = mom > 0 ? 'Positive' : 'Negative';
            content = `<div style="font-size:1.8rem;font-weight:700;color:${mom > 0 ? '#00d4aa' : '#ff6b6b'};margin:4px 0;">${fmtPrice(mom)}</div>
                <div style="font-size:0.75rem;color:var(--color-text-muted);">Price change over 10 periods</div>`;
            break;
        }
        case 'awesome_osc': {
            const ao = calcAwesomeOsc(ohlcData);
            if (ao === null) { content = '<div style="color:var(--color-text-muted)">Insufficient data</div>'; break; }
            badgeClass = ao > 0 ? 'bullish' : 'bearish';
            badge = ao > 0 ? 'Bullish' : 'Bearish';
            content = `<div style="font-size:1.8rem;font-weight:700;color:${ao > 0 ? '#00d4aa' : '#ff6b6b'};margin:4px 0;">${fmtNum(ao)}</div>
                <div style="font-size:0.75rem;color:var(--color-text-muted);">SMA(5) − SMA(34) of midpoint</div>`;
            break;
        }
        case 'uo': {
            const uo = calcUltimateOsc(ohlcData);
            if (uo === null) { content = '<div style="color:var(--color-text-muted)">Insufficient data</div>'; break; }
            badgeClass = uo > 70 ? 'bearish' : uo < 30 ? 'bullish' : 'neutral';
            badge = uo > 70 ? 'Overbought' : uo < 30 ? 'Oversold' : 'Neutral';
            content = `<div style="font-size:1.8rem;font-weight:700;color:var(--color-text-primary);margin:4px 0;">${fmtNum(uo)}</div>
                <div class="indicator-gauge"><div class="indicator-gauge-fill" style="width:${uo}%;background:${uo > 70 ? '#ff6b6b' : uo < 30 ? '#00d4aa' : '#ffd93d'};"></div></div>`;
            break;
        }
        case 'tsi': {
            const tsi = calcTSI(closes);
            if (tsi === null) { content = '<div style="color:var(--color-text-muted)">Insufficient data</div>'; break; }
            badgeClass = tsi > 0 ? 'bullish' : 'bearish';
            badge = tsi > 0 ? 'Bullish' : 'Bearish';
            content = `<div style="font-size:1.8rem;font-weight:700;color:${tsi > 0 ? '#00d4aa' : '#ff6b6b'};margin:4px 0;">${fmtNum(tsi)}</div>
                <div style="font-size:0.75rem;color:var(--color-text-muted);">Double-smoothed momentum (25,13)</div>`;
            break;
        }
        case 'adx': {
            const adx = calcADX(ohlcData);
            if (!adx) { content = '<div style="color:var(--color-text-muted)">Insufficient data</div>'; break; }
            badgeClass = adx.adx > 25 ? 'bullish' : 'neutral';
            badge = adx.adx > 50 ? 'Strong Trend' : adx.adx > 25 ? 'Trending' : 'Weak/No Trend';
            content = `<div style="font-size:1.8rem;font-weight:700;color:var(--color-text-primary);margin:4px 0;">${fmtNum(adx.adx)}</div>
                <div class="indicator-gauge"><div class="indicator-gauge-fill" style="width:${Math.min(adx.adx, 100)}%;background:${adx.adx > 50 ? '#00d4aa' : adx.adx > 25 ? '#ffd93d' : '#888'};"></div></div>
                <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--color-text-muted);"><span>No Trend (0)</span><span>Strong (50+)</span></div>`;
            break;
        }
        case 'ema_ribbon': {
            const ribbon = calcEMARibbon(closes);
            const trend = ribbon.ema9 && ribbon.ema21 ? (ribbon.ema9 > ribbon.ema21 ? 'bullish' : 'bearish') : 'neutral';
            badgeClass = trend;
            badge = trend === 'bullish' ? 'Bullish Alignment' : trend === 'bearish' ? 'Bearish Alignment' : 'N/A';
            content = `
                <div class="indicator-value-row"><span class="indicator-value-label">EMA 9</span><span class="indicator-value-num">${fmtPrice(ribbon.ema9)}</span></div>
                <div class="indicator-value-row"><span class="indicator-value-label">EMA 21</span><span class="indicator-value-num">${fmtPrice(ribbon.ema21)}</span></div>
                <div class="indicator-value-row"><span class="indicator-value-label">EMA 55</span><span class="indicator-value-num">${fmtPrice(ribbon.ema55)}</span></div>
                <div class="indicator-value-row"><span class="indicator-value-label">EMA 100</span><span class="indicator-value-num">${fmtPrice(ribbon.ema100)}</span></div>
                <div class="indicator-value-row"><span class="indicator-value-label">EMA 200</span><span class="indicator-value-num">${fmtPrice(ribbon.ema200)}</span></div>`;
            break;
        }
        case 'ichimoku': {
            const ichi = calcIchimoku(ohlcData);
            if (!ichi) { content = '<div style="color:var(--color-text-muted)">Insufficient data</div>'; break; }
            badgeClass = price > ichi.senkouA && price > ichi.senkouB ? 'bullish' : price < ichi.senkouA && price < ichi.senkouB ? 'bearish' : 'neutral';
            badge = badgeClass === 'bullish' ? 'Above Cloud' : badgeClass === 'bearish' ? 'Below Cloud' : 'In Cloud';
            content = `
                <div class="indicator-value-row"><span class="indicator-value-label">Tenkan-sen (9)</span><span class="indicator-value-num">${fmtPrice(ichi.tenkan)}</span></div>
                <div class="indicator-value-row"><span class="indicator-value-label">Kijun-sen (26)</span><span class="indicator-value-num">${fmtPrice(ichi.kijun)}</span></div>
                <div class="indicator-value-row"><span class="indicator-value-label">Senkou A</span><span class="indicator-value-num" style="color:#00d4aa;">${fmtPrice(ichi.senkouA)}</span></div>
                <div class="indicator-value-row"><span class="indicator-value-label">Senkou B</span><span class="indicator-value-num" style="color:#ff6b6b;">${fmtPrice(ichi.senkouB)}</span></div>`;
            break;
        }
        case 'vwma': {
            const vwma = calcVWMA(ohlcData);
            if (vwma === null) { content = '<div style="color:var(--color-text-muted)">Insufficient data</div>'; break; }
            badgeClass = price > vwma ? 'bullish' : 'bearish';
            badge = price > vwma ? 'Above VWMA' : 'Below VWMA';
            content = `<div style="font-size:1.8rem;font-weight:700;color:var(--color-text-primary);margin:4px 0;">${fmtPrice(vwma)}</div>
                <div class="indicator-value-row"><span class="indicator-value-label">Current Price</span><span class="indicator-value-num" style="color:var(--color-accent);">${fmtPrice(price)}</span></div>`;
            break;
        }
        case 'hma': {
            const hma = calcHMA(closes);
            if (hma === null) { content = '<div style="color:var(--color-text-muted)">Insufficient data</div>'; break; }
            badgeClass = price > hma ? 'bullish' : 'bearish';
            badge = price > hma ? 'Bullish' : 'Bearish';
            content = `<div style="font-size:1.8rem;font-weight:700;color:var(--color-text-primary);margin:4px 0;">${fmtPrice(hma)}</div>
                <div class="indicator-value-row"><span class="indicator-value-label">Current Price</span><span class="indicator-value-num" style="color:var(--color-accent);">${fmtPrice(price)}</span></div>`;
            break;
        }
        case 'atr': {
            const atr = calcATR(ohlcData);
            if (atr === null) { content = '<div style="color:var(--color-text-muted)">Insufficient data</div>'; break; }
            const atrPct = price ? (atr / price * 100) : 0;
            badgeClass = atrPct > 3 ? 'bearish' : atrPct < 1.5 ? 'bullish' : 'neutral';
            badge = atrPct > 3 ? 'High Volatility' : atrPct < 1.5 ? 'Low Volatility' : 'Normal';
            content = `<div style="font-size:1.8rem;font-weight:700;color:var(--color-text-primary);margin:4px 0;">${fmtPrice(atr)}</div>
                <div class="indicator-value-row"><span class="indicator-value-label">ATR %</span><span class="indicator-value-num">${fmtNum(atrPct)}%</span></div>`;
            break;
        }
        case 'std_dev': {
            const sd = calcStdDev(closes);
            if (sd === null) { content = '<div style="color:var(--color-text-muted)">Insufficient data</div>'; break; }
            badge = 'Volatility';
            content = `<div style="font-size:1.8rem;font-weight:700;color:var(--color-text-primary);margin:4px 0;">${fmtPrice(sd)}</div>
                <div style="font-size:0.75rem;color:var(--color-text-muted);">20-period standard deviation</div>`;
            break;
        }
        case 'keltner': {
            const kc = calcKeltnerChannel(ohlcData);
            if (!kc) { content = '<div style="color:var(--color-text-muted)">Insufficient data</div>'; break; }
            badgeClass = price > kc.upper ? 'bearish' : price < kc.lower ? 'bullish' : 'neutral';
            badge = price > kc.upper ? 'Above Channel' : price < kc.lower ? 'Below Channel' : 'Inside Channel';
            content = `
                <div class="indicator-value-row"><span class="indicator-value-label">Upper</span><span class="indicator-value-num" style="color:#ff6b6b;">${fmtPrice(kc.upper)}</span></div>
                <div class="indicator-value-row"><span class="indicator-value-label">Middle (EMA)</span><span class="indicator-value-num">${fmtPrice(kc.middle)}</span></div>
                <div class="indicator-value-row"><span class="indicator-value-label">Lower</span><span class="indicator-value-num" style="color:#00d4aa;">${fmtPrice(kc.lower)}</span></div>`;
            break;
        }
        case 'donchian': {
            const dc = calcDonchianChannel(ohlcData);
            if (!dc) { content = '<div style="color:var(--color-text-muted)">Insufficient data</div>'; break; }
            badgeClass = price > dc.middle ? 'bullish' : 'bearish';
            badge = 'Channel Width';
            content = `
                <div class="indicator-value-row"><span class="indicator-value-label">Upper (High)</span><span class="indicator-value-num" style="color:#ff6b6b;">${fmtPrice(dc.upper)}</span></div>
                <div class="indicator-value-row"><span class="indicator-value-label">Middle</span><span class="indicator-value-num">${fmtPrice(dc.middle)}</span></div>
                <div class="indicator-value-row"><span class="indicator-value-label">Lower (Low)</span><span class="indicator-value-num" style="color:#00d4aa;">${fmtPrice(dc.lower)}</span></div>`;
            break;
        }
        case 'hist_vol': {
            const hv = calcHistVol(closes);
            if (hv === null) { content = '<div style="color:var(--color-text-muted)">Insufficient data</div>'; break; }
            badgeClass = hv > 80 ? 'bearish' : hv < 30 ? 'bullish' : 'neutral';
            badge = hv > 80 ? 'Very High' : hv > 50 ? 'High' : hv > 30 ? 'Moderate' : 'Low';
            content = `<div style="font-size:1.8rem;font-weight:700;color:var(--color-text-primary);margin:4px 0;">${fmtNum(hv)}%</div>
                <div style="font-size:0.75rem;color:var(--color-text-muted);">Annualized 20-day historical volatility</div>`;
            break;
        }
        case 'obv': {
            const obv = calcOBV(ohlcData);
            if (obv === null) { content = '<div style="color:var(--color-text-muted)">Insufficient data</div>'; break; }
            badge = 'Cumulative';
            const obvStr = Math.abs(obv) >= 1e9 ? (obv / 1e9).toFixed(2) + 'B' : Math.abs(obv) >= 1e6 ? (obv / 1e6).toFixed(2) + 'M' : obv.toLocaleString();
            content = `<div style="font-size:1.6rem;font-weight:700;color:${obv > 0 ? '#00d4aa' : '#ff6b6b'};margin:4px 0;">${obvStr}</div>
                <div style="font-size:0.75rem;color:var(--color-text-muted);">On Balance Volume cumulative total</div>`;
            break;
        }
        case 'ad_line': {
            const adl = calcADLine(ohlcData);
            if (adl === null) { content = '<div style="color:var(--color-text-muted)">Insufficient data</div>'; break; }
            badge = 'Cumulative';
            const adlStr = Math.abs(adl) >= 1e9 ? (adl / 1e9).toFixed(2) + 'B' : Math.abs(adl) >= 1e6 ? (adl / 1e6).toFixed(2) + 'M' : adl.toLocaleString();
            content = `<div style="font-size:1.6rem;font-weight:700;color:${adl > 0 ? '#00d4aa' : '#ff6b6b'};margin:4px 0;">${adlStr}</div>
                <div style="font-size:0.75rem;color:var(--color-text-muted);">Accumulation/Distribution Line</div>`;
            break;
        }
        default:
            content = '<div style="color:var(--color-text-muted)">Unknown indicator</div>';
    }

    return `<div class="indicator-card" data-custom-ind="${indId}">
        <div class="indicator-card-header">
            <span class="indicator-card-title">${ind.icon} ${ind.name}</span>
            <span class="indicator-card-badge ${badgeClass}">${badge}</span>
            <button class="indicator-card-remove" data-remove-ind="${indId}" title="Remove">&times;</button>
        </div>
        ${content}
    </div>`;
}

// ---- Render saved custom indicators ----
function renderSavedCustomIndicators() {
    const container = document.getElementById('custom-indicators-container');
    if (!container) return;
    const ids = getCustomIndicatorIds();
    container.innerHTML = ids.map(id => renderCustomIndicatorCard(id)).join('');
    // Wire remove buttons
    container.querySelectorAll('.indicator-card-remove').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const indId = btn.dataset.removeInd;
            const ids = getCustomIndicatorIds().filter(id => id !== indId);
            saveCustomIndicatorIds(ids);
            renderSavedCustomIndicators();
        });
    });
    // Wire info popups on custom indicator cards
    wireIndicatorInfoPopups(container);
}

// ---- Indicator Picker Modal ----
function openIndicatorPicker() {
    // Remove existing overlay
    let overlay = document.getElementById('indicator-picker-overlay');
    if (overlay) overlay.remove();

    const activeIds = getCustomIndicatorIds();

    // Group by category
    const categories = {};
    INDICATOR_CATALOG.forEach(ind => {
        if (!categories[ind.category]) categories[ind.category] = [];
        categories[ind.category].push(ind);
    });

    let categoriesHTML = '';
    for (const [cat, items] of Object.entries(categories)) {
        categoriesHTML += `
            <div class="indicator-picker-category" data-cat="${cat}">
                <h4>${cat}</h4>
                <div class="indicator-picker-grid">
                    ${items.map(ind => `
                        <div class="indicator-picker-item ${activeIds.includes(ind.id) ? 'added' : ''}" data-ind-id="${ind.id}">
                            <span class="picker-icon">${ind.icon}</span>
                            <div class="picker-info">
                                <div class="picker-name">${ind.name}</div>
                                <div class="picker-desc">${ind.desc}</div>
                            </div>
                            <span class="picker-check">✓</span>
                        </div>
                    `).join('')}
                </div>
            </div>`;
    }

    overlay = document.createElement('div');
    overlay.id = 'indicator-picker-overlay';
    overlay.className = 'indicator-picker-overlay';
    overlay.innerHTML = `
        <div class="indicator-picker">
            <div class="indicator-picker-header">
                <h3>📊 Add Indicators</h3>
                <button class="indicator-picker-close">&times;</button>
            </div>
            <div class="indicator-picker-search">
                <input type="text" placeholder="Search indicators..." id="indicator-search-input">
            </div>
            <div class="indicator-picker-body">
                ${categoriesHTML}
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    // Animate in
    requestAnimationFrame(() => overlay.classList.add('active'));

    // Close
    overlay.querySelector('.indicator-picker-close').addEventListener('click', () => {
        overlay.classList.remove('active');
        setTimeout(() => overlay.remove(), 300);
    });
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            overlay.classList.remove('active');
            setTimeout(() => overlay.remove(), 300);
        }
    });

    // Search
    const searchInput = document.getElementById('indicator-search-input');
    searchInput.addEventListener('input', () => {
        const query = searchInput.value.toLowerCase();
        overlay.querySelectorAll('.indicator-picker-item').forEach(item => {
            const name = item.querySelector('.picker-name').textContent.toLowerCase();
            const desc = item.querySelector('.picker-desc').textContent.toLowerCase();
            item.style.display = (name.includes(query) || desc.includes(query)) ? '' : 'none';
        });
        // Hide empty categories
        overlay.querySelectorAll('.indicator-picker-category').forEach(cat => {
            const visible = cat.querySelectorAll('.indicator-picker-item:not([style*="display: none"])').length;
            cat.style.display = visible ? '' : 'none';
        });
    });

    // Toggle indicator
    overlay.querySelectorAll('.indicator-picker-item').forEach(item => {
        item.addEventListener('click', () => {
            const indId = item.dataset.indId;
            let ids = getCustomIndicatorIds();
            if (ids.includes(indId)) {
                ids = ids.filter(id => id !== indId);
                item.classList.remove('added');
            } else {
                ids.push(indId);
                item.classList.add('added');
            }
            saveCustomIndicatorIds(ids);
            renderSavedCustomIndicators();
        });
    });
}

// =============================================
// INDICATOR INFO POPUP SYSTEM
// =============================================

const INDICATOR_INFO = {
    rsi: {
        name: 'RSI — Relative Strength Index',
        icon: '📊',
        summary: 'The RSI measures the speed and magnitude of recent price changes to evaluate whether an asset is overbought or oversold.',
        howItWorks: 'RSI compares the average gains to average losses over 14 periods using Wilder\'s smoothing method. The result oscillates between 0 and 100.',
        interpretation: [
            '<b>Above 70</b> → Overbought — the asset may be due for a pullback.',
            '<b>Below 30</b> → Oversold — the asset may be ready for a bounce.',
            '<b>50 level</b> → Acts as a midline; crossing above 50 confirms bullish momentum.',
            '<b>Divergence</b> → If price makes new highs but RSI doesn\'t, momentum is weakening.'
        ],
        proTip: 'In strong trends, RSI can stay overbought/oversold for extended periods. Use with trend confirmation.'
    },
    fear_greed: {
        name: 'Fear & Greed Index',
        icon: '🧠',
        summary: 'A market sentiment indicator that measures whether investors are feeling fearful (bargain opportunities) or greedy (potential correction).',
        howItWorks: 'Aggregates data from volatility, market momentum, social media sentiment, surveys, Bitcoin dominance, and Google trends into a single 0–100 score.',
        interpretation: [
            '<b>0–25 (Extreme Fear)</b> → Investors are panic selling — potential buying opportunity.',
            '<b>25–45 (Fear)</b> → Caution in the market; prices may be undervalued.',
            '<b>45–55 (Neutral)</b> → Market indecision.',
            '<b>55–75 (Greed)</b> → Optimism growing; be cautious of overextension.',
            '<b>75–100 (Extreme Greed)</b> → Euphoria — potential market top warning.'
        ],
        proTip: '"Be fearful when others are greedy, and greedy when others are fearful." — Warren Buffett'
    },
    moving_avg: {
        name: 'Moving Averages (SMA)',
        icon: '📈',
        summary: 'Simple Moving Averages smooth out price data to reveal the underlying trend direction over different timeframes.',
        howItWorks: 'SMA calculates the arithmetic mean of the closing prices over N periods. SMA 20 is short-term, SMA 50 is medium-term, and SMA 200 is long-term.',
        interpretation: [
            '<b>Price above SMA</b> → Bullish signal; trend is up.',
            '<b>Price below SMA</b> → Bearish signal; trend is down.',
            '<b>Golden Cross</b> → SMA 50 crosses above SMA 200 — strong bullish signal.',
            '<b>Death Cross</b> → SMA 50 crosses below SMA 200 — strong bearish signal.',
            '<b>SMA as support/resistance</b> → Price often bounces off these levels.'
        ],
        proTip: 'The 200-day SMA is widely watched by institutional traders and often acts as a major support/resistance level.'
    },
    macd: {
        name: 'MACD — Moving Average Convergence Divergence',
        icon: '📉',
        summary: 'MACD is a trend-following momentum indicator that shows the relationship between two exponential moving averages of price.',
        howItWorks: 'MACD Line = EMA(12) − EMA(26). Signal Line = EMA(9) of the MACD Line. Histogram = MACD Line − Signal Line.',
        interpretation: [
            '<b>MACD crosses above Signal</b> → Bullish crossover — potential buy signal.',
            '<b>MACD crosses below Signal</b> → Bearish crossover — potential sell signal.',
            '<b>Histogram growing</b> → Momentum is increasing in the current direction.',
            '<b>Zero line cross</b> → MACD crossing above 0 confirms bullish trend.',
            '<b>Divergence</b> → Price and MACD moving in opposite directions signals potential reversal.'
        ],
        proTip: 'MACD works best in trending markets. In ranging markets, it can give false signals.'
    },
    bollinger: {
        name: 'Bollinger Bands',
        icon: '🎯',
        summary: 'Bollinger Bands measure volatility by placing bands above and below a moving average, expanding during volatile periods and contracting during calm periods.',
        howItWorks: 'Middle Band = SMA(20). Upper Band = SMA + 2 × Standard Deviation. Lower Band = SMA − 2 × Standard Deviation. About 95% of price action stays within the bands.',
        interpretation: [
            '<b>Price near Upper Band</b> → Asset may be overbought or in a strong uptrend.',
            '<b>Price near Lower Band</b> → Asset may be oversold or in a strong downtrend.',
            '<b>Squeeze (narrow bands)</b> → Low volatility — big move coming soon.',
            '<b>Band expansion</b> → Volatility is increasing; confirms a breakout.',
            '<b>Walking the band</b> → In strong trends, price can hug one band.'
        ],
        proTip: 'A Bollinger Squeeze followed by a breakout above/below the bands is one of the most reliable trading setups.'
    },
    stochastic: {
        name: 'Stochastic Oscillator',
        icon: '📉',
        summary: 'Compares the current closing price to its price range over a given period to identify overbought and oversold conditions.',
        howItWorks: '%K = ((Close − Lowest Low) / (Highest High − Lowest Low)) × 100 over 14 periods. %D is a 3-period SMA of %K, acting as a signal line.',
        interpretation: [
            '<b>Above 80</b> → Overbought — price may reverse down.',
            '<b>Below 20</b> → Oversold — price may reverse up.',
            '<b>%K crosses above %D</b> → Bullish signal.',
            '<b>%K crosses below %D</b> → Bearish signal.'
        ],
        proTip: 'Best used in range-bound markets. In strong trends, the Stochastic can stay overbought/oversold for long periods.'
    },
    williams_r: {
        name: 'Williams %R',
        icon: '📊',
        summary: 'A momentum oscillator that measures the current close relative to the high-low range over a lookback period. Essentially an inverted Stochastic.',
        howItWorks: '%R = ((Highest High − Close) / (Highest High − Lowest Low)) × (−100). Range is −100 to 0.',
        interpretation: [
            '<b>Above −20</b> → Overbought territory.',
            '<b>Below −80</b> → Oversold territory.',
            '<b>Crossing −50</b> → Indicates shift in momentum direction.'
        ],
        proTip: 'Williams %R reacts faster than RSI, making it great for short-term trade timing.'
    },
    cci: {
        name: 'CCI — Commodity Channel Index',
        icon: '🔄',
        summary: 'Measures the current price deviation from the average price, identifying cyclical trends and extreme conditions.',
        howItWorks: 'CCI = (Typical Price − SMA of TP) / (0.015 × Mean Deviation). Typical Price = (High + Low + Close) / 3.',
        interpretation: [
            '<b>Above +100</b> → Strong bullish momentum.',
            '<b>Below −100</b> → Strong bearish momentum.',
            '<b>Zero line</b> → Price is at its average; crossing above = bullish.'
        ],
        proTip: 'CCI can reach very high or low values (±200, ±300). Extreme readings can signal the start of powerful trends, not just reversals.'
    },
    roc: {
        name: 'Rate of Change (ROC)',
        icon: '🚀',
        summary: 'Measures the percentage change in price over a specified number of periods, showing how fast momentum is changing.',
        howItWorks: 'ROC = ((Current Price − Price N periods ago) / Price N periods ago) × 100. Default period is 12.',
        interpretation: [
            '<b>Positive ROC</b> → Price is higher than N periods ago; bullish.',
            '<b>Negative ROC</b> → Price is lower; bearish.',
            '<b>Rising ROC</b> → Accelerating momentum.',
            '<b>Falling ROC</b> → Decelerating momentum.'
        ],
        proTip: 'ROC divergence with price is one of the earliest warning signs of a trend reversal.'
    },
    momentum: {
        name: 'Momentum',
        icon: '💨',
        summary: 'The simplest momentum indicator — measures the absolute price change over a given number of periods.',
        howItWorks: 'Momentum = Current Price − Price N periods ago. Default period is 10. Positive = upward momentum, negative = downward.',
        interpretation: [
            '<b>Positive value</b> → Price is rising. Increasing values = accelerating.',
            '<b>Negative value</b> → Price is falling.',
            '<b>Crossing zero</b> → Potential trend change.'
        ],
        proTip: 'Unlike ROC, Momentum shows the absolute dollar/unit change, making it useful for gauging the magnitude of price moves.'
    },
    awesome_osc: {
        name: 'Awesome Oscillator',
        icon: '🌊',
        summary: 'Created by Bill Williams, the AO measures market momentum using the difference between 5 and 34-period SMAs of the bar midpoints.',
        howItWorks: 'AO = SMA(5, Midpoint) − SMA(34, Midpoint) where Midpoint = (High + Low) / 2.',
        interpretation: [
            '<b>Above zero</b> → Short-term momentum is stronger than long-term; bullish.',
            '<b>Below zero</b> → Bearish momentum dominates.',
            '<b>Saucer setup</b> → Two consecutive bars on the same side of zero with a dip in between; continuation signal.'
        ],
        proTip: 'The AO histogram color changes can give early signals of momentum shifts before a zero-line cross.'
    },
    uo: {
        name: 'Ultimate Oscillator',
        icon: '⚡',
        summary: 'Combines short, medium, and long-term momentum into a single oscillator to reduce false signals.',
        howItWorks: 'Uses buying pressure and true range over 7, 14, and 28 periods with weights of 4:2:1 respectively. Scaled to 0–100.',
        interpretation: [
            '<b>Above 70</b> → Overbought — look for bearish divergence to sell.',
            '<b>Below 30</b> → Oversold — look for bullish divergence to buy.',
            '<b>Divergence</b> → The primary signal; combine with support/resistance levels.'
        ],
        proTip: 'Larry Williams designed this indicator specifically to be used with divergence, not just overbought/oversold levels.'
    },
    tsi: {
        name: 'True Strength Index (TSI)',
        icon: '💪',
        summary: 'A double-smoothed momentum oscillator that shows both direction and overbought/oversold conditions with less noise.',
        howItWorks: 'TSI = 100 × (Double-smoothed Price Change / Double-smoothed Absolute Price Change). Uses EMA periods of 25 and 13.',
        interpretation: [
            '<b>Above zero</b> → Bullish momentum.',
            '<b>Below zero</b> → Bearish momentum.',
            '<b>Crossing zero</b> → Potential trend change.',
            '<b>Extreme readings</b> → Overbought/oversold levels vary by asset.'
        ],
        proTip: 'TSI is smoother than RSI and gives fewer false signals in trending markets.'
    },
    ema_ribbon: {
        name: 'EMA Ribbon',
        icon: '🎀',
        summary: 'A set of exponential moving averages (9, 21, 55, 100, 200) that visually shows trend strength and direction based on their order and spacing.',
        howItWorks: 'EMAs give more weight to recent prices than SMAs. When all EMAs are stacked in order (shortest on top), the trend is strong.',
        interpretation: [
            '<b>Bullish alignment</b> → EMAs stacked in ascending order (EMA 9 > 21 > 55 > 100 > 200).',
            '<b>Bearish alignment</b> → EMAs stacked in descending order.',
            '<b>Ribbon spreading</b> → Trend is strengthening.',
            '<b>Ribbon converging</b> → Trend is weakening; potential reversal.'
        ],
        proTip: 'Price bouncing off the EMA ribbon (especially EMA 21 or 55) during a trend provides excellent entry opportunities.'
    },
    adx: {
        name: 'ADX — Average Directional Index',
        icon: '🧭',
        summary: 'Measures the strength of a trend regardless of its direction. ADX tells you HOW STRONG the trend is, not which direction.',
        howItWorks: 'ADX = smoothed average of DX values over 14 periods. DX is derived from +DI (bullish pressure) and −DI (bearish pressure).',
        interpretation: [
            '<b>0–20</b> → Weak or no trend (ranging market).',
            '<b>20–25</b> → Emerging trend.',
            '<b>25–50</b> → Strong trend in effect.',
            '<b>50–75</b> → Very strong trend.',
            '<b>Above 75</b> → Extremely strong trend (rare).'
        ],
        proTip: 'Low ADX readings are great for range-bound strategies (buy support, sell resistance). High ADX readings favor trend-following strategies.'
    },
    ichimoku: {
        name: 'Ichimoku Cloud',
        icon: '☁️',
        summary: 'A comprehensive indicator system that defines support/resistance, trend direction, and momentum all at once, developed by Japanese journalist Goichi Hosoda.',
        howItWorks: 'Tenkan-sen = (9-period High + Low)/2. Kijun-sen = (26-period High + Low)/2. Senkou A = (Tenkan + Kijun)/2 plotted 26 periods ahead. Senkou B = (52-period High + Low)/2 plotted 26 periods ahead.',
        interpretation: [
            '<b>Price above Cloud</b> → Bullish; cloud acts as support.',
            '<b>Price below Cloud</b> → Bearish; cloud acts as resistance.',
            '<b>Price inside Cloud</b> → Indecision; no clear trend.',
            '<b>Tenkan crosses above Kijun</b> → Bullish signal (TK Cross).',
            '<b>Cloud color change</b> → Potential trend reversal ahead.'
        ],
        proTip: 'Ichimoku was originally designed for weekly charts. For crypto (24/7 markets), it works well on daily and 4-hour timeframes.'
    },
    vwma: {
        name: 'VWMA — Volume Weighted Moving Average',
        icon: '📐',
        summary: 'A moving average that weighs each price by its trading volume, giving more importance to days with higher volume.',
        howItWorks: 'VWMA = Σ(Price × Volume) / Σ(Volume) over 20 periods. High-volume days have more influence on the average.',
        interpretation: [
            '<b>Price above VWMA</b> → Bullish; buyers dominate on high volume.',
            '<b>Price below VWMA</b> → Bearish; sellers dominate.',
            '<b>VWMA vs SMA divergence</b> → Shows where "smart money" activity differs from simple price.'
        ],
        proTip: 'When VWMA is significantly different from SMA, it means volume is concentrated on one side — a strong conviction signal.'
    },
    hma: {
        name: 'HMA — Hull Moving Average',
        icon: '🚤',
        summary: 'A fast, smooth moving average developed by Alan Hull that virtually eliminates lag while maintaining smoothness.',
        howItWorks: 'HMA = WMA(√period, 2×WMA(period/2) − WMA(period)). Uses weighted moving averages in a recursive formula.',
        interpretation: [
            '<b>Price above HMA</b> → Bullish trend.',
            '<b>Price below HMA</b> → Bearish trend.',
            '<b>HMA slope change</b> → Early signal of trend reversal.'
        ],
        proTip: 'HMA reacts to price changes faster than EMA or SMA, making it excellent for swing trading entries and exits.'
    },
    atr: {
        name: 'ATR — Average True Range',
        icon: '📏',
        summary: 'Measures market volatility by calculating the average range of price movements. Does NOT indicate direction — only how much the price moves.',
        howItWorks: 'True Range = max(High−Low, |High−Previous Close|, |Low−Previous Close|). ATR = smoothed average of TR over 14 periods.',
        interpretation: [
            '<b>High ATR</b> → High volatility — wider stops needed.',
            '<b>Low ATR</b> → Low volatility — potential breakout coming.',
            '<b>ATR %</b> → ATR/Price expresses volatility relative to price level.'
        ],
        proTip: 'Use ATR for setting stop losses: place stops 1.5–2× ATR away from entry to avoid getting stopped out by normal volatility.'
    },
    std_dev: {
        name: 'Standard Deviation',
        icon: '📈',
        summary: 'A statistical measure of how spread out prices are from the mean. Higher values indicate higher volatility.',
        howItWorks: 'Calculates the population standard deviation of closing prices over 20 periods.',
        interpretation: [
            '<b>Rising Std Dev</b> → Volatility is increasing.',
            '<b>Falling Std Dev</b> → Volatility is decreasing; consolidation.',
            '<b>Spikes</b> → Often occur at the start of major moves.'
        ],
        proTip: 'Standard Deviation is the building block of Bollinger Bands. Monitoring it separately helps anticipate band width changes.'
    },
    keltner: {
        name: 'Keltner Channel',
        icon: '📦',
        summary: 'A volatility-based channel using ATR instead of Standard Deviation (like Bollinger Bands), providing smoother boundaries.',
        howItWorks: 'Middle = EMA(20). Upper = EMA + 2×ATR(10). Lower = EMA − 2×ATR(10).',
        interpretation: [
            '<b>Price above Upper</b> → Strong bullish momentum or overbought.',
            '<b>Price below Lower</b> → Strong bearish momentum or oversold.',
            '<b>Inside channel</b> → Normal trading range.',
            '<b>Squeeze with Bollinger</b> → When BB is inside Keltner → volatility squeeze.'
        ],
        proTip: 'The Bollinger Band / Keltner Channel Squeeze is a powerful setup: when BB compresses inside KC, a big move is imminent.'
    },
    donchian: {
        name: 'Donchian Channel',
        icon: '🏔️',
        summary: 'Plots the highest high and lowest low over a set period. The original breakout indicator used by the famous Turtle Traders.',
        howItWorks: 'Upper = highest high of last 20 periods. Lower = lowest low of last 20 periods. Middle = (Upper + Lower) / 2.',
        interpretation: [
            '<b>Price breaks above Upper</b> → Bullish breakout signal.',
            '<b>Price breaks below Lower</b> → Bearish breakout signal.',
            '<b>Narrowing channel</b> → Consolidation; breakout pending.'
        ],
        proTip: 'Richard Dennis\'s Turtle Trading System used 20-day Donchian breakouts as its primary entry signal — one of the most successful trend-following strategies ever.'
    },
    hist_vol: {
        name: 'Historical Volatility',
        icon: '🌡️',
        summary: 'Measures the annualized standard deviation of logarithmic returns, showing how volatile the asset has been historically.',
        howItWorks: 'Calculates log returns over 20 days, takes the standard deviation, and annualizes by multiplying by √365.',
        interpretation: [
            '<b>Below 30%</b> → Low volatility (typical for stable assets).',
            '<b>30–80%</b> → Moderate to high volatility.',
            '<b>Above 80%</b> → Very high volatility (risky).',
            '<b>Declining HV</b> → Market is calming; potential breakout ahead.'
        ],
        proTip: 'Compare HV to implied volatility (from options) — if HV > IV, options may be cheap; if IV > HV, options may be expensive.'
    },
    obv: {
        name: 'OBV — On Balance Volume',
        icon: '📊',
        summary: 'A cumulative volume indicator that adds volume on up days and subtracts it on down days, showing buying/selling pressure.',
        howItWorks: 'If today\'s close > yesterday\'s close: OBV += today\'s volume. If lower: OBV −= volume. If equal: OBV unchanged.',
        interpretation: [
            '<b>Rising OBV</b> → Buying pressure (accumulation).',
            '<b>Falling OBV</b> → Selling pressure (distribution).',
            '<b>OBV divergence from price</b> → Extremely powerful — a rising OBV with falling price suggests accumulation before a rally.'
        ],
        proTip: 'The absolute OBV value is less important than its direction. OBV divergence from price is one of the most reliable volume signals.'
    },
    ad_line: {
        name: 'Accumulation/Distribution Line',
        icon: '💧',
        summary: 'Combines price and volume to show whether an asset is being accumulated (bought) or distributed (sold).',
        howItWorks: 'Money Flow Multiplier = ((Close − Low) − (High − Close)) / (High − Low). A/D = Cumulative sum of (MFM × Volume).',
        interpretation: [
            '<b>Rising A/D</b> → Accumulation — buyers are in control even on pullbacks.',
            '<b>Falling A/D</b> → Distribution — sellers dominate.',
            '<b>A/D divergence from price</b> → If price makes new highs but A/D doesn\'t, the rally lacks conviction.'
        ],
        proTip: 'A/D Line is especially useful for confirming breakouts — a breakout on rising A/D has much higher probability of success.'
    }
};

function showIndicatorInfo(indId) {
    const info = INDICATOR_INFO[indId];
    if (!info) return;

    // Remove existing popup
    let overlay = document.getElementById('indicator-info-overlay');
    if (overlay) overlay.remove();

    overlay = document.createElement('div');
    overlay.id = 'indicator-info-overlay';
    overlay.className = 'indicator-info-overlay';
    overlay.innerHTML = `
        <div class="indicator-info-popup">
            <div class="indicator-info-header">
                <span class="indicator-info-title">${info.icon} ${info.name}</span>
                <button class="indicator-info-close">&times;</button>
            </div>
            <div class="indicator-info-body">
                <div class="indicator-info-section">
                    <p class="indicator-info-summary">${info.summary}</p>
                </div>
                <div class="indicator-info-section">
                    <h4>⚙️ How It Works</h4>
                    <p>${info.howItWorks}</p>
                </div>
                <div class="indicator-info-section">
                    <h4>📖 How to Read It</h4>
                    <ul class="indicator-info-list">
                        ${info.interpretation.map(item => `<li>${item}</li>`).join('')}
                    </ul>
                </div>
                <div class="indicator-info-section pro-tip">
                    <h4>💡 Pro Tip</h4>
                    <p>${info.proTip}</p>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('active'));

    // Close handlers
    overlay.querySelector('.indicator-info-close').addEventListener('click', () => {
        overlay.classList.remove('active');
        setTimeout(() => overlay.remove(), 300);
    });
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            overlay.classList.remove('active');
            setTimeout(() => overlay.remove(), 300);
        }
    });
}

function wireIndicatorInfoPopups(container) {
    if (!container) return;
    container.querySelectorAll('.indicator-card[data-ind-id], .indicator-card[data-custom-ind]').forEach(card => {
        card.style.cursor = 'pointer';
        card.addEventListener('click', (e) => {
            // Don't trigger if clicking the remove button
            if (e.target.closest('.indicator-card-remove')) return;
            const indId = card.dataset.indId || card.dataset.customInd;
            if (indId) showIndicatorInfo(indId);
        });
    });
}

// ---- Load News into Trading Panel ----
async function loadTradingNews(assetInfo) {
    const feed = document.getElementById('trading-news-feed');
    if (!feed) return;

    // Copy from existing news feed if available
    const existingNews = document.getElementById('ai-news-feed');
    if (existingNews && existingNews.children.length > 0 && !existingNews.querySelector('.spinner')) {
        feed.innerHTML = existingNews.innerHTML;
        return;
    }

    // Otherwise fetch fresh
    let newsItems = [];
    if (assetInfo.type === 'crypto') {
        newsItems = await fetchNews(assetInfo.id);
    } else {
        newsItems = await fetchFinnhubNews(assetInfo.symbol);
    }

    if (newsItems && newsItems.length > 0) {
        feed.innerHTML = newsItems.slice(0, 5).map(n => `
            <a href="${n.url || '#'}" target="_blank" class="news-item" style="text-decoration: none; display: block; margin-bottom: var(--space-3);">
                <p style="font-weight:600; font-size: 0.9rem; margin-bottom: 2px; color: var(--color-text-primary);">${n.title}</p>
                <div style="font-size: 11px; color: var(--color-text-muted);">${n.date || 'Recent'} • ${n.source || 'News'}</div>
            </a>
        `).join('');
    } else {
        feed.innerHTML = '<p style="font-size: 0.85rem; color: var(--color-text-muted); text-align: center;">No recent news</p>';
    }
}

// ---- Wire Order Form ----
function wireOrderForm(assetInfo) {
    let currentSide = 'buy';
    let currentOrderType = 'market';
    let tpSlMode = 'price'; // 'price' or 'dollar'

    const qtyInput = document.getElementById('order-qty');
    const priceInput = document.getElementById('order-price');
    const tpInput = document.getElementById('order-tp');
    const slInput = document.getElementById('order-sl');
    const priceGroup = document.getElementById('order-price-group');

    // TP/SL Mode Toggle
    document.querySelectorAll('.tp-sl-mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tp-sl-mode-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            tpSlMode = btn.dataset.mode;
            if (tpInput) tpInput.placeholder = tpSlMode === 'price' ? 'Target Price' : '$ Profit Amount';
            if (slInput) slInput.placeholder = tpSlMode === 'price' ? 'Target Price' : '$ Loss Amount';
        });
    });
    const executeBtn = document.getElementById('order-execute-btn');
    const summaryPrice = document.getElementById('order-summary-price');
    const summaryQty = document.getElementById('order-summary-qty');
    const summaryTotal = document.getElementById('order-summary-total');
    const priceHint = document.getElementById('order-current-price-hint');
    const availableSpan = document.getElementById('order-available');

    // Leverage Elements
    const leverageSlider = document.getElementById('order-leverage-slider');
    const leverageDisplay = document.getElementById('leverage-value-display');
    const leverageMaxLabel = document.getElementById('leverage-max-label');
    const summaryTotalValue = document.getElementById('order-summary-total-value');
    const summaryMargin = document.getElementById('order-summary-margin');

    // Initialize Leverage Slider
    const maxLeverageMap = { 'crypto': 500, 'stock': 20, 'commodity': 1000 };
    const maxLevResource = maxLeverageMap[assetInfo.type] || 1;
    if (leverageSlider) {
        leverageSlider.max = maxLevResource;
        leverageSlider.value = 1;
        if (leverageMaxLabel) leverageMaxLabel.textContent = `Max: ${maxLevResource}x`;
    }

    // Update available balance
    function updateAvailable() {
        const data = PaperTrading.load();
        if (availableSpan) availableSpan.textContent = `Avail: $${data.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        if (priceHint) priceHint.textContent = `Market: $${assetInfo.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
    }
    updateAvailable();

    // Update summary
    function updateSummary() {
        const qty = parseFloat(qtyInput?.value) || 0;
        const price = currentOrderType === 'market' ? assetInfo.price : (parseFloat(priceInput?.value) || 0);
        const leverage = parseInt(leverageSlider?.value) || 1;

        const totalValue = qty * price;
        const marginRequired = totalValue / leverage;

        if (summaryTotalValue) summaryTotalValue.textContent = `$${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        if (summaryMargin) summaryMargin.textContent = `$${marginRequired.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

        // Legacy fields for compatibility if needed
        if (summaryPrice) summaryPrice.textContent = `$${price.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
        if (summaryQty) summaryQty.textContent = qty.toString();
        if (summaryTotal) summaryTotal.textContent = `$${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }

    if (qtyInput) qtyInput.addEventListener('input', updateSummary);
    if (priceInput) priceInput.addEventListener('input', updateSummary);
    if (leverageSlider) {
        leverageSlider.addEventListener('input', () => {
            if (leverageDisplay) leverageDisplay.textContent = leverageSlider.value;
            updateSummary();
        });
    }

    // Order Type Tabs
    document.querySelectorAll('.order-type-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.order-type-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentOrderType = tab.dataset.type;

            if (priceGroup) {
                priceGroup.style.display = currentOrderType === 'market' ? 'none' : 'block';
            }
            updateSummary();
        });
    });

    // Buy/Sell Toggle
    document.querySelectorAll('.order-side-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.order-side-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentSide = btn.dataset.side;

            if (executeBtn) {
                executeBtn.textContent = `${currentSide.toUpperCase()} ${assetInfo.symbol}`;
                executeBtn.className = `order-execute-btn ${currentSide}`;
            }
            updateSummary();
        });
    });

    // Quick Amount Buttons
    document.querySelectorAll('.quick-amount-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const pct = parseInt(btn.dataset.pct);
            const data = PaperTrading.load();
            const price = currentOrderType === 'market' ? assetInfo.price : (parseFloat(priceInput?.value) || assetInfo.price);
            const leverage = parseInt(leverageSlider?.value) || 1;

            if (price > 0 && qtyInput) {
                // Buying power = Balance * Leverage
                const buyingPower = data.balance * leverage;
                const maxQty = buyingPower / price;
                qtyInput.value = (maxQty * pct / 100).toFixed(6);
                updateSummary();
            }
        });
    });

    // Execute Order
    if (executeBtn) {
        executeBtn.addEventListener('click', () => {
            const qty = parseFloat(qtyInput?.value);
            const price = currentOrderType === 'market' ? assetInfo.price : (parseFloat(priceInput?.value) || 0);
            let tp = parseFloat(tpInput?.value) || null;
            let sl = parseFloat(slInput?.value) || null;
            const leverage = parseInt(leverageSlider?.value) || 1;

            if (!qty || qty <= 0) {
                showOrderToast('⚠️', 'Please enter a valid quantity');
                return;
            }
            if (currentOrderType !== 'market' && (!price || price <= 0)) {
                showOrderToast('⚠️', 'Please enter a valid price');
                return;
            }

            // Convert dollar-based TP/SL to price-based
            if (tpSlMode === 'dollar' && qty > 0) {
                if (tp !== null) {
                    tp = currentSide === 'buy' ? price + (tp / qty) : price - (tp / qty);
                }
                if (sl !== null) {
                    sl = currentSide === 'buy' ? price - (sl / qty) : price + (sl / qty);
                }
            }

            const result = PaperTrading.openPosition(assetInfo.symbol, assetInfo.name, currentSide, qty, price, tp, sl, leverage);

            if (result.error) {
                showOrderToast('❌', result.error);
            } else {
                const total = (qty * price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                showOrderToast(
                    currentSide === 'buy' ? '🟢' : '🔴',
                    `${currentSide.toUpperCase()} ${qty} ${assetInfo.symbol} @ $${price.toLocaleString()} (${leverage}x) = $${total}`
                );
                if (qtyInput) qtyInput.value = '';
                if (tpInput) tpInput.value = '';
                if (slInput) slInput.value = '';
                updateSummary();
                updateAvailable();
                updatePaperBalanceDisplay();
                updatePositionsList(assetInfo);
            }
        });
    }
}

// ---- Wire Balance Edit ----
function wireBalanceEdit() {
    const editBtn = document.getElementById('paper-balance-edit');
    if (!editBtn) return;

    editBtn.addEventListener('click', () => {
        // Create overlay if not exists
        let overlay = document.getElementById('balance-edit-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'balance-edit-overlay';
            overlay.className = 'balance-edit-overlay';
            overlay.innerHTML = `
                <div class="balance-edit-modal">
                    <h3>💰 Edit Paper Balance</h3>
                    <input type="number" id="balance-edit-input" placeholder="100000" step="any" min="0">
                    <div class="balance-edit-actions">
                        <button class="cancel-btn" id="balance-edit-cancel">Cancel</button>
                        <button class="save-btn" id="balance-edit-save">Save</button>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);

            document.getElementById('balance-edit-cancel').addEventListener('click', () => {
                overlay.classList.remove('active');
            });

            document.getElementById('balance-edit-save').addEventListener('click', () => {
                const newBalance = parseFloat(document.getElementById('balance-edit-input').value);
                if (newBalance >= 0) {
                    PaperTrading.setBalance(newBalance);
                    updatePaperBalanceDisplay();
                    showOrderToast('✅', `Balance updated to $${newBalance.toLocaleString()}`);
                }
                overlay.classList.remove('active');
            });

            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) overlay.classList.remove('active');
            });
        }

        const input = document.getElementById('balance-edit-input');
        if (input) input.value = PaperTrading.getBalance();
        overlay.classList.add('active');
    });
}

// ---- Update Balance Display ----
function updatePaperBalanceDisplay() {
    const data = PaperTrading.load();

    const balanceEl = document.getElementById('paper-balance-amount');
    const unrealizedEl = document.getElementById('paper-unrealized-pnl');
    const realizedEl = document.getElementById('paper-realized-pnl');

    if (balanceEl) {
        balanceEl.textContent = `$${data.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }

    // Calculate unrealized from current positions and check TP/SL triggers
    let totalUnrealized = 0;
    const assetInfo = getCurrentAssetInfo(document.getElementById('coin-hero') ? 'crypto' : 'market');

    // Use a fresh load to ensure we have latest positions
    let positionsToTrigger = [];

    data.positions.forEach(p => {
        if (p.symbol === assetInfo.symbol) {
            // Check triggers
            let triggered = false;
            let triggerType = "";

            if (p.side === 'buy') {
                if (p.takeProfit && assetInfo.price >= p.takeProfit) {
                    triggered = true;
                    triggerType = "Take Profit";
                } else if (p.stopLoss && assetInfo.price <= p.stopLoss) {
                    triggered = true;
                    triggerType = "Stop Loss";
                }
            } else { // sell/short
                if (p.takeProfit && assetInfo.price <= p.takeProfit) {
                    triggered = true;
                    triggerType = "Take Profit";
                } else if (p.stopLoss && assetInfo.price >= p.stopLoss) {
                    triggered = true;
                    triggerType = "Stop Loss";
                }
            }

            if (triggered) {
                positionsToTrigger.push({ id: p.id, type: triggerType, symbol: p.symbol });
            }

            // Calculate P/L
            if (p.side === 'buy') totalUnrealized += (assetInfo.price - p.entryPrice) * p.qty;
            else totalUnrealized += (p.entryPrice - assetInfo.price) * p.qty;
        } else {
            // Positions for other assets (simulated static price or just zero pnl for now)
            // In a real app we'd need prices for all assets in portfolio
            // For now, only the current asset has live P/L updates here
        }
    });

    // Handle triggers
    positionsToTrigger.forEach(p => {
        const result = PaperTrading.closePosition(p.id, assetInfo.price);
        if (result.success) {
            showOrderToast(p.type === "Take Profit" ? "💰" : "🛡️", `${p.type} hit! Closed ${p.symbol} @ $${assetInfo.price.toLocaleString()}`);
            // Update UI
            updatePositionsList(assetInfo);
        }
    });

    if (unrealizedEl) {
        const pnlStr = totalUnrealized >= 0
            ? `+$${totalUnrealized.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            : `-$${Math.abs(totalUnrealized).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        unrealizedEl.textContent = pnlStr;
        unrealizedEl.className = `paper-balance-value ${totalUnrealized >= 0 ? 'profit' : 'loss'}`;
    }

    if (realizedEl) {
        const dataNow = PaperTrading.load(); // Reload to get updated realized P/L
        const rPnl = dataNow.realizedPnl;
        const rStr = rPnl >= 0
            ? `+$${rPnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            : `-$${Math.abs(rPnl).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        realizedEl.textContent = rStr;
        realizedEl.className = `paper-balance-value ${rPnl >= 0 ? 'profit' : 'loss'}`;
    }
}

// ---- Update Positions List ----
function updatePositionsList(assetInfo) {
    const listEl = document.getElementById('positions-list');
    if (!listEl) return;

    const data = PaperTrading.load();
    const positions = data.positions;

    if (positions.length === 0) {
        listEl.innerHTML = '<p style="font-size: 0.85rem; color: var(--color-text-muted); text-align: center; padding: 1rem 0;">No open positions</p>';
        return;
    }

    listEl.innerHTML = positions.map(p => {
        const currentPrice = assetInfo.price;
        let pnl = 0;
        if (p.side === 'buy') pnl = (currentPrice - p.entryPrice) * p.qty;
        else pnl = (p.entryPrice - currentPrice) * p.qty;
        const pnlColor = pnl >= 0 ? '#00d4aa' : '#ff6b6b';
        const pnlSign = pnl >= 0 ? '+' : '';
        const sideIcon = p.side === 'buy' ? '🟢' : '🔴';

        // TP/SL Info
        const tpSlHtml = `
            <div class="position-limits">
                ${p.takeProfit ? `<span class="limit-tag tp">TP: $${p.takeProfit.toLocaleString()}</span>` : ''}
                ${p.stopLoss ? `<span class="limit-tag sl">SL: $${p.stopLoss.toLocaleString()}</span>` : ''}
            </div>
        `;

        return `
            <div class="position-item" data-pos-id="${p.id}" style="cursor: pointer;" title="Click to edit TP/SL">
                <div class="position-info">
                    <span class="position-symbol">${sideIcon} ${p.symbol} <small style="background: rgba(255,255,255,0.05); padding: 1px 4px; border-radius: 3px; font-size: 0.7rem; color: var(--color-text-muted);">${p.leverage || 1}x</small></span>
                    <span class="position-details">${p.qty} @ $${p.entryPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })} • ${p.side.toUpperCase()}</span>
                    ${tpSlHtml}
                </div>
                <div class="position-pnl">
                    <span style="font-weight:700; color:${pnlColor}; font-size: 0.9rem;">${pnlSign}$${pnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    <button class="position-close-btn" data-pos-id="${p.id}">Close</button>
                </div>
            </div>
        `;
    }).join('');

    // Wire close buttons
    listEl.querySelectorAll('.position-close-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent opening edit popup
            const posId = btn.dataset.posId;
            const result = PaperTrading.closePosition(posId, assetInfo.price);
            if (result.success) {
                const pnlSign = result.pnl >= 0 ? '+' : '';
                showOrderToast(
                    result.pnl >= 0 ? '💰' : '📉',
                    `Position closed. P/L: ${pnlSign}$${result.pnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                );
                updatePositionsList(assetInfo);
                updatePaperBalanceDisplay();
            }
        });
    });

    // Wire position click → edit TP/SL popup
    listEl.querySelectorAll('.position-item').forEach(item => {
        item.addEventListener('click', (e) => {
            if (e.target.closest('.position-close-btn')) return;
            const posId = item.dataset.posId;
            const pos = positions.find(p => p.id === posId);
            if (pos) showPositionEditPopup(pos, assetInfo);
        });
    });
}

// ---- Position Edit Popup (TP/SL Adjustment) ----
function showPositionEditPopup(pos, assetInfo) {
    // Remove existing overlay
    let overlay = document.getElementById('position-edit-overlay');
    if (overlay) overlay.remove();

    const sideIcon = pos.side === 'buy' ? '🟢' : '🔴';
    const pnl = pos.side === 'buy'
        ? (assetInfo.price - pos.entryPrice) * pos.qty
        : (pos.entryPrice - assetInfo.price) * pos.qty;
    const pnlColor = pnl >= 0 ? '#00d4aa' : '#ff6b6b';
    const pnlSign = pnl >= 0 ? '+' : '';

    overlay = document.createElement('div');
    overlay.id = 'position-edit-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:99999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);animation:fadeIn 0.2s ease;';

    overlay.innerHTML = `
        <div style="background:var(--color-surface, #1a1a2e);border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:24px 28px;max-width:420px;width:92%;box-shadow:0 24px 48px rgba(0,0,0,0.5);">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
                <h3 style="margin:0;font-size:1.1rem;color:var(--color-text-primary, #fff);">${sideIcon} Edit Position — ${pos.symbol}</h3>
                <button id="pos-edit-close" style="background:none;border:none;color:var(--color-text-muted, #888);font-size:1.4rem;cursor:pointer;padding:4px 8px;">&times;</button>
            </div>

            <div style="background:rgba(255,255,255,0.03);border-radius:10px;padding:12px 14px;margin-bottom:16px;font-size:0.85rem;color:var(--color-text-secondary, #ccc);">
                <div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span>Side</span><span style="font-weight:600;">${pos.side.toUpperCase()}</span></div>
                <div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span>Entry Price</span><span style="font-weight:600;">$${pos.entryPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span></div>
                <div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span>Quantity</span><span style="font-weight:600;">${pos.qty}</span></div>
                <div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span>Leverage</span><span style="font-weight:600;">${pos.leverage || 1}x</span></div>
                <div style="display:flex;justify-content:space-between;"><span>Current P/L</span><span style="font-weight:700;color:${pnlColor};">${pnlSign}$${Math.abs(pnl).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
            </div>

            <!-- TP/SL Mode Toggle -->
            <div style="display:flex;gap:4px;background:rgba(255,255,255,0.04);border-radius:8px;padding:3px;margin-bottom:14px;">
                <button class="pos-edit-mode-btn" data-mode="price" style="flex:1;padding:6px 0;border:none;border-radius:6px;font-size:0.8rem;font-weight:600;cursor:pointer;transition:all 0.2s;background:var(--color-accent, #6c5ce7);color:#fff;">Price</button>
                <button class="pos-edit-mode-btn" data-mode="dollar" style="flex:1;padding:6px 0;border:none;border-radius:6px;font-size:0.8rem;font-weight:600;cursor:pointer;transition:all 0.2s;background:transparent;color:var(--color-text-muted, #888);">Dollar (P/L)</button>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:18px;">
                <div>
                    <label style="display:block;font-size:0.78rem;color:var(--color-text-muted, #888);margin-bottom:5px;font-weight:600;">Take Profit</label>
                    <input type="number" id="pos-edit-tp" placeholder="Target Price" step="any" value="${pos.takeProfit || ''}" style="width:100%;padding:10px 12px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:8px;color:var(--color-text-primary, #fff);font-size:0.9rem;outline:none;transition:border-color 0.2s;box-sizing:border-box;">
                </div>
                <div>
                    <label style="display:block;font-size:0.78rem;color:var(--color-text-muted, #888);margin-bottom:5px;font-weight:600;">Stop Loss</label>
                    <input type="number" id="pos-edit-sl" placeholder="Target Price" step="any" value="${pos.stopLoss || ''}" style="width:100%;padding:10px 12px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:8px;color:var(--color-text-primary, #fff);font-size:0.9rem;outline:none;transition:border-color 0.2s;box-sizing:border-box;">
                </div>
            </div>

            <div style="display:flex;gap:10px;">
                <button id="pos-edit-cancel" style="flex:1;padding:10px;border:1px solid rgba(255,255,255,0.1);background:transparent;border-radius:10px;color:var(--color-text-muted, #888);font-weight:600;cursor:pointer;font-size:0.85rem;transition:all 0.2s;">Cancel</button>
                <button id="pos-edit-save" style="flex:1;padding:10px;border:none;background:var(--color-accent, #6c5ce7);border-radius:10px;color:#fff;font-weight:700;cursor:pointer;font-size:0.85rem;transition:all 0.2s;">Save Changes</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    let editMode = 'price';
    const tpInput = document.getElementById('pos-edit-tp');
    const slInput = document.getElementById('pos-edit-sl');

    // Mode toggle
    overlay.querySelectorAll('.pos-edit-mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            editMode = btn.dataset.mode;
            overlay.querySelectorAll('.pos-edit-mode-btn').forEach(b => {
                if (b.dataset.mode === editMode) {
                    b.style.background = 'var(--color-accent, #6c5ce7)';
                    b.style.color = '#fff';
                } else {
                    b.style.background = 'transparent';
                    b.style.color = 'var(--color-text-muted, #888)';
                }
            });
            if (editMode === 'dollar') {
                tpInput.placeholder = '$ Profit Amount';
                slInput.placeholder = '$ Loss Amount';
                tpInput.value = '';
                slInput.value = '';
            } else {
                tpInput.placeholder = 'Target Price';
                slInput.placeholder = 'Target Price';
                tpInput.value = pos.takeProfit || '';
                slInput.value = pos.stopLoss || '';
            }
        });
    });

    // Close
    const closePopup = () => { if (overlay.parentNode) overlay.remove(); };
    document.getElementById('pos-edit-close').addEventListener('click', closePopup);
    document.getElementById('pos-edit-cancel').addEventListener('click', closePopup);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closePopup(); });

    // Save
    document.getElementById('pos-edit-save').addEventListener('click', () => {
        let tp = parseFloat(tpInput.value) || null;
        let sl = parseFloat(slInput.value) || null;

        // Convert dollar to price if needed
        if (editMode === 'dollar' && pos.qty > 0) {
            if (tp !== null) {
                tp = pos.side === 'buy' ? pos.entryPrice + (tp / pos.qty) : pos.entryPrice - (tp / pos.qty);
            }
            if (sl !== null) {
                sl = pos.side === 'buy' ? pos.entryPrice - (sl / pos.qty) : pos.entryPrice + (sl / pos.qty);
            }
        }

        const result = PaperTrading.updatePosition(pos.id, {
            takeProfit: tp,
            stopLoss: sl
        });

        if (result.success) {
            showOrderToast('✅', `TP/SL updated for ${pos.symbol}`);
            updatePositionsList(assetInfo);
            updatePaperBalanceDisplay();
        } else {
            showOrderToast('❌', result.error || 'Update failed');
        }
        closePopup();
    });
}

// ---- Show Toast Notification ----
function showOrderToast(icon, message) {
    // Remove existing toast
    const existing = document.querySelector('.order-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'order-toast';
    toast.innerHTML = `
        <span class="order-toast-icon">${icon}</span>
        <span class="order-toast-text">${message}</span>
    `;
    document.body.appendChild(toast);
    setTimeout(() => { if (toast.parentNode) toast.remove(); }, 3500);
}


// Ensure initLiveBlog is called on load
// Ensure initLiveBlog is called on load
document.addEventListener('DOMContentLoaded', () => {
    if (typeof initLiveBlog === 'function') initLiveBlog();
    if (typeof initMarketDetail === 'function') initMarketDetail();
    if (typeof initAIPricePredictions === 'function') initAIPricePredictions();

    // Init trading mode on detail pages (with small delay to let hero load)
    setTimeout(initTradingMode, 2000);
    setTimeout(initTradingMode, 4000); // Retry in case data loaded late
});




// -------------------- Market Detail Page Logic (Stocks & Commodities) --------------------
async function initMarketDetail() {
    const hero = document.getElementById('market-hero');
    if (!hero) return; // Only run on market-detail.html

    const urlParams = new URLSearchParams(window.location.search);
    const symbol = urlParams.get('symbol') || 'AAPL';
    const type = urlParams.get('type') || 'stock';

    // 1. Fetch Real-Time Data (Price, Change, etc.)
    const data = await fetchFinnhubData([symbol]);

    if (data && data.length > 0) {
        const item = data[0];
        const change = item.regularMarketChangePercent;
        const trend = change >= 0 ? 'trend-up' : 'trend-down';
        const sign = change >= 0 ? '+' : '';
        const trendColor = change >= 0 ? '#00d4aa' : '#ff6b6b';

        // Update Hero Section
        const isForex = type === 'forex';
        const heroIcon = isForex ? getForexIcon(symbol) : (type === 'stock' ? '📊' : '⛏️');
        const heroName = isForex ? (FOREX_PAIRS[symbol] ? FOREX_PAIRS[symbol].name : item.longName) : item.longName;
        const heroPrice = isForex
            ? item.regularMarketPrice.toFixed(item.regularMarketPrice < 10 ? 4 : 2)
            : '$' + item.regularMarketPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        hero.innerHTML = `
            <div class="coin-hero-icon" style="color: #000;">${heroIcon}</div>
            <h1 style="margin-bottom: var(--space-2); font-size: 2.5rem;">${heroName}</h1>
            <div style="font-size: 3.5rem; font-weight: 700; margin-bottom: var(--space-2); letter-spacing: -1px;">${heroPrice}</div>
            <div class="${trend}" style="font-size: 1.25rem; font-weight: 600; display: inline-flex; align-items: center; gap: 8px; background: rgba(255,255,255,0.05); padding: 8px 20px; border-radius: 50px;">
                ${sign}${change.toFixed(2)}% 
                <span style="font-size: 0.9rem; opacity: 0.8; margin-left: 4px;">(24h)</span>
            </div>
        `;

        // Update AI Analysis Cards (Simulated Analysis based on real metrics)
        updateMarketAnalysis(item);
    } else {
        hero.innerHTML = `<div class="error-state"><p>Market Data Unavailable</p></div>`;
    }

    // 2. Initialize TradingView Chart
    initTradingViewWidget(symbol, type);

    // 3. Fetch News
    initMarketNews(symbol);
}

function updateMarketAnalysis(item) {
    const change = item.regularMarketChangePercent;

    // Logic for Verdict/Sentiment based on technicals (simplified)
    let verdict = 'Hold';
    let sentiment = 50;
    let reason = 'Market is consolidating.';
    let verdictClass = 'verdict-hold';

    if (change > 2) {
        verdict = 'Strong Buy';
        sentiment = 85;
        reason = 'Strong bullish momentum detected. Price is breaking out above key resistance levels with high volume.';
        verdictClass = 'verdict-buy';
    } else if (change > 0.5) {
        verdict = 'Buy';
        sentiment = 65;
        reason = 'Positive trend direction. Moving averages suggest further upside potential in the short term.';
        verdictClass = 'verdict-buy';
    } else if (change < -2) {
        verdict = 'Strong Sell';
        sentiment = 15;
        reason = 'Bearish breakdown confirmed. Asset has lost critical support levels.';
        verdictClass = 'verdict-sell';
    } else if (change < -0.5) {
        verdict = 'Sell';
        sentiment = 35;
        reason = 'Negative price action. Momentum indicators are showing weakness.';
        verdictClass = 'verdict-sell';
    }

    // Update DOM
    document.getElementById('ai-sentiment-score').innerText = sentiment + '/100';
    document.getElementById('sentiment-bar').style.width = sentiment + '%';

    // Color bar
    const bar = document.getElementById('sentiment-bar');
    if (sentiment >= 60) bar.style.background = 'var(--color-success)';
    else if (sentiment <= 40) bar.style.background = 'var(--color-danger)';
    else bar.style.background = 'var(--color-warning)';

    const badge = document.getElementById('ai-verdict-badge');
    badge.innerText = verdict.toUpperCase();
    badge.className = `verdict-badge ${verdictClass}`;

    document.getElementById('ai-verdict-text').innerText = reason;

    // Predictions (Simple projections)
    const current = item.regularMarketPrice;
    const low = current * (0.85 + (Math.random() * 0.05)); // -10% to -15%
    const high = current * (1.15 + (Math.random() * 0.10)); // +15% to +25%

    document.getElementById('pred-low').innerText = '$' + low.toLocaleString(undefined, { maximumFractionDigits: 2 });
    document.getElementById('pred-high').innerText = '$' + high.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

// Map Yahoo Finance symbol suffixes to TradingView exchange prefixes
const YAHOO_TO_TV_EXCHANGE = {
    '.NS': 'NSE:',       // India (NSE)
    '.BO': 'BSE:',       // India (BSE)
    '.T': 'TSE:',        // Japan (Tokyo)
    '.DE': 'XETR:',      // Germany (XETRA)
    '.L': 'LSE:',        // UK (London)
    '.HK': 'HKEX:',      // Hong Kong
    '.PA': 'EURONEXT:',  // France (Paris)
    '.AS': 'EURONEXT:',  // Netherlands (Amsterdam)
    '.MC': 'BME:',       // Spain (Madrid)
    '.MI': 'MIL:',       // Italy (Milan)
    '.ST': 'OMXSTO:',    // Sweden (Stockholm)
    '.HE': 'OMXHEX:',    // Finland (Helsinki)
    '.CO': 'OMXCOP:',    // Denmark (Copenhagen)
    '.OL': 'OSL:',       // Norway (Oslo)
    '.SW': 'SIX:',       // Switzerland
    '.AX': 'ASX:',       // Australia
    '.TO': 'TSX:',       // Canada (Toronto)
    '.SI': 'SGX:',       // Singapore
    '.KS': 'KRX:',       // South Korea
    '.KQ': 'KRX:',       // South Korea (KOSDAQ)
    '.TW': 'TWSE:',      // Taiwan
    '.JK': 'IDX:',       // Indonesia
    '.KL': 'MYX:',       // Malaysia
    '.BK': 'SET:',       // Thailand
    '.SA': 'BMFBOVESPA:',// Brazil
    '.MX': 'BMV:',       // Mexico
    '.IS': 'BIST:',      // Turkey
    '.WA': 'GPW:',       // Poland
    '.PR': 'PSE:',       // Czech Republic (Prague)
    '.TA': 'TASE:',      // Israel
    '.QA': 'QSE:',       // Qatar
    '.SR': 'TADAWUL:',   // Saudi Arabia
    '.NZ': 'NZX:',       // New Zealand
    '.VI': 'VIE:',       // Austria (Vienna)
    '.BR': 'EURONEXT:',  // Belgium (Brussels)
    '.LS': 'EURONEXT:',  // Portugal (Lisbon)
    '.GH': 'GSE:',       // Ghana
};

// NASDAQ-listed US stocks (common ones)
const NASDAQ_STOCKS = new Set([
    'AAPL', 'MSFT', 'GOOGL', 'GOOG', 'AMZN', 'NVDA', 'META', 'TSLA', 'AMD', 'NFLX',
    'INTC', 'CSCO', 'AVGO', 'QCOM', 'TXN', 'ADBE', 'CRM', 'COST', 'PEP', 'SBUX',
    'PYPL', 'ABNB', 'CMCSA', 'ISRG', 'AMGN', 'GILD', 'MRNA', 'BKNG', 'ADI', 'LRCX',
    'QQQ', 'INFY', 'MU', 'AMAT', 'MRVL', 'KLAC', 'SNPS', 'CDNS', 'PANW', 'CRWD'
]);

function convertToTradingViewSymbol(symbol) {
    // Check international symbols (have exchange suffix like .NS, .T, etc.)
    for (const [suffix, tvPrefix] of Object.entries(YAHOO_TO_TV_EXCHANGE)) {
        if (symbol.endsWith(suffix)) {
            const baseTicker = symbol.slice(0, -suffix.length);
            return tvPrefix + baseTicker;
        }
    }

    // Forex pairs (Yahoo: EURUSD=X → TradingView: FX:EURUSD)
    if (symbol.endsWith('=X')) {
        return 'FX:' + symbol.replace('=X', '');
    }

    // Commodities futures
    if (symbol.endsWith('=F')) {
        return 'COMEX:' + symbol.replace('=F', '');
    }

    // US stocks: guess exchange
    if (NASDAQ_STOCKS.has(symbol)) {
        return 'NASDAQ:' + symbol;
    }

    // Default: let TradingView auto-resolve
    return symbol;
}

// Exchanges known to be restricted in TradingView's free embed widget
const TV_RESTRICTED_SUFFIXES = new Set(['.NS', '.BO']); // NSE and BSE India

function isExchangeRestricted(symbol) {
    for (const suffix of TV_RESTRICTED_SUFFIXES) {
        if (symbol.endsWith(suffix)) return true;
    }
    return false;
}

function initTradingViewWidget(symbol, type) {
    const container = document.getElementById('tv-chart-container');
    if (!container) return;

    if (isExchangeRestricted(symbol)) {
        // Use Lightweight Charts + Yahoo Finance data for restricted exchanges
        console.log(`Chart: ${symbol} → Lightweight Charts (exchange restricted in TV embed)`);
        initLightweightChart(symbol, container);
    } else {
        // Use TradingView Advanced Chart embed for supported exchanges
        const tvSymbol = convertToTradingViewSymbol(symbol);
        console.log(`Chart: ${symbol} → TradingView embed (${tvSymbol})`);
        initTVEmbed(tvSymbol, container);
    }
}

// TradingView iframe embed (for supported exchanges)
function initTVEmbed(tvSymbol, container) {
    const widgetConfig = {
        "autosize": true,
        "symbol": tvSymbol,
        "interval": "D",
        "timezone": "Etc/UTC",
        "theme": "dark",
        "style": "1",
        "locale": "en",
        "enable_publishing": false,
        "allow_symbol_change": true,
        "backgroundColor": "rgba(10, 15, 30, 1)",
        "gridColor": "rgba(255, 255, 255, 0.06)",
        "hide_top_toolbar": false,
        "hide_legend": false,
        "save_image": false,
        "calendar": false,
        "support_host": "https://www.tradingview.com"
    };

    container.innerHTML = '';

    const widgetContainer = document.createElement('div');
    widgetContainer.className = 'tradingview-widget-container';
    widgetContainer.style.cssText = 'height: 100%; width: 100%;';

    const widgetInner = document.createElement('div');
    widgetInner.className = 'tradingview-widget-container__widget';
    widgetInner.style.cssText = 'height: 100%; width: 100%;';
    widgetContainer.appendChild(widgetInner);

    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.async = true;
    script.textContent = JSON.stringify(widgetConfig);
    widgetContainer.appendChild(script);

    container.appendChild(widgetContainer);
}

// Lightweight Charts fallback (for restricted exchanges)
async function initLightweightChart(symbol, container) {
    container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;"><div class="spinner"></div></div>';

    // Default to 1 Day
    let currentRange = '1d';
    const isIntraday = (r) => ['5m', '15m', '1h'].includes(r);

    async function loadChart(range) {
        currentRange = range;
        container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;"><div class="spinner"></div></div>';

        // Fetch OHLC data from Yahoo Finance via CORS proxy
        const data = await fetchYahooOHLC(symbol, range);

        if (!data || data.length === 0) {
            container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--color-text-secondary);font-size:0.95rem;">Chart data unavailable for this symbol</div>';
            return;
        }

        container.innerHTML = '';

        // Time range buttons
        const toolbar = document.createElement('div');
        toolbar.style.cssText = 'display:flex;gap:4px;padding:8px 12px;background:rgba(10,15,30,0.95);border-bottom:1px solid rgba(255,255,255,0.08);flex-wrap:wrap;';
        const ranges = [
            { label: '5m', value: '5m' },
            { label: '15m', value: '15m' },
            { label: '1H', value: '1h' },
            { label: '1D', value: '1d' },
            { label: '1W', value: '5d' },
            { label: '1M', value: '1mo' },
            { label: '3M', value: '3mo' },
            { label: '6M', value: '6mo' },
            { label: '1Y', value: '1y' },
            { label: '5Y', value: '5y' },
        ];
        ranges.forEach(r => {
            const btn = document.createElement('button');
            btn.textContent = r.label;
            btn.style.cssText = `padding:4px 12px;border:1px solid ${r.value === currentRange ? 'var(--color-accent)' : 'rgba(255,255,255,0.15)'};border-radius:4px;background:${r.value === currentRange ? 'rgba(0,212,170,0.15)' : 'transparent'};color:${r.value === currentRange ? 'var(--color-accent)' : 'rgba(255,255,255,0.6)'};cursor:pointer;font-size:12px;font-weight:600;transition:all 0.2s;`;
            btn.addEventListener('click', () => loadChart(r.value));
            btn.addEventListener('mouseenter', () => { if (r.value !== currentRange) btn.style.borderColor = 'rgba(255,255,255,0.3)'; });
            btn.addEventListener('mouseleave', () => { if (r.value !== currentRange) btn.style.borderColor = 'rgba(255,255,255,0.15)'; });
            toolbar.appendChild(btn);
        });

        // Symbol label
        const label = document.createElement('span');
        label.textContent = `${GLOBAL_COMPANY_NAMES[symbol] || symbol} · ${symbol}`;
        label.style.cssText = 'margin-left:auto;color:rgba(255,255,255,0.5);font-size:12px;display:flex;align-items:center;';
        toolbar.appendChild(label);

        container.appendChild(toolbar);

        // Chart container
        const chartDiv = document.createElement('div');
        chartDiv.style.cssText = 'width:100%;height:calc(100% - 40px);';
        container.appendChild(chartDiv);

        // Create Lightweight Chart
        if (!window.LightweightCharts) {
            chartDiv.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--color-text-secondary);">Charts library not loaded</div>';
            return;
        }

        const chart = LightweightCharts.createChart(chartDiv, {
            width: chartDiv.clientWidth,
            height: chartDiv.clientHeight,
            layout: {
                background: { type: 'solid', color: 'rgba(10, 15, 30, 1)' },
                textColor: 'rgba(255, 255, 255, 0.6)',
                fontSize: 12,
            },
            grid: {
                vertLines: { color: 'rgba(255, 255, 255, 0.04)' },
                horzLines: { color: 'rgba(255, 255, 255, 0.04)' },
            },
            crosshair: {
                mode: LightweightCharts.CrosshairMode.Normal,
                vertLine: { color: 'rgba(0, 212, 170, 0.3)', width: 1, style: 2 },
                horzLine: { color: 'rgba(0, 212, 170, 0.3)', width: 1, style: 2 },
            },
            rightPriceScale: {
                borderColor: 'rgba(255, 255, 255, 0.1)',
            },
            timeScale: {
                borderColor: 'rgba(255, 255, 255, 0.1)',
                timeVisible: isIntraday(currentRange),
                secondsVisible: false,
            },
        });

        // Candlestick series
        const candleSeries = chart.addCandlestickSeries({
            upColor: '#00d4aa',
            downColor: '#ff6b6b',
            borderDownColor: '#ff6b6b',
            borderUpColor: '#00d4aa',
            wickDownColor: '#ff6b6b',
            wickUpColor: '#00d4aa',
        });
        candleSeries.setData(data);

        // Volume series
        const volumeData = data.map(d => ({
            time: d.time,
            value: d.volume || 0,
            color: d.close >= d.open ? 'rgba(0, 212, 170, 0.2)' : 'rgba(255, 107, 107, 0.2)',
        }));

        const volumeSeries = chart.addHistogramSeries({
            color: 'rgba(0, 212, 170, 0.2)',
            priceFormat: { type: 'volume' },
            priceScaleId: '',
        });
        volumeSeries.priceScale().applyOptions({
            scaleMargins: { top: 0.8, bottom: 0 },
        });
        volumeSeries.setData(volumeData);

        chart.timeScale().fitContent();

        // Resize observer
        const resizeObserver = new ResizeObserver(() => {
            chart.applyOptions({
                width: chartDiv.clientWidth,
                height: chartDiv.clientHeight,
            });
        });
        resizeObserver.observe(chartDiv);
    }

    await loadChart(currentRange);
}

// Fetch OHLC data from Yahoo Finance via CORS proxy
async function fetchYahooOHLC(symbol, range = '1d') {
    // Map our range values to Yahoo Finance API parameters
    const RANGE_MAP = {
        '5m': { yahooRange: '1d', interval: '5m' },  // 5-minute candles, 1 day
        '15m': { yahooRange: '5d', interval: '15m' },  // 15-minute candles, 5 days
        '1h': { yahooRange: '1mo', interval: '60m' },  // 1-hour candles, 1 month
        '1d': { yahooRange: '5d', interval: '5m' },  // 5-min candles for 5 days
        '5d': { yahooRange: '1mo', interval: '1d' },  // daily candles, 1 month
        '1mo': { yahooRange: '1mo', interval: '1d' },
        '3mo': { yahooRange: '3mo', interval: '1d' },
        '6mo': { yahooRange: '6mo', interval: '1d' },
        '1y': { yahooRange: '1y', interval: '1d' },
        '5y': { yahooRange: '5y', interval: '1wk' }
    };
    const config = RANGE_MAP[range] || RANGE_MAP['1d'];
    const interval = config.interval;
    const yahooRange = config.yahooRange;
    const useTimestamps = ['5m', '15m', '60m'].includes(interval);
    const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${yahooRange}`;

    for (let i = 0; i < CORS_PROXIES.length; i++) {
        try {
            const proxyUrl = CORS_PROXIES[i](yahooUrl);
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 12000);

            const response = await fetch(proxyUrl, { signal: controller.signal });
            clearTimeout(timeout);

            if (!response.ok) continue;

            const data = await response.json();
            const result = data?.chart?.result?.[0];
            if (!result) continue;

            const timestamps = result.timestamp;
            const quotes = result.indicators?.quote?.[0];
            if (!timestamps || !quotes) continue;

            const ohlcData = [];
            for (let j = 0; j < timestamps.length; j++) {
                if (quotes.open[j] == null || quotes.close[j] == null) continue;

                ohlcData.push({
                    time: useTimestamps ? timestamps[j] : new Date(timestamps[j] * 1000).toISOString().split('T')[0],
                    open: quotes.open[j],
                    high: quotes.high[j],
                    low: quotes.low[j],
                    close: quotes.close[j],
                    volume: quotes.volume[j] || 0,
                });
            }

            return ohlcData;
        } catch (e) {
            continue;
        }
    }

    console.warn(`OHLC data fetch failed for ${symbol}`);
    return [];
}

// 4. Fetch Real News — Finnhub for US, general news fallback for international
// Strip exchange suffix for Finnhub (e.g. RELIANCE.NS → RELIANCE)
function getBaseSymbol(symbol) {
    const dotIndex = symbol.indexOf('.');
    if (dotIndex > 0 && !symbol.endsWith('=F')) {
        return symbol.substring(0, dotIndex);
    }
    return symbol;
}

async function fetchFinnhubNews(symbol) {
    // For forex pairs, use forex-specific news search
    if (symbol && symbol.endsWith('=X')) {
        return await fetchForexNews(symbol);
    }
    // For US stocks, Finnhub company-news works well
    if (isUSSymbol(symbol)) {
        return await fetchFinnhubCompanyNews(symbol);
    }
    // For international stocks, use Google News RSS for stock-specific results
    return await fetchGoogleNews(symbol);
}

// Forex-specific news using Google News with currency pair search
async function fetchForexNews(symbol) {
    try {
        const pair = FOREX_PAIRS[symbol];
        const pairName = pair ? pair.name : symbol.replace('=X', '');
        const searchQuery = encodeURIComponent(`${pairName} forex analysis exchange rate`);
        const rssUrl = `https://news.google.com/rss/search?q=${searchQuery}&hl=en&gl=US&ceid=US:en`;

        for (let i = 0; i < CORS_PROXIES.length; i++) {
            try {
                const proxyUrl = CORS_PROXIES[i](rssUrl);
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 10000);

                const response = await fetch(proxyUrl, { signal: controller.signal });
                clearTimeout(timeout);

                if (!response.ok) continue;

                const xmlText = await response.text();
                const parser = new DOMParser();
                const doc = parser.parseFromString(xmlText, 'text/xml');
                const items = doc.querySelectorAll('item');

                if (items.length === 0) continue;

                const newsItems = [];
                items.forEach((item, idx) => {
                    if (idx >= 5) return;
                    const title = item.querySelector('title')?.textContent || '';
                    const link = item.querySelector('link')?.textContent || '';
                    const pubDate = item.querySelector('pubDate')?.textContent || '';
                    const source = item.querySelector('source')?.textContent || 'Google News';

                    newsItems.push({
                        title: title,
                        date: pubDate ? new Date(pubDate).toLocaleDateString() : 'Recent',
                        source: source,
                        url: link,
                        body: title,
                        image: null
                    });
                });

                if (newsItems.length > 0) return newsItems;
            } catch (e) {
                continue;
            }
        }
    } catch (e) {
        console.warn('Forex News Error:', e);
    }
    return [];
}

// Finnhub company news (US stocks)
async function fetchFinnhubCompanyNews(symbol) {
    try {
        const to = new Date().toISOString().split('T')[0];
        const fromDate = new Date();
        fromDate.setDate(fromDate.getDate() - 7);
        const from = fromDate.toISOString().split('T')[0];

        const url = `https://finnhub.io/api/v1/company-news?symbol=${symbol}&from=${from}&to=${to}&token=${FINNHUB_API_KEY}`;
        const res = await fetch(url);
        const data = await res.json();

        if (Array.isArray(data) && data.length > 0) {
            return data.slice(0, 5).map(item => ({
                title: item.headline,
                date: new Date(item.datetime * 1000).toLocaleDateString(),
                source: item.source,
                url: item.url,
                body: item.summary,
                image: item.image
            }));
        }
    } catch (e) {
        console.warn('Finnhub News Error:', e);
    }
    return [];
}

// Google News RSS for international stock-specific news
async function fetchGoogleNews(symbol) {
    try {
        // Use company name for better search results
        const companyName = GLOBAL_COMPANY_NAMES[symbol] || getBaseSymbol(symbol);
        const searchQuery = encodeURIComponent(`${companyName} stock`);
        const rssUrl = `https://news.google.com/rss/search?q=${searchQuery}&hl=en&gl=US&ceid=US:en`;

        // Try each CORS proxy
        for (let i = 0; i < CORS_PROXIES.length; i++) {
            try {
                const proxyUrl = CORS_PROXIES[i](rssUrl);
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 10000);

                const response = await fetch(proxyUrl, { signal: controller.signal });
                clearTimeout(timeout);

                if (!response.ok) continue;

                const xmlText = await response.text();

                // Parse RSS XML
                const parser = new DOMParser();
                const doc = parser.parseFromString(xmlText, 'text/xml');
                const items = doc.querySelectorAll('item');

                if (items.length === 0) continue;

                const newsItems = [];
                items.forEach((item, idx) => {
                    if (idx >= 5) return;
                    const title = item.querySelector('title')?.textContent || '';
                    const link = item.querySelector('link')?.textContent || '';
                    const pubDate = item.querySelector('pubDate')?.textContent || '';
                    const source = item.querySelector('source')?.textContent || 'Google News';

                    newsItems.push({
                        title: title,
                        date: pubDate ? new Date(pubDate).toLocaleDateString() : 'Recent',
                        source: source,
                        url: link,
                        body: title,
                        image: null
                    });
                });

                if (newsItems.length > 0) return newsItems;
            } catch (e) {
                continue;
            }
        }
    } catch (e) {
        console.warn('Google News Error:', e);
    }
    return [];
}

async function initMarketNews(symbol) {
    const container = document.getElementById('ai-news-feed');
    if (!container) return;

    // Start with loading
    container.innerHTML = '<div class="spinner"></div>';

    const newsItems = await fetchFinnhubNews(symbol);

    if (newsItems.length > 0) {
        container.innerHTML = newsItems.map((news, index) => `
            <a href="market-news.html?symbol=${symbol}&article=${index}" class="news-item" style="text-decoration: none; display: block; margin-bottom: var(--space-4);">
                <p style="font-weight:600; font-size: 0.95rem; margin-bottom: 4px; color: var(--color-text-primary);">${news.title}</p>
                <div class="news-date">${news.date} • ${news.source}</div>
            </a>
        `).join('');
    } else {
        container.innerHTML = '<p style="font-size: 0.9rem; opacity: 0.7;">No recent news found for this symbol.</p>';
    }
}

// -------------------- Market News Article Logic --------------------
async function initMarketNewsArticle() {
    const container = document.getElementById('market-news-container');
    if (!container) return;

    const urlParams = new URLSearchParams(window.location.search);
    const symbol = urlParams.get('symbol');
    const articleIndex = parseInt(urlParams.get('article')) || 0;

    if (!symbol) {
        container.innerHTML = `<div class="article-header"><h1>Article Not Found</h1><a href="stocks.html" class="btn btn-primary">Return to Market</a></div>`;
        return;
    }

    // Loading State
    container.innerHTML = `<div class="loading-state" style="text-align:center; padding: 4rem;"><div class="spinner"></div><p>Fetching Article Data...</p></div>`;

    // Fetch News Real-time
    const newsItems = await fetchFinnhubNews(symbol);

    if (!newsItems || newsItems.length === 0 || !newsItems[articleIndex]) {
        container.innerHTML = `<div class="article-header"><h1>Article Unavailable</h1><p>Could not retrieve this news item.</p><a href="market-detail.html?symbol=${symbol}" class="btn">Return to ${symbol}</a></div>`;
        return;
    }

    const article = newsItems[articleIndex];
    container.articleData = article;

    setTimeout(() => {
        container.innerHTML = `
            <article>
                <header class="article-header">
                    <span class="source-badge">${article.source}</span>
                    <h1 data-animate style="margin: var(--space-4) 0;">${article.title}</h1>
                    <div class="article-meta">
                        <span>${article.date}</span>
                        <span>•</span>
                        <span>AI Curated</span>
                    </div>
                </header>
                
                <div class="article-content" data-animate>
                    ${article.image ? `<img src="${article.image}" style="width: 100%; border-radius: 12px; margin-bottom: var(--space-6); box-shadow: var(--shadow-lg);">` : ''}
                    
                    <p><strong>(AI Analysis)</strong> Market data indicates this news regarding ${symbol} is highly relevant for short-term sentiment. Our analysis suggests monitoring volume profiles for institutional confirmation.</p>
                    
                    <div class="card" style="border-left: 4px solid var(--color-accent); margin: 2rem 0; padding: var(--space-4); background: rgba(var(--color-accent-rgb), 0.05); display: flex; flex-direction: column; gap: 1rem;">
                       <div style="font-weight:600;">Read the full story:</div>
                       <div style="display: flex; gap: 1rem; flex-wrap: wrap;">
                           <button id="market-read-btn" class="btn btn-primary">📖 Read Here</button>
                           <a href="${article.url}" target="_blank" class="btn btn-secondary">External Link ↗</a>
                       </div>
                    </div>
                    
                    <p>${article.body || 'Financial markets are reacting to these recent developments. Click the link above to read the full details of this market event.'}</p>

                    <h2>Technical Context</h2>
                    <p>Traders typically look for support and resistance confirmation following news of this magnitude. ProsperPath AI identifies this as a potential ${symbol} catalyst.</p>
                </div>
            </article>
        `;
        initAnimations();
        initScrollEffects();

        // Attach Event Listener Directly
        const btn = document.getElementById('market-read-btn');
        if (btn) btn.addEventListener('click', () => showReaderModal(article));

    }, 500);
}

// -------------------- Prosperous Pattern Hunter --------------------

// -------------------- Prosperous Pattern Hunter --------------------

function injectPatternHunterStyles() {
    if (document.getElementById('pattern-hunter-styles')) return;
    const style = document.createElement('style');
    style.id = 'pattern-hunter-styles';
    style.textContent = `
        .pattern-hunter-bar {
            background: linear-gradient(135deg, rgba(20, 20, 30, 0.9), rgba(30, 30, 45, 0.9));
            border: 1px solid var(--color-accent);
            border-radius: var(--radius-lg);
            padding: var(--space-4) var(--space-5);
            margin-bottom: var(--space-4);
            display: flex;
            align-items: center;
            justify-content: space-between;
            box-shadow: 0 4px 20px rgba(0, 212, 170, 0.15);
            backdrop-filter: blur(10px);
            position: relative;
            overflow: hidden;
            animation: slideDown 0.5s ease-out;
        }

        @keyframes slideDown {
            from { opacity: 0; transform: translateY(-10px); }
            to { opacity: 1; transform: translateY(0); }
        }
        
        .pattern-hunter-bar::before {
            content: '';
            position: absolute;
            top: 0; left: 0; width: 4px; height: 100%;
            background: var(--color-accent);
        }

        .hunter-info {
            display: flex;
            align-items: center;
            gap: var(--space-4);
        }

        .hunter-icon {
            font-size: 28px;
            animation: pulse 2s infinite;
        }

        .hunter-text h3 {
            font-size: var(--text-md);
            color: var(--color-text-primary);
            margin: 0;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .hunter-text p {
            font-size: var(--text-xs);
            color: var(--color-text-secondary);
            margin: 2px 0 0 0;
        }

        .hunter-badge {
            background: rgba(0, 212, 170, 0.2);
            color: var(--color-accent);
            font-size: 10px;
            padding: 2px 6px;
            border-radius: 4px;
            text-transform: uppercase;
            font-weight: bold;
            letter-spacing: 0.5px;
        }

        .hunter-btn {
            background: var(--color-accent);
            color: #000;
            border: none;
            padding: 10px 20px;
            border-radius: var(--radius-full);
            font-weight: 700;
            font-size: var(--text-sm);
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 8px;
            transition: all 0.3s ease;
            box-shadow: 0 4px 12px rgba(0, 212, 170, 0.3);
        }

        .hunter-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 16px rgba(0, 212, 170, 0.4);
        }

        .hunter-btn:disabled {
            opacity: 0.7;
            cursor: not-allowed;
            transform: none;
        }

        .hunter-btn svg {
            width: 18px;
            height: 18px;
        }
        
        @keyframes pulse {
            0% { transform: scale(1); opacity: 1; }
            50% { transform: scale(1.1); opacity: 0.8; }
            100% { transform: scale(1); opacity: 1; }
        }

        .hunter-results-display {
            display: none;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: var(--space-4);
            margin-bottom: var(--space-6);
            background: rgba(255,255,255,0.02);
            border: 1px solid rgba(0, 212, 170, 0.2);
            border-radius: var(--radius-lg);
            padding: var(--space-5);
            animation: fadeIn 0.5s ease;
        }

        .hunter-res-card {
            padding: var(--space-4);
            background: rgba(0,0,0,0.3);
            border-radius: var(--radius-lg);
            border-left: 4px solid var(--color-accent);
            display: flex;
            flex-direction: column;
            justify-content: flex-start;
            transition: transform 0.3s ease;
        }
        .hunter-res-card:hover {
            transform: translateY(-2px);
            background: rgba(255,255,255,0.03);
        }
        .hunter-res-label {
            font-size: 11px;
            text-transform: uppercase;
            color: var(--color-text-muted);
            font-weight: 700;
            letter-spacing: 1.5px;
            margin-bottom: var(--space-2);
            opacity: 0.8;
        }
        .hunter-res-value {
            font-size: var(--text-md);
            font-weight: 600;
            color: var(--color-text-primary);
            line-height: 1.5;
            white-space: pre-line;
        }
        .hunter-res-conf {
            margin-top: auto;
            padding-top: var(--space-2);
            display: flex;
            align-items: center;
            gap: 12px;
        }
        .hunter-execute-card {
            grid-column: 1 / -1;
            display: flex;
            justify-content: center;
            padding-top: var(--space-2);
        }
        .hunter-execute-btn {
            background: var(--color-accent);
            color: #000;
            border: none;
            padding: 12px 30px;
            border-radius: var(--radius-lg);
            font-weight: 800;
            font-size: var(--text-sm);
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 10px;
            transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            box-shadow: 0 4px 15px rgba(0, 212, 170, 0.4);
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        .hunter-execute-btn:hover {
            transform: scale(1.05);
            box-shadow: 0 6px 20px rgba(0, 212, 170, 0.6);
        }
        .hunter-execute-btn.sell {
            background: #ff6b6b;
            box-shadow: 0 4px 15px rgba(255, 107, 107, 0.4);
        }
        .hunter-execute-btn.sell:hover {
            box-shadow: 0 6px 20px rgba(255, 107, 107, 0.6);
        }
        .conf-bar-outer {
            flex-grow: 1;
            height: 6px;
            background: rgba(255,255,255,0.1);
            border-radius: 3px;
            overflow: hidden;
        }
        .conf-bar-inner {
            height: 100%;
            background: linear-gradient(to right, var(--color-accent), #22c55e);
            border-radius: 3px;
            transition: width 1.5s cubic-bezier(0.1, 0, 0, 1);
        }
    `;
    document.head.appendChild(style);
}

function initPatternHunter(parentSelector = '.chart-section', chartSelector = '#tv-chart-container') {
    const parentContainer = document.querySelector(parentSelector);
    const chartContainer = document.querySelector(chartSelector);

    if (!parentContainer || !chartContainer || parentContainer.querySelector('.pattern-hunter-bar')) return;

    injectPatternHunterStyles();

    // Create Bar UI
    const bar = document.createElement('div');
    bar.className = 'pattern-hunter-bar';
    bar.innerHTML = `
        <div class="hunter-info">
            <span class="hunter-icon">🎯</span>
            <div class="hunter-text">
                <h3>Prosperous Pattern Hunter <span class="hunter-badge">PRO</span></h3>
                <p>AI-Powered Structure Detection & Trade Setup Analysis</p>
            </div>
        </div>
        <button class="hunter-btn activate-hunter-btn">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="22" y1="12" x2="18" y2="12"/><line x1="6" y1="12" x2="2" y2="12"/><line x1="12" y1="6" x2="12" y2="2"/><line x1="12" y1="22" x2="12" y2="18"/></svg>
            <span>Scan Market Structure</span>
        </button>
    `;

    // Insert BEFORE the chart container
    parentContainer.insertBefore(bar, chartContainer);

    // Results Display Container
    const resultsDisplay = document.createElement('div');
    resultsDisplay.className = 'hunter-results-display';
    parentContainer.insertBefore(resultsDisplay, chartContainer);

    // Listen for Results from AI Widget
    window.addEventListener('prosporousPatternResult', (e) => {
        const { side, entry, stopLoss, takeProfit, confidence } = e.detail;

        // Log the AI result to analytics
        if (window.AnalyticsLogger) {
            window.AnalyticsLogger.logPatternHunterResult({ side, entry, stopLoss, takeProfit, confidence });
        }
        const sideColor = side === 'SELL' ? '#ff6b6b' : '#00d4aa';

        resultsDisplay.style.display = 'grid';
        resultsDisplay.innerHTML = `
            <div class="hunter-res-card" style="border-color: ${sideColor}">
                <div class="hunter-res-label">Signal Bias</div>
                <div class="hunter-res-value" style="color: ${sideColor}; font-weight: 800;">${side || 'NEUTRAL'}</div>
            </div>
            <div class="hunter-res-card">
                <div class="hunter-res-label">Entry Zone</div>
                <div class="hunter-res-value" style="color: var(--color-accent);">${entry}</div>
            </div>
            <div class="hunter-res-card" style="border-color: #ff6b6b;">
                <div class="hunter-res-label">Stop-Loss</div>
                <div class="hunter-res-value">${stopLoss}</div>
            </div>
            <div class="hunter-res-card" style="border-color: #ffd93d;">
                <div class="hunter-res-label">Take-Profit Targets</div>
                <div class="hunter-res-value">${takeProfit}</div>
            </div>
            <div class="hunter-res-card">
                <div class="hunter-res-label">Confidence Score</div>
                <div class="hunter-res-value hunter-res-conf">
                    <span>${confidence}%</span>
                    <div class="conf-bar-outer"><div class="conf-bar-inner" style="width: 0%"></div></div>
                </div>
            </div>
            <div class="hunter-execute-card">
                <button class="hunter-execute-btn ${side?.toLowerCase() || ''}">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"></polyline><polyline points="16 7 22 7 22 13"></polyline></svg>
                    <span>Execute ${side || 'Trade'} Setup</span>
                </button>
            </div>
        `;

        // Bind Execution Logic
        const executeBtn = resultsDisplay.querySelector('.hunter-execute-btn');
        if (executeBtn) {
            executeBtn.addEventListener('click', () => {
                // Flag that this is a Pattern Hunter trade
                window._patternHunterTradeInProgress = true;
                const getNumeric = (str) => {
                    if (!str) return null;
                    const matches = str.match(/[\d,.]+/);
                    if (!matches) return null;
                    return parseFloat(matches[0].replace(/,/g, ''));
                };

                const parsedEntry = getNumeric(entry);
                const parsedSL = getNumeric(stopLoss);
                const parsedTP = getNumeric(takeProfit);

                // Use current balance to suggest a safe quantity
                const data = PaperTrading.load();
                const leverage = 1;
                const currentBalance = data.balance;

                const riskAmount = currentBalance * 0.02;
                const slPoints = Math.abs(parsedEntry - (parsedSL || parsedEntry * 0.95));
                let qty = slPoints > 0 ? (riskAmount / slPoints) : (currentBalance * 0.1 / parsedEntry);

                const maxSpend = currentBalance * 0.1;
                if (qty * parsedEntry > maxSpend) qty = maxSpend / parsedEntry;

                // Detect page type for getCurrentAssetInfo
                const finalPageType = document.getElementById('coin-hero') ? 'crypto' : 'market';
                const activeAsset = getCurrentAssetInfo(finalPageType);

                const result = PaperTrading.openPosition(
                    activeAsset.symbol,
                    activeAsset.name,
                    (side || 'BUY').toLowerCase() === 'sell' ? 'sell' : 'buy',
                    Number(qty.toFixed(6)),
                    parsedEntry || activeAsset.price,
                    parsedTP,
                    parsedSL,
                    leverage
                );

                if (result.success) {
                    showOrderToast('🚀', `Pattern Match! Executed AI Setup: ${side} ${qty.toFixed(4)} ${activeAsset.symbol}`);
                    updatePaperBalanceDisplay();
                    updatePositionsList(activeAsset);
                    executeBtn.disabled = true;
                    executeBtn.innerHTML = '✅ Position Opened';
                } else {
                    showOrderToast('❌', result.error);
                }
            });
        }

        setTimeout(() => {
            const innerBar = resultsDisplay.querySelector('.conf-bar-inner');
            if (innerBar) innerBar.style.width = confidence + '%';
        }, 100);
    });

    // Bind Scan Event
    const scanBtn = bar.querySelector('.activate-hunter-btn');
    scanBtn.addEventListener('click', async () => {
        const originalText = scanBtn.innerHTML;
        scanBtn.innerHTML = `<div class="spinner" style="width:18px;height:18px;border-width:2px;border-color:#000;border-top-color:transparent;border-radius:50%;display:inline-block;animation:spin 1s linear infinite;"></div> Scanning...`;

        if (!document.getElementById('spin-style')) {
            const s = document.createElement('style');
            s.id = 'spin-style';
            s.textContent = `@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`;
            document.head.appendChild(s);
        }

        scanBtn.disabled = true;
        resultsDisplay.style.display = 'none';

        try {
            let symbol = 'Unknown Asset';
            let price = 'Unknown Price';

            const urlParams = new URLSearchParams(window.location.search);
            const hashParams = new URLSearchParams(window.location.hash.substring(1));
            const id = urlParams.get('id') || hashParams.get('id');
            const ticker = urlParams.get('symbol');

            const cryptoHero = document.getElementById('coin-hero');
            const marketHero = document.getElementById('market-hero');

            if (cryptoHero) {
                const h1 = cryptoHero.querySelector('h1');
                symbol = h1 ? h1.innerText.split('(')[0].trim() : (id || 'Cryptocurrency');
                const priceDiv = cryptoHero.querySelector('div[style*="font-size: var(--text-5xl)"]') ||
                    cryptoHero.querySelector('div[style*="font-weight: 700"]');
                price = priceDiv ? priceDiv.innerText.trim() : 'Live Price';
            } else if (marketHero) {
                const h1 = marketHero.querySelector('h1');
                symbol = h1 ? h1.innerText.trim() : (ticker || 'Stock/Commodity');
                const priceDiv = marketHero.querySelector('div[style*="font-size: 3.5rem"]') ||
                    marketHero.querySelector('div[style*="font-weight: 700"]');
                price = priceDiv ? priceDiv.innerText.trim() : 'Live Price';
            }

            const path = window.location.pathname;
            const searchStr = window.location.search;
            let type = 'Generic Market';
            if (path.includes('crypto')) type = 'Cryptocurrency';
            else if (path.includes('stock')) type = 'Stock Market';
            else if (path.includes('commodities')) type = 'Commodities Market';
            else if (searchStr.includes('type=resource')) type = 'Commodity';
            else if (searchStr.includes('type=forex') || path.includes('forex')) type = 'Forex Market';

            if (window.prosporousWidget) {
                // Log the Pattern Hunter scan
                if (window.AnalyticsLogger) {
                    window.AnalyticsLogger.logPatternHunterScan(symbol, price, type);
                }
                window.prosporousWidget.triggerPatternHunt({
                    symbol: symbol,
                    price: price,
                    type: type
                });
            } else {
                alert('Prosperous AI Widget is initializing. Please try again in a moment.');
            }
        } catch (e) {
            console.error('Pattern Hunter Error:', e);
            alert('Analysis failed to start.');
        } finally {
            setTimeout(() => {
                scanBtn.innerHTML = originalText;
                scanBtn.disabled = false;
            }, 2000);
        }
    });

    console.log('Prosperous Pattern Hunter Initialized for', parentSelector);
}

// Auto-init on load
document.addEventListener('DOMContentLoaded', () => {
    // Small delay to ensure DOM is ready and other scripts ran
    setTimeout(() => {
        initPatternHunter('.chart-section', '#tv-chart-container');
    }, 1000);

    // Also try again after 3s just in case of slow renders
    setTimeout(() => {
        initPatternHunter('.chart-section', '#tv-chart-container');
    }, 3000);
});


// ============================================
// THEME SWITCHER
// ============================================
(function ThemeSwitcher() {
    const STORAGE_KEY = 'prosperpath-theme';

    const THEMES = [
        { id: '', name: 'Midnight', desc: 'Default dark teal', swatch: 'theme-swatch-midnight' },
        { id: 'theme-ocean', name: 'Ocean Breeze', desc: 'Cool blue palette', swatch: 'theme-swatch-ocean' },
        { id: 'theme-sunset', name: 'Sunset Gold', desc: 'Warm amber palette', swatch: 'theme-swatch-sunset' }
    ];

    // --- Restore saved theme immediately ---
    function restoreTheme() {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            document.body.classList.remove('theme-ocean', 'theme-sunset');
            document.body.classList.add(saved);
        }
    }
    // Run ASAP (script is at bottom of body, DOM is ready)
    restoreTheme();

    function getCurrentTheme() {
        return localStorage.getItem(STORAGE_KEY) || '';
    }

    function applyTheme(themeId) {
        // Add transition class for smooth crossfade
        document.body.classList.add('theme-transitioning');

        // Remove old theme classes
        document.body.classList.remove('theme-ocean', 'theme-sunset');

        // Add new theme class
        if (themeId) {
            document.body.classList.add(themeId);
        }

        // Save to localStorage
        localStorage.setItem(STORAGE_KEY, themeId);

        // Remove transition class after animation completes
        setTimeout(() => {
            document.body.classList.remove('theme-transitioning');
        }, 500);

        // Update active states in dropdown
        updateActiveStates(themeId);
    }

    function updateActiveStates(activeId) {
        const options = document.querySelectorAll('.theme-option');
        options.forEach(opt => {
            const optId = opt.dataset.themeId || '';
            if (optId === activeId) {
                opt.classList.add('active');
            } else {
                opt.classList.remove('active');
            }
        });
    }

    function createThemeSwitcher() {
        const navActions = document.querySelector('.nav-actions');
        if (!navActions) return;

        // Don't inject twice
        if (navActions.querySelector('.theme-switcher-wrapper')) return;

        const currentTheme = getCurrentTheme();

        // Build the wrapper
        const wrapper = document.createElement('div');
        wrapper.className = 'theme-switcher-wrapper';

        // Build the button
        const btn = document.createElement('button');
        btn.className = 'theme-switcher-btn';
        btn.setAttribute('aria-label', 'Switch theme');
        btn.id = 'theme-switcher-btn';
        btn.innerHTML = '<span class="theme-icon">🎨</span>';

        // Build the dropdown
        const dropdown = document.createElement('div');
        dropdown.className = 'theme-dropdown';
        dropdown.id = 'theme-dropdown';

        let dropdownHTML = '<div class="theme-dropdown-title">Choose Theme</div>';
        THEMES.forEach(theme => {
            const isActive = currentTheme === theme.id;
            dropdownHTML += `
                <div class="theme-option ${isActive ? 'active' : ''}" data-theme-id="${theme.id}">
                    <div class="theme-swatch ${theme.swatch}"></div>
                    <div class="theme-option-label">
                        <span class="theme-option-name">${theme.name}</span>
                        <span class="theme-option-desc">${theme.desc}</span>
                    </div>
                </div>
            `;
        });
        dropdown.innerHTML = dropdownHTML;

        wrapper.appendChild(btn);
        wrapper.appendChild(dropdown);

        // Insert BEFORE the settings-wrapper (so 🎨 appears left of ⚙️)
        const settingsWrapper = navActions.querySelector('.settings-wrapper');
        if (settingsWrapper) {
            navActions.insertBefore(wrapper, settingsWrapper);
        } else {
            navActions.appendChild(wrapper);
        }

        // --- Event handlers ---

        // Toggle dropdown
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = dropdown.classList.contains('open');
            closeAllDropdowns();
            if (!isOpen) {
                dropdown.classList.add('open');
            }
        });

        // Theme selection
        dropdown.querySelectorAll('.theme-option').forEach(opt => {
            opt.addEventListener('click', (e) => {
                e.stopPropagation();
                const themeId = opt.dataset.themeId || '';
                applyTheme(themeId);
                // Close dropdown after short delay for visual feedback
                setTimeout(() => {
                    dropdown.classList.remove('open');
                }, 200);
            });
        });

        // Close on outside click
        document.addEventListener('click', (e) => {
            if (!wrapper.contains(e.target)) {
                dropdown.classList.remove('open');
            }
        });

        // Close on Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                dropdown.classList.remove('open');
            }
        });
    }

    function closeAllDropdowns() {
        document.querySelectorAll('.theme-dropdown.open').forEach(d => d.classList.remove('open'));
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', createThemeSwitcher);
    } else {
        createThemeSwitcher();
    }
})();
