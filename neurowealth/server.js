require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const { Configuration, PlaidApi, PlaidEnvironments } = require('plaid');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_FILE = path.join(__dirname, 'plaid_session.json');

// Middleware
// ── CORS: allow all supported environments ───────────────────────────────────
// CORS_ORIGIN in .env can be a comma-separated list of allowed origins.
// Base set always includes both local dev ports so neither is accidentally blocked.
const _corsBase = [
    'http://localhost:3000',
    'http://localhost:3005',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3005',
];
const _corsEnv = (process.env.CORS_ORIGIN || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
const ALL_ALLOWED_ORIGINS = [...new Set([..._corsBase, ..._corsEnv])];
console.log('[CORS] Allowed origins:', ALL_ALLOWED_ORIGINS);
app.use(cors({
    origin(origin, callback) {
        // Allow requests with no origin (curl, server-to-server, same-origin)
        if (!origin) return callback(null, true);
        if (ALL_ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
        callback(new Error(`CORS: origin not allowed: ${origin}`));
    },
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname, { dotfiles: 'ignore', index: false }));

function requireApiAuth(req, res, next) {
    // Wallet token fetching is browser-initiated — the Alchemy API key is
    // kept server-side, so these endpoints don't need the server API token.
    if (req.path === '/wallet-tokens') return next();
    if (req.path === '/wallet-tokens-multichain') return next();

    if (process.env.ALLOW_INSECURE_LOCAL_API === 'true') return next();

    const expectedToken = process.env.SERVER_API_TOKEN;
    if (!expectedToken) {
        return res.status(503).json({ error: 'Server API token not configured' });
    }

    const authHeader = req.get('Authorization') || '';
    if (authHeader !== `Bearer ${expectedToken}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    next();
}

// ── Waitlist endpoint ────────────────────────────────────────────────────────
// Registered BEFORE requireApiAuth so it is publicly accessible.
// Protected by a lightweight in-memory rate limiter and a honeypot field.
const { addToBrevoWaitlist } = require('./waitlist-brevo-service');

// In-memory rate limit: max 5 submissions per IP per 60 seconds.
// Resets after the window. Sufficient for a low-traffic public form.
const _waitlistRateMap = new Map();
const WAITLIST_RATE_LIMIT    = 5;
const WAITLIST_RATE_WINDOW   = 60 * 1000; // 60 s

function _waitlistRateCheck(ip) {
    const now    = Date.now();
    const entry  = _waitlistRateMap.get(ip);
    if (!entry || now - entry.ts > WAITLIST_RATE_WINDOW) {
        _waitlistRateMap.set(ip, { ts: now, count: 1 });
        return true;
    }
    if (entry.count >= WAITLIST_RATE_LIMIT) return false;
    entry.count++;
    return true;
}

// Simple email format validator (RFC 5321-ish, no external lib)
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;

app.post('/api/waitlist', async (req, res) => {
    // ── 1. Rate limit ────────────────────────────────────────────────────────
    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
    if (!_waitlistRateCheck(ip)) {
        return res.status(429).json({ ok: false, status: 'rate_limited', message: 'Too many requests. Please wait a moment.' });
    }

    // ── 2. Honeypot check ────────────────────────────────────────────────────
    // The hidden `website` field must be absent or empty. Bots that auto-fill
    // all fields will be silently rejected without revealing the guard.
    if (req.body && req.body.website) {
        // Return 200 to fool bots — no real action taken.
        return res.json({ ok: true, status: 'added' });
    }

    // ── 3. Input validation ──────────────────────────────────────────────────
    const rawEmail = (req.body && req.body.email) || '';
    const email    = rawEmail.toString().trim().toLowerCase();

    if (!email) {
        return res.status(400).json({ ok: false, status: 'invalid', message: 'Email address is required.' });
    }
    if (!EMAIL_RE.test(email)) {
        return res.status(400).json({ ok: false, status: 'invalid', message: 'Please enter a valid email address.' });
    }

    // ── 4. Brevo upsert ──────────────────────────────────────────────────────
    const result = await addToBrevoWaitlist(email);

    if (result.ok) {
        return res.json({ ok: true, status: 'added' });
    }
    return res.status(500).json({ ok: false, status: 'error', message: result.message || 'Something went wrong. Please try again.' });
});

// ── API auth guard (applied to all /api/* routes AFTER the public waitlist above)
app.use('/api', requireApiAuth);


// Plaid Configuration
const configuration = new Configuration({
    basePath: PlaidEnvironments[process.env.PLAID_ENV || 'sandbox'],
    baseOptions: {
        headers: {
            'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
            'PLAID-SECRET': process.env.PLAID_SECRET,
        },
    },
});

const plaidClient = new PlaidApi(configuration);

// Store access tokens (in production, use a database)
let accessToken = null;
let itemId = null;

// Load session from file if it exists
if (fs.existsSync(SESSION_FILE)) {
    try {
        const sessionData = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
        accessToken = sessionData.access_token;
        itemId = sessionData.item_id;
        console.log('📂 Loaded persistent session from file');
    } catch (err) {
        console.error('❌ Error loading session file:', err);
    }
}

// ============= PLAID ENDPOINTS =============

// Check Connection Status
app.get('/api/status', (req, res) => {
    res.json({
        connected: !!accessToken,
        item_id: itemId
    });
});

// Create Link Token
app.post('/api/create_link_token', async (req, res) => {
    try {
        const configs = {
            user: {
                client_user_id: 'user-' + Date.now(),
            },
            client_name: 'NeuroWealth',
            products: ['investments'],
            country_codes: ['US'],
            language: 'en',
        };

        const createTokenResponse = await plaidClient.linkTokenCreate(configs);
        res.json(createTokenResponse.data);
    } catch (error) {
        console.error('Error creating link token:', error);
        res.status(500).json({ error: error.message });
    }
});

// Exchange Public Token for Access Token
app.post('/api/set_access_token', async (req, res) => {
    const { public_token } = req.body;

    try {
        const tokenResponse = await plaidClient.itemPublicTokenExchange({
            public_token: public_token,
        });

        accessToken = tokenResponse.data.access_token;
        itemId = tokenResponse.data.item_id;

        // Save session to file for persistence across server restarts
        fs.writeFileSync(SESSION_FILE, JSON.stringify({
            access_token: accessToken,
            item_id: itemId
        }, null, 2));
        console.log('Item ID:', itemId);
        console.log('💾 Session saved to file');

        res.json({ item_id: itemId });
    } catch (error) {
        console.error('Error exchanging public token:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get Investment Holdings
app.get('/api/holdings', async (req, res) => {
    try {
        if (!accessToken) {
            return res.status(400).json({ error: 'No access token available. Please link an account first.' });
        }

        const holdingsResponse = await plaidClient.investmentsHoldingsGet({
            access_token: accessToken,
        });

        const { holdings, securities, accounts } = holdingsResponse.data;

        // Map securities for easy lookup
        const securityMap = {};
        securities.forEach(s => {
            securityMap[s.security_id] = s;
        });

        // Join holdings with securities
        const joinedHoldings = holdings.map(h => ({
            ...h,
            security: securityMap[h.security_id] || { name: 'Unknown Security' }
        }));

        res.json({
            holdings: joinedHoldings,
            accounts: accounts,
            securities: securities
        });
    } catch (error) {
        console.error('Error fetching holdings:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get Investment Transactions
app.get('/api/transactions', async (req, res) => {
    try {
        if (!accessToken) {
            return res.status(400).json({ error: 'No access token available. Please link an account first.' });
        }

        // Get transactions from last 90 days
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 90);

        const transactionsResponse = await plaidClient.investmentsTransactionsGet({
            access_token: accessToken,
            start_date: startDate.toISOString().split('T')[0],
            end_date: endDate.toISOString().split('T')[0],
        });

        const { investment_transactions, securities } = transactionsResponse.data;

        // Map securities for easy lookup
        const securityMap = {};
        securities.forEach(s => {
            securityMap[s.security_id] = s;
        });

        // Join transactions with securities
        const joinedTransactions = investment_transactions.map(t => ({
            ...t,
            security: securityMap[t.security_id] || { name: 'Unknown Security' }
        }));

        res.json({
            investment_transactions: joinedTransactions,
            securities: securities
        });
    } catch (error) {
        console.error('Error fetching transactions:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============= WALLET TOKEN ENDPOINTS =============

// Chain ID → Alchemy network slug
// BNB Chain and Avalanche C-Chain added (2026-03-13)
const ALCHEMY_CHAIN_MAP = {
    1:        'eth-mainnet',
    5:        'eth-goerli',
    11155111: 'eth-sepolia',
    56:       'bnb-mainnet',      // BNB Smart Chain
    137:      'polygon-mainnet',
    80001:    'polygon-mumbai',
    42161:    'arb-mainnet',
    421614:   'arb-sepolia',
    8453:     'base-mainnet',
    84532:    'base-sepolia',
    10:       'opt-mainnet',
    11155420: 'opt-sepolia',
    43114:    'avax-mainnet',    // Avalanche C-Chain
};

// Native gas-token symbol per chain
const CHAIN_NATIVE_SYMBOL = {
    1: 'ETH',  5: 'ETH',  11155111: 'ETH',
    56: 'BNB',
    137: 'MATIC', 80001: 'MATIC',
    42161: 'ETH', 421614: 'ETH',
    8453: 'ETH', 84532: 'ETH',
    10: 'ETH',  11155420: 'ETH',
    43114: 'AVAX',
};

// Human-readable chain name per chain
const CHAIN_LABELS = {
    1: 'Ethereum',     5: 'Goerli',   11155111: 'Sepolia',
    56: 'BNB Chain',
    137: 'Polygon',    80001: 'Mumbai',
    42161: 'Arbitrum', 421614: 'Arbitrum Sepolia',
    8453: 'Base',      84532: 'Base Sepolia',
    10: 'Optimism',   11155420: 'Optimism Sepolia',
    43114: 'Avalanche C-Chain',
};

// CoinGecko platform slug per chain (for ERC-20 price lookup — Tier 2)
const GECKO_PLATFORM = {
    1:     'ethereum',
    56:    'binance-smart-chain',
    137:   'polygon-pos',
    42161: 'arbitrum-one',
    8453:  'base',
    10:    'optimistic-ethereum',
    43114: 'avalanche',
};

// CoinGecko Onchain (GeckoTerminal) network slugs per chain (for Tier 1)
const GECKO_ONCHAIN_NETWORK = {
    1:     'eth',
    56:    'bsc',
    137:   'polygon_pos',
    42161: 'arbitrum',
    8453:  'base',
    10:    'optimism',
    43114: 'avax',
};

// CoinGecko coin ID for native gas token price lookup
const GECKO_NATIVE_ID = {
    1: 'ethereum',    5: 'ethereum',    11155111: 'ethereum',
    56: 'binancecoin',
    137: 'matic-network', 80001: 'matic-network',
    42161: 'ethereum', 421614: 'ethereum',
    8453: 'ethereum',  84532: 'ethereum',
    10: 'ethereum',   11155420: 'ethereum',
    43114: 'avalanche-2',
};

// ── Supported chains for multichain portfolio scanning ────────────────────────
// These are the production mainnet chain IDs ProsperPath will scan.
// The active wallet chain does NOT limit which of these are scanned.
const SUPPORTED_PORTFOLIO_CHAINS = [1, 56, 137, 42161, 8453, 10, 43114];

// ── DexScreener fallback safety thresholds ───────────────────────────────────
const DEXSCREENER_MIN_LIQUIDITY_USD = 500;   // reject pairs below this liquidity
const DEXSCREENER_MIN_TXN_H24       = 0;     // 0 = allow even inactive pairs (liquidity check is primary)

// ── Simple in-memory portfolio cache (5-min TTL) ─────────────────────────────
// Single-chain cache key: `${address.toLowerCase()}:${chainId}`
// Multichain cache key:   `multichain:${address.toLowerCase()}`
// Prevents Alchemy/CoinGecko rate-limit hits on rapid Refresh clicks.
const _portfolioCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getCachedPortfolio(address, chainId) {
    const key = `${address.toLowerCase()}:${chainId}`;
    const entry = _portfolioCache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.ts > CACHE_TTL_MS) {
        _portfolioCache.delete(key);
        return null;
    }
    return entry.data;
}

function setCachedPortfolio(address, chainId, data) {
    const key = `${address.toLowerCase()}:${chainId}`;
    _portfolioCache.set(key, { ts: Date.now(), data });
    if (_portfolioCache.size > 200) {
        const oldest = _portfolioCache.keys().next().value;
        _portfolioCache.delete(oldest);
    }
}

function getCachedMultichain(address) {
    const key = `multichain:${address.toLowerCase()}`;
    const entry = _portfolioCache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.ts > CACHE_TTL_MS) {
        _portfolioCache.delete(key);
        return null;
    }
    return entry.data;
}

function setCachedMultichain(address, data) {
    const key = `multichain:${address.toLowerCase()}`;
    _portfolioCache.set(key, { ts: Date.now(), data });
    if (_portfolioCache.size > 200) {
        const oldest = _portfolioCache.keys().next().value;
        _portfolioCache.delete(oldest);
    }
}

/**
 * POST to Alchemy JSON-RPC endpoint for a given network.
 */
async function alchemyRpc(networkSlug, method, params) {
    const apiKey = process.env.ALCHEMY_API_KEY;
    const url = `https://${networkSlug}.g.alchemy.com/v2/${apiKey}`;
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    if (!response.ok) {
        throw new Error(`Alchemy HTTP ${response.status} for ${method}`);
    }
    const json = await response.json();
    if (json.error) throw new Error(`Alchemy error: ${json.error.message}`);
    return json.result;
}

/**
 * GET /api/wallet-tokens?address=0x...&chainId=1
 *
 * Returns normalized token holdings for the given wallet address and chain.
 * Tokens with zero USD value (dust, illiquid tokens) are filtered out.
 */
app.get('/api/wallet-tokens', async (req, res) => {
    const apiKey = process.env.ALCHEMY_API_KEY;
    if (!apiKey) {
        return res.status(503).json({
            error: 'Alchemy API key not configured on the server. Add ALCHEMY_API_KEY to .env.'
        });
    }

    const { address, chainId: chainIdStr, noCache } = req.query;
    const chainId = parseInt(chainIdStr, 10);

    if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
        return res.status(400).json({ error: 'Invalid or missing wallet address.' });
    }
    if (isNaN(chainId)) {
        return res.status(400).json({ error: 'Invalid or missing chainId.' });
    }

    console.info(`[wallet-tokens] Request: ${address} on chainId=${chainId}`);

    const networkSlug = ALCHEMY_CHAIN_MAP[chainId];
    if (!networkSlug) {
        console.info(`[wallet-tokens] Unsupported chain: ${chainId}`);
        return res.json({
            unsupported: true,
            chainId,
            chainName: CHAIN_LABELS[chainId] || `Chain ${chainId}`,
            holdings: [],
        });
    }

    // Serve from cache unless explicitly bypassed (noCache=1)
    if (noCache !== '1') {
        const cached = getCachedPortfolio(address, chainId);
        if (cached) {
            console.info(`[wallet-tokens] Cache hit for ${address} on ${chainId}`);
            return res.json({ ...cached, fromCache: true });
        }
    }

    try {
        const nativeSymbol = CHAIN_NATIVE_SYMBOL[chainId] || 'ETH';
        const chainLabel   = CHAIN_LABELS[chainId] || `Chain ${chainId}`;

        // ── 1. Native balance ────────────────────────────────────────────────
        console.info(`[wallet-tokens] Fetching native balance (${nativeSymbol}) on ${chainLabel}...`);
        const hexNativeBalance = await alchemyRpc(networkSlug, 'eth_getBalance', [address, 'latest']);
        const nativeBalanceRaw = BigInt(hexNativeBalance);
        const nativeBalance = Number(nativeBalanceRaw) / 1e18;
        console.info(`[wallet-tokens] Native balance: ${nativeBalance.toFixed(6)} ${nativeSymbol}`);

        // ── 2. ERC-20 / BEP-20 token balances ──────────────────────────────
        console.info(`[wallet-tokens] Fetching token balances on ${chainLabel}...`);
        const tokenData = await alchemyRpc(
            networkSlug,
            'alchemy_getTokenBalances',
            [address, 'erc20']
        );
        const rawTokens = (tokenData?.tokenBalances || []).filter(t => t.tokenBalance && t.tokenBalance !== '0x0');
        console.info(`[wallet-tokens] Raw token balances: ${rawTokens.length} non-zero tokens`);

        // ── 3. Fetch token metadata (up to 50 to avoid rate limits) ─────────
        console.info(`[wallet-tokens] Fetching metadata for up to ${Math.min(rawTokens.length, 50)} tokens...`);
        const tokensToFetch = rawTokens.slice(0, 50);
        const tokenMetaResults = await Promise.allSettled(
            tokensToFetch.map(async (token) => {
                const meta = await alchemyRpc(
                    networkSlug,
                    'alchemy_getTokenMetadata',
                    [token.contractAddress]
                );

                const decimals = (meta?.decimals != null && meta.decimals >= 0) ? meta.decimals : 18;
                const rawBal = BigInt(token.tokenBalance || '0x0');
                const quantity = Number(rawBal) / Math.pow(10, decimals);

                return {
                    symbol:          meta?.symbol || '???',
                    name:            meta?.name   || 'Unknown Token',
                    decimals,
                    quantity,
                    contractAddress: token.contractAddress,
                    logoUrl:         meta?.logo   || null,
                    chain:           chainLabel,
                    rawBalance:      token.tokenBalance,
                };
            })
        );

        const enrichedTokens = tokenMetaResults
            .filter(r => r.status === 'fulfilled')
            .map(r => r.value)
            .filter(t => t.quantity > 0.000001) // dust filter
            .filter(t => t.symbol !== '???');    // skip tokens with no metadata
        console.info(`[wallet-tokens] Enriched tokens after dust/no-meta filter: ${enrichedTokens.length}`);

        // ── 4. Fetch USD prices via CoinGecko ────────────────────────────────
        let priceMap = {};
        try {
            const contractAddresses = enrichedTokens.map(t => t.contractAddress).join(',');
            const geckoNetwork = GECKO_PLATFORM[chainId] || 'ethereum';

            if (contractAddresses) {
                const geckoUrl = `https://api.coingecko.com/api/v3/simple/token_price/${geckoNetwork}` +
                    `?contract_addresses=${contractAddresses}&vs_currencies=usd`;
                const geckoRes = await fetch(geckoUrl, {
                    headers: { 'Accept': 'application/json' }
                });
                if (geckoRes.ok) {
                    priceMap = await geckoRes.json();
                    console.info(`[wallet-tokens] Token prices fetched: ${Object.keys(priceMap).length} entries from CoinGecko`);
                } else {
                    console.warn(`[wallet-tokens] CoinGecko token price HTTP ${geckoRes.status}`);
                }
            }

            // Native coin price
            const nativeGeckoId = GECKO_NATIVE_ID[chainId] || 'ethereum';
            const nativePriceRes = await fetch(
                `https://api.coingecko.com/api/v3/simple/price?ids=${nativeGeckoId}&vs_currencies=usd`
            );
            if (nativePriceRes.ok) {
                const nativePriceData = await nativePriceRes.json();
                priceMap['_native'] = nativePriceData[nativeGeckoId]?.usd || 0;
                console.info(`[wallet-tokens] Native price (${nativeSymbol}): $${priceMap['_native']}`);
            }
        } catch (priceErr) {
            console.warn('[wallet-tokens] Price fetch failed (CoinGecko):', priceErr.message);
        }

        // ── 5. Build normalized holdings list ──────────────────────────────
        const holdings = [];

        // Native coin first
        const nativeUsdPrice = priceMap['_native'] || 0;
        if (nativeBalance > 0.000001) {
            holdings.push({
                quantity:          parseFloat(nativeBalance.toFixed(8)),
                institution_price: nativeUsdPrice,
                security: {
                    name:          `${nativeSymbol} (Native)`,
                    type:          'Crypto',
                    ticker_symbol: nativeSymbol,
                },
                chain:            chainLabel,
                contractAddress:  null,
                usdValue:         parseFloat((nativeBalance * nativeUsdPrice).toFixed(2)),
                sourceType:       'wallet',
            });
        }

        // ERC-20 / BEP-20 tokens
        for (const token of enrichedTokens) {
            const priceEntry = priceMap[token.contractAddress?.toLowerCase()] || {};
            const usdPrice = priceEntry.usd || 0;
            const usdValue = parseFloat((token.quantity * usdPrice).toFixed(2));

            // Keep tokens even if priceUsd is unavailable — unpriced tokens are
            // real holdings. Only skip if both USD value AND quantity are zero.
            if (usdValue === 0 && token.quantity <= 0) continue;

            holdings.push({
                quantity:          parseFloat(token.quantity.toFixed(8)),
                institution_price: usdPrice,
                security: {
                    name:          token.name,
                    type:          'Crypto',
                    ticker_symbol: token.symbol,
                    logo_url:      token.logoUrl || null,
                },
                chain:            token.chain,
                contractAddress:  token.contractAddress,
                usdValue,
                sourceType:       'wallet',
                isNative:         false,
            });
        }

        // Sort by USD value descending
        holdings.sort((a, b) => b.usdValue - a.usdValue);

        const totalUsd = holdings.reduce((s, h) => s + (h.usdValue || 0), 0);
        console.info(`[wallet-tokens] Portfolio normalized: ${holdings.length} assets, $${totalUsd.toFixed(2)} USD for ${address} on ${chainLabel}`);

        const payload = {
            holdings,
            address,
            chainId,
            chainName: chainLabel,
            nativeSymbol,
            totalUsd: parseFloat(totalUsd.toFixed(2)),
            fetchedAt: new Date().toISOString(),
        };

        setCachedPortfolio(address, chainId, payload);
        res.json(payload);

    } catch (err) {
        console.error('[wallet-tokens] Error:', err.message);
        res.status(500).json({ error: `Failed to fetch token balances: ${err.message}` });
    }
});

// ============= PRICING ENGINE =============

/**
 * TIER 1 — CoinGecko Onchain (GeckoTerminal)
 * Fetches prices for a list of contract addresses on a given chain using the
 * free GeckoTerminal API. Batches all addresses in one request per chain.
 *
 * @param {number}   chainId    - EVM chain ID
 * @param {string[]} addresses  - Lowercase contract addresses
 * @returns {Promise<Object>}   - Map { lowercase_address → priceUsd }
 */
async function fetchCoinGeckoOnchainPrices(chainId, addresses) {
    const network = GECKO_ONCHAIN_NETWORK[chainId];
    if (!network || addresses.length === 0) return {};

    // GeckoTerminal accepts up to 30 addresses per call; batch to avoid 414
    const BATCH = 30;
    const result = {};

    for (let i = 0; i < addresses.length; i += BATCH) {
        const batch = addresses.slice(i, i + BATCH);
        const addrStr = batch.join(',');
        const url = `https://api.geckoterminal.com/api/v2/simple/networks/${network}/token_price/${addrStr}`;
        try {
            const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
            if (!res.ok) {
                console.warn(`[price:T1] CoinGecko Onchain HTTP ${res.status} for ${network} batch#${Math.floor(i/BATCH)+1}`);
                continue;
            }
            const json = await res.json();
            const prices = json?.data?.attributes?.token_prices || {};
            for (const [addr, priceStr] of Object.entries(prices)) {
                const price = parseFloat(priceStr);
                if (!isNaN(price) && price > 0) {
                    result[addr.toLowerCase()] = price;
                }
            }
        } catch (err) {
            console.warn(`[price:T1] CoinGecko Onchain exception (batch#${Math.floor(i/BATCH)+1}):`, err.message);
        }
    }
    return result;
}

/**
 * TIER 2 — CoinGecko Simple Token Price
 * Fetches prices for contract addresses not resolved by Tier 1.
 *
 * @param {number}   chainId    - EVM chain ID
 * @param {string[]} addresses  - Lowercase contract addresses (only unresolved ones)
 * @returns {Promise<Object>}   - Map { lowercase_address → priceUsd }
 */
async function fetchCoinGeckoSimplePrices(chainId, addresses) {
    const platform = GECKO_PLATFORM[chainId];
    if (!platform || addresses.length === 0) return {};

    const addrStr = addresses.join(',');
    const url = `https://api.coingecko.com/api/v3/simple/token_price/${platform}?contract_addresses=${addrStr}&vs_currencies=usd`;
    try {
        const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
        if (res.status === 429) {
            console.warn(`[price:T2] CoinGecko Simple rate-limited (429) for chain ${chainId}`);
            await new Promise(r => setTimeout(r, 2000));
            const retry = await fetch(url, { headers: { 'Accept': 'application/json' } });
            if (!retry.ok) {
                console.warn(`[price:T2] CoinGecko Simple retry failed (${retry.status})`);
                return {};
            }
            const json = await retry.json();
            return normalizeCoinGeckoSimpleResponse(json);
        }
        if (!res.ok) {
            console.warn(`[price:T2] CoinGecko Simple HTTP ${res.status} for chain ${chainId}`);
            return {};
        }
        const json = await res.json();
        return normalizeCoinGeckoSimpleResponse(json);
    } catch (err) {
        console.warn(`[price:T2] CoinGecko Simple exception (chain ${chainId}):`, err.message);
        return {};
    }
}

function normalizeCoinGeckoSimpleResponse(json) {
    const result = {};
    for (const [addr, data] of Object.entries(json || {})) {
        const price = data?.usd;
        if (typeof price === 'number' && price > 0) {
            result[addr.toLowerCase()] = price;
        }
    }
    return result;
}

/**
 * TIER 3 — DexScreener fallback
 * For a single token address, queries DexScreener for trading pairs.
 * Applies safety scoring: must have priceUsd, must meet min liquidity.
 *
 * @param {string} address     - Token contract address (any case)
 * @param {number} chainId     - EVM chain ID (used to prefer same-chain pairs)
 * @returns {Promise<{ priceUsd:number, liquidityUsd:number, pairAddress:string, dexId:string, quoteSymbol:string }|null>}
 */
async function fetchDexScreenerPrice(address, chainId) {
    const url = `https://api.dexscreener.com/latest/dex/tokens/${address.toLowerCase()}`;
    try {
        const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
        if (!res.ok) {
            console.warn(`[price:T3] DexScreener HTTP ${res.status} for ${address}`);
            return null;
        }
        const json = await res.json();
        const pairs = json?.pairs || [];

        // Filter to valid pairs with a price and minimum liquidity
        const validPairs = pairs.filter(p =>
            p.priceUsd != null &&
            parseFloat(p.priceUsd) > 0 &&
            (p.liquidity?.usd || 0) >= DEXSCREENER_MIN_LIQUIDITY_USD
        );

        if (validPairs.length === 0) return null;

        // Score each pair — higher is better
        function scorePair(p) {
            let score = 0;
            score += Math.log10(Math.max(p.liquidity?.usd || 1, 1)) * 10; // liquidity (log scale)
            score += Math.log10(Math.max(p.volume?.h24 || 1, 1)) * 3;     // volume
            const txns = (p.txns?.h24?.buys || 0) + (p.txns?.h24?.sells || 0);
            score += Math.log10(Math.max(txns, 1)) * 2;                   // activity
            return score;
        }

        validPairs.sort((a, b) => scorePair(b) - scorePair(a));
        const best = validPairs[0];

        return {
            priceUsd:     parseFloat(best.priceUsd),
            liquidityUsd: best.liquidity?.usd || 0,
            pairAddress:  best.pairAddress || '',
            dexId:        best.dexId || '',
            quoteSymbol:  best.quoteToken?.symbol || '',
        };
    } catch (err) {
        console.warn(`[price:T3] DexScreener exception for ${address}:`, err.message);
        return null;
    }
}

/**
 * getTokenPrices — Full three-tier pricing pipeline
 *
 * @param {object} opts
 * @param {number}   opts.chainId           - EVM chain ID
 * @param {string[]} opts.contractAddresses  - Token contract addresses to price
 * @returns {Promise<{
 *   pricesByKey:      Object,
 *   sourcesByKey:     Object,
 *   reliabilityByKey: Object,
 *   metaByKey:        Object,
 *   unresolvedKeys:   string[],
 *   stats:            object,
 * }>}
 */
async function getTokenPrices({ chainId, contractAddresses }) {
    const pricesByKey      = {};
    const sourcesByKey     = {};
    const reliabilityByKey = {};
    const metaByKey        = {};

    const addrs = contractAddresses.map(a => a.toLowerCase()).filter(Boolean);
    if (addrs.length === 0) {
        return { pricesByKey, sourcesByKey, reliabilityByKey, metaByKey, unresolvedKeys: [], stats: {} };
    }

    const makeKey = addr => `token:${chainId}:${addr.toLowerCase()}`;

    // ── Tier 1: CoinGecko Onchain ──────────────────────────────────────────────
    const t1Start = Date.now();
    let t1Hits = 0;
    let t1Misses = 0;
    console.info(`[price:T1] Chain ${chainId}: sending ${addrs.length} contract(s) to CoinGecko Onchain`);
    const t1Prices = await fetchCoinGeckoOnchainPrices(chainId, addrs);

    for (const addr of addrs) {
        const key = makeKey(addr);
        const price = t1Prices[addr];
        if (price != null && price > 0) {
            pricesByKey[key]      = price;
            sourcesByKey[key]     = 'coingecko_onchain';
            reliabilityByKey[key] = 'high';
            t1Hits++;
        } else {
            t1Misses++;
        }
    }
    console.info(`[price:T1] Chain ${chainId}: ${t1Hits} hits / ${t1Misses} misses (${Date.now()-t1Start}ms)`);

    // ── Tier 2: CoinGecko Simple Token Price ───────────────────────────────────
    const unresolvedAfterT1 = addrs.filter(a => pricesByKey[makeKey(a)] == null);
    let t2Hits = 0;
    let t2Misses = 0;
    if (unresolvedAfterT1.length > 0) {
        const t2Start = Date.now();
        console.info(`[price:T2] Chain ${chainId}: sending ${unresolvedAfterT1.length} unresolved contract(s) to CoinGecko Simple`);
        const t2Prices = await fetchCoinGeckoSimplePrices(chainId, unresolvedAfterT1);

        for (const addr of unresolvedAfterT1) {
            const key   = makeKey(addr);
            const price = t2Prices[addr];
            if (price != null && price > 0) {
                pricesByKey[key]      = price;
                sourcesByKey[key]     = 'coingecko_simple';
                reliabilityByKey[key] = 'high';
                t2Hits++;
            } else {
                t2Misses++;
            }
        }
        console.info(`[price:T2] Chain ${chainId}: ${t2Hits} hits / ${t2Misses} misses (${Date.now()-t2Start}ms)`);
    }

    // ── Tier 3: DexScreener fallback ───────────────────────────────────────────
    const unresolvedAfterT2 = addrs.filter(a => pricesByKey[makeKey(a)] == null);
    let t3Accepted = 0;
    let t3Rejected = 0;
    if (unresolvedAfterT2.length > 0) {
        console.info(`[price:T3] Chain ${chainId}: querying DexScreener for ${unresolvedAfterT2.length} unresolved token(s)`);
        // Rate-limit: stagger DexScreener calls slightly
        for (const addr of unresolvedAfterT2) {
            const key    = makeKey(addr);
            const result = await fetchDexScreenerPrice(addr, chainId);
            if (result) {
                pricesByKey[key]      = result.priceUsd;
                sourcesByKey[key]     = 'dexscreener_fallback';
                reliabilityByKey[key] = 'low';
                metaByKey[key]        = {
                    liquidityUsd: result.liquidityUsd,
                    pairAddress:  result.pairAddress,
                    dexId:        result.dexId,
                    quoteSymbol:  result.quoteSymbol,
                };
                t3Accepted++;
            } else {
                t3Rejected++;
            }
        }
        console.info(`[price:T3] Chain ${chainId}: ${t3Accepted} accepted / ${t3Rejected} rejected`);
    }

    const unresolvedKeys = addrs
        .filter(a => pricesByKey[makeKey(a)] == null)
        .map(makeKey);

    const stats = {
        t1Requests: addrs.length, t1Hits, t1Misses,
        t2Requests: unresolvedAfterT1.length, t2Hits, t2Misses,
        t3Requests: unresolvedAfterT2.length, t3Accepted, t3Rejected,
        totalResolved: addrs.length - unresolvedKeys.length,
        totalUnresolved: unresolvedKeys.length,
    };

    console.info(`[price:SUMMARY] Chain ${chainId}:`,
        `resolved=${stats.totalResolved} unresolved=${stats.totalUnresolved}`,
        `| T1:${t1Hits} T2:${t2Hits} T3:${t3Accepted}`);

    return { pricesByKey, sourcesByKey, reliabilityByKey, metaByKey, unresolvedKeys, stats };
}

/**
 * Fetch native asset prices for multiple chains in a single batched CoinGecko call.
 *
 * @param {number[]} chainIds
 * @returns {Promise<Object>} Map { chainId → priceUsd }
 */
async function fetchNativeAssetPrices(chainIds) {
    // Build a unique set of gecko IDs and track which chainIds map to each
    const geckoIdToChainIds = {};
    for (const chainId of chainIds) {
        const geckoId = GECKO_NATIVE_ID[chainId];
        if (!geckoId) continue;
        if (!geckoIdToChainIds[geckoId]) geckoIdToChainIds[geckoId] = [];
        geckoIdToChainIds[geckoId].push(chainId);
    }

    const geckoIds = Object.keys(geckoIdToChainIds);
    if (geckoIds.length === 0) return {};

    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${geckoIds.join(',')}&vs_currencies=usd`;
    const chainPrices = {};
    try {
        const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
        if (!res.ok) {
            console.warn(`[price:NATIVE] CoinGecko simple/price HTTP ${res.status}`);
            return {};
        }
        const json = await res.json();
        for (const [geckoId, data] of Object.entries(json)) {
            const price = data?.usd;
            if (typeof price === 'number' && price > 0) {
                for (const chainId of (geckoIdToChainIds[geckoId] || [])) {
                    chainPrices[chainId] = price;
                }
            }
        }
        console.info(`[price:NATIVE] Resolved prices for chains:`, Object.keys(chainPrices).join(', '));
    } catch (err) {
        console.warn('[price:NATIVE] Exception:', err.message);
    }
    return chainPrices;
}

// ============= MULTICHAIN WALLET TOKEN ENDPOINT =============

/**
 * Scan a single chain for native + ERC-20 token balances.
 *
 * Failure isolation rules:
 *   - native fetch failure  → nativeBalance = null  (soft fail)
 *   - token fetch failure   → rawTokens = []        (soft fail)
 *   - BOTH fail             → throws               (hard fail → failedChains)
 *   - metadata failure      → never fails chain     (per-token allSettled)
 *   - price failure         → never fails chain     (try/catch around price block)
 *
 * @param {string} address      - Wallet address
 * @param {number} chainId      - EVM chain ID
 * @param {number} nativePrice  - Pre-fetched native asset price (USD)
 * @returns {Promise<{ chainId, chainName, holdings, totalChainUsd, partial, failureReasons }>}
 */
async function scanSingleChain(address, chainId, nativePrice) {
    const networkSlug = ALCHEMY_CHAIN_MAP[chainId];
    if (!networkSlug) throw new Error(`Unsupported chain: chainId ${chainId} has no Alchemy slug`);

    const nativeSymbol = CHAIN_NATIVE_SYMBOL[chainId] || 'ETH';
    const chainLabel   = CHAIN_LABELS[chainId] || `Chain ${chainId}`;
    const failureReasons = [];

    console.info(`[chain:START]  ${chainLabel} (chainId=${chainId}, network=${networkSlug}) — scanning ${address}`);

    // ── 1. Native balance (isolated) ─────────────────────────────────────────
    let nativeBalance = null;   // null = fetch failed
    let hexNative     = null;
    let nativeFailed  = false;
    try {
        hexNative     = await alchemyRpc(networkSlug, 'eth_getBalance', [address, 'latest']);
        nativeBalance = Number(BigInt(hexNative)) / 1e18;
        console.info(`[chain:NATIVE] ${chainLabel}: ${nativeBalance.toFixed(6)} ${nativeSymbol} ✓`);
    } catch (nativeErr) {
        nativeFailed = true;
        const reason = nativeErr.message || String(nativeErr);
        failureReasons.push(`native: ${reason}`);
        console.warn(`[chain:NATIVE] ${chainLabel}: FAILED — ${reason}`);
    }

    // ── 2. ERC-20 / BEP-20 token balances (isolated) ─────────────────────────
    let rawTokens   = [];
    let tokenFailed = false;
    try {
        const tokenData = await alchemyRpc(networkSlug, 'alchemy_getTokenBalances', [address, 'erc20']);
        rawTokens = (tokenData?.tokenBalances || []).filter(t => {
            if (!t.tokenBalance || t.tokenBalance === '0x0') return false;
            try { return BigInt(t.tokenBalance) > 0n; } catch { return false; }
        });
        console.info(`[chain:TOKENS] ${chainLabel}: ${rawTokens.length} non-zero ERC-20 token(s) ✓`);
    } catch (tokenErr) {
        tokenFailed = true;
        const reason = tokenErr.message || String(tokenErr);
        failureReasons.push(`tokens: ${reason}`);
        console.warn(`[chain:TOKENS] ${chainLabel}: FAILED — ${reason}`);
    }

    // ── Hard-fail only if BOTH native AND token fetch failed ──────────────────
    if (nativeFailed && tokenFailed) {
        const reason = failureReasons.join('; ');
        console.error(`[chain:FAIL]   ${chainLabel}: HARD FAIL (both native and token fetch failed) — ${reason}`);
        throw new Error(reason);
    }

    const isPartial = nativeFailed || tokenFailed;
    if (isPartial) {
        console.warn(`[chain:PARTIAL] ${chainLabel}: partial result (${nativeFailed ? 'native missing' : 'token list missing'})`);
    }

    // ── 3. Token metadata (per-token isolated via allSettled) ─────────────────
    const tokensToFetch = rawTokens.slice(0, 50);
    let metaOk = 0;
    let metaFail = 0;
    const metaResults = await Promise.allSettled(
        tokensToFetch.map(async (token) => {
            let meta = null;
            try {
                meta = await alchemyRpc(networkSlug, 'alchemy_getTokenMetadata', [token.contractAddress]);
            } catch (metaErr) {
                // metadata failure is always soft — use defaults
            }
            const decimals = (meta?.decimals != null && meta.decimals >= 0) ? meta.decimals : 18;
            let quantity = 0;
            try {
                const rawBal = BigInt(token.tokenBalance || '0x0');
                quantity = Number(rawBal) / Math.pow(10, decimals);
            } catch { quantity = 0; }

            return {
                symbol:          meta?.symbol || null,
                name:            meta?.name   || 'Unknown Token',
                decimals,
                quantity,
                contractAddress: token.contractAddress,
                logoUrl:         meta?.logo   || null,
                rawBalance:      token.tokenBalance,
                metaOk:          !!meta?.symbol,
            };
        })
    );

    // Collect enriched tokens — include tokens even without symbol (quantity > 0 is what matters)
    const enrichedTokens = metaResults
        .filter(r => r.status === 'fulfilled')
        .map(r => {
            if (r.value.metaOk) metaOk++; else metaFail++;
            return r.value;
        })
        .filter(t => t.quantity > 0.000001);  // dust filter only — keep even if no symbol

    console.info(`[chain:META]   ${chainLabel}: ${metaOk} OK / ${metaFail} failed / ${enrichedTokens.length} tokens kept`);

    // ── 4. USD prices via three-tier engine (isolated) ───────────────────────
    // Native price comes pre-fetched as a batched call from the multichain runner.
    // Token prices are resolved via Tier1→Tier2→Tier3 per chain.
    const nativeUsdPrice = (typeof nativePrice === 'number' && nativePrice > 0) ? nativePrice : 0;
    console.info(`[chain:PRICE]  ${chainLabel}: native ${nativeSymbol} = $${nativeUsdPrice} (pre-fetched)`);

    let pricingResult = { pricesByKey: {}, sourcesByKey: {}, reliabilityByKey: {}, metaByKey: {}, unresolvedKeys: [], stats: {} };
    try {
        const contractList = enrichedTokens.map(t => t.contractAddress).filter(Boolean);
        if (contractList.length > 0) {
            pricingResult = await getTokenPrices({ chainId, contractAddresses: contractList });
        }
    } catch (priceErr) {
        console.warn(`[chain:PRICE]  ${chainLabel}: price engine exception — ${priceErr.message} (continuing without prices)`);
    }

    const { pricesByKey, sourcesByKey, reliabilityByKey, metaByKey } = pricingResult;

    // ── 5. Build normalized holdings ─────────────────────────────────────────
    const holdings = [];

    // Native coin — skip only if balance is null (fetch failed) or genuinely zero
    if (nativeBalance !== null && nativeBalance > 0.000001) {
        const nativeValueUsd = parseFloat((nativeBalance * nativeUsdPrice).toFixed(2));
        holdings.push({
            walletAddress:    address,
            chainId,
            chainName:        chainLabel,
            symbol:           nativeSymbol,
            name:             `${nativeSymbol} (Native)`,
            contractAddress:  null,
            decimals:         18,
            rawBalance:       hexNative,
            formattedBalance: parseFloat(nativeBalance.toFixed(8)),
            priceUsd:         nativeUsdPrice,
            valueUsd:         nativeValueUsd,
            logoUrl:          null,
            isNative:         true,
            isPriced:         nativeUsdPrice > 0,
            pricingSource:    nativeUsdPrice > 0 ? 'coingecko_simple' : null,
            pricingReliability: nativeUsdPrice > 0 ? 'high' : null,
            pricingMeta:      null,
            // Plaid-compatible shape for renderHoldings()
            quantity:          parseFloat(nativeBalance.toFixed(8)),
            institution_price: nativeUsdPrice,
            usdValue:          nativeValueUsd,
            sourceType:        'wallet',
            security: {
                name:          `${nativeSymbol} (Native)`,
                type:          'Crypto',
                ticker_symbol: nativeSymbol,
                logo_url:      null,
            },
            chain: chainLabel,
        });
    }

    // ERC-20 / BEP-20 tokens — include even if no symbol/price
    for (const token of enrichedTokens) {
        // Skip only true zero-quantity tokens
        if (token.quantity <= 0) continue;

        const contractKey   = (token.contractAddress || '').toLowerCase();
        const pKey          = `token:${chainId}:${contractKey}`;
        const usdPrice      = pricesByKey[pKey] ?? 0;
        const usdValue      = parseFloat((token.quantity * usdPrice).toFixed(2));
        const displaySymbol = token.symbol || 'UNKNOWN';
        const pSource       = sourcesByKey[pKey]       || null;
        const pReliability  = reliabilityByKey[pKey]   || null;
        const pMeta         = metaByKey[pKey]          || null;

        holdings.push({
            walletAddress:    address,
            chainId,
            chainName:        chainLabel,
            symbol:           displaySymbol,
            name:             token.name,
            contractAddress:  token.contractAddress,
            decimals:         token.decimals,
            rawBalance:       token.rawBalance,
            formattedBalance: parseFloat(token.quantity.toFixed(8)),
            priceUsd:         usdPrice,
            valueUsd:         usdValue,
            logoUrl:          token.logoUrl || null,
            isNative:         false,
            isPriced:         usdPrice > 0,
            pricingSource:    pSource,
            pricingReliability: pReliability,
            pricingMeta:      pMeta,
            // Plaid-compatible shape
            quantity:          parseFloat(token.quantity.toFixed(8)),
            institution_price: usdPrice,
            usdValue,
            sourceType:        'wallet',
            security: {
                name:          token.name,
                type:          'Crypto',
                ticker_symbol: displaySymbol,
                logo_url:      token.logoUrl || null,
            },
            chain: chainLabel,
        });
    }

    // Sort by USD value descending; unpriced assets go to bottom
    holdings.sort((a, b) => (b.valueUsd || 0) - (a.valueUsd || 0));

    const totalChainUsd = holdings.reduce((s, h) => s + (h.valueUsd || 0), 0);
    const chainPricedCount   = holdings.filter(h => h.isPriced).length;
    const chainUnpricedCount = holdings.length - chainPricedCount;
    console.info(`[chain:RESULT] ${chainLabel}: ${holdings.length} asset(s) | priced=${chainPricedCount} unpriced=${chainUnpricedCount} | $${totalChainUsd.toFixed(2)} USD | partial=${isPartial}`);

    return {
        chainId,
        chainName:      chainLabel,
        holdings,
        totalChainUsd:  parseFloat(totalChainUsd.toFixed(2)),
        partial:        isPartial,
        failureReasons: failureReasons.length ? failureReasons : undefined,
    };
}

/**
 * GET /api/wallet-tokens-multichain?address=0x...&noCache=1
 *
 * Scans all SUPPORTED_PORTFOLIO_CHAINS for the given wallet address in
 * parallel and returns a unified multichain portfolio payload.
 *
 * - Per-chain failures are isolated (Promise.allSettled) — partial results
 *   are returned with failed chains listed in `failedChains`.
 * - Cache is keyed by address only (TTL 5 min), bypassed with noCache=1.
 */
app.get('/api/wallet-tokens-multichain', async (req, res) => {
    const apiKey = process.env.ALCHEMY_API_KEY;
    if (!apiKey) {
        return res.status(503).json({
            error: 'Alchemy API key not configured. Add ALCHEMY_API_KEY to .env.'
        });
    }

    const { address, noCache } = req.query;

    if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
        return res.status(400).json({ error: 'Invalid or missing wallet address.' });
    }

    console.info(`\n[multichain] ═══ Multichain scan started for ${address} ═══`);
    console.info(`[multichain] Chains to scan: ${SUPPORTED_PORTFOLIO_CHAINS.join(', ')}`);

    // Serve from cache if available
    if (noCache !== '1') {
        const cached = getCachedMultichain(address);
        if (cached) {
            console.info(`[multichain] Cache HIT for ${address}`);
            return res.json({ ...cached, fromCache: true });
        }
    } else {
        console.info(`[multichain] Cache BYPASS requested (noCache=1)`);
    }

    // Pre-fetch all native asset prices in a single batched CoinGecko call
    console.info(`[multichain] Pre-fetching native asset prices for ${SUPPORTED_PORTFOLIO_CHAINS.length} chains...`);
    const nativePrices = await fetchNativeAssetPrices(SUPPORTED_PORTFOLIO_CHAINS);
    console.info(`[multichain] Native prices resolved:`, Object.entries(nativePrices).map(([k,v]) => `chain${k}=$${v}`).join(', '));

    // Scan all supported chains in parallel — Promise.allSettled isolates per-chain errors
    const chainResults = await Promise.allSettled(
        SUPPORTED_PORTFOLIO_CHAINS.map(chainId => scanSingleChain(address, chainId, nativePrices[chainId] || 0))
    );

    const successfulChains = [];  // fully or partially successful
    const failedChains     = [];  // both native AND token fetch failed
    const partialChains    = [];  // one of native/token failed but chain still has results

    for (let i = 0; i < chainResults.length; i++) {
        const chainId    = SUPPORTED_PORTFOLIO_CHAINS[i];
        const chainLabel = CHAIN_LABELS[chainId] || `Chain ${chainId}`;
        const result     = chainResults[i];

        if (result.status === 'fulfilled') {
            successfulChains.push(result.value);
            if (result.value.partial) {
                partialChains.push({
                    chainId,
                    chainName:      chainLabel,
                    reason:         (result.value.failureReasons || []).join('; '),
                    holdingsCount:  result.value.holdings.length,
                });
                console.warn(`[multichain] ~ ${chainLabel}: PARTIAL success — ${(result.value.failureReasons || []).join('; ')}`);
            } else {
                console.info(`[multichain] ✓ ${chainLabel}: full success (${result.value.holdings.length} holdings)`);
            }
        } else {
            const reason = result.reason?.message || String(result.reason);
            console.error(`[multichain] ✗ ${chainLabel}: HARD FAIL — ${reason}`);
            failedChains.push({ chainId, chainName: chainLabel, reason });
        }
    }

    // Build aggregated data structures
    const chainGroupedHoldings = {};
    const chainTotals          = {};
    const allHoldingsFlat      = [];

    for (const chain of successfulChains) {
        if (chain.holdings.length > 0) {
            chainGroupedHoldings[chain.chainName] = chain.holdings;
            chainTotals[chain.chainName]           = chain.totalChainUsd;
            allHoldingsFlat.push(...chain.holdings);
        }
    }

    // Sort flat holdings by USD value descending; unpriced assets go to bottom
    allHoldingsFlat.sort((a, b) => (b.valueUsd || 0) - (a.valueUsd || 0));

    const totalPortfolioValueUsd = parseFloat(
        successfulChains.reduce((s, c) => s + c.totalChainUsd, 0).toFixed(2)
    );

    // Priced / unpriced counts for the UI
    const pricedHoldingsCount    = allHoldingsFlat.filter(h => h.isPriced).length;
    const unpricedHoldingsCount  = allHoldingsFlat.length - pricedHoldingsCount;
    const fallbackPricedCount    = allHoldingsFlat.filter(h => h.pricingSource === 'dexscreener_fallback').length;
    const reliablePricedCount    = allHoldingsFlat.filter(h => h.isPriced && h.pricingSource !== 'dexscreener_fallback').length;
    const unpricedSymbols = allHoldingsFlat
        .filter(h => !h.isPriced)
        .map(h => h.symbol)
        .filter(Boolean);

    const topHoldings = allHoldingsFlat
        .filter(h => h.isPriced)           // only priced assets in top-5
        .slice(0, 5)
        .map(h => ({
            symbol:   h.symbol,
            name:     h.name,
            chain:    h.chainName,
            valueUsd: h.valueUsd,
            pct: totalPortfolioValueUsd > 0
                ? ((h.valueUsd / totalPortfolioValueUsd) * 100).toFixed(1)
                : '0',
        }));

    const activeChains = Object.keys(chainGroupedHoldings).length;

    console.info(`[multichain] ═══ Scan complete ═══`);
    console.info(`[multichain] Active chains: ${activeChains} | Partial: ${partialChains.length} | Failed: ${failedChains.length}`);
    console.info(`[multichain] Holdings: ${allHoldingsFlat.length} asset(s) total | priced=${pricedHoldingsCount} | unpriced=${unpricedHoldingsCount}`);
    console.info(`[multichain] totalPortfolioValueUsd: $${totalPortfolioValueUsd.toFixed(2)} USD`);
    if (failedChains.length > 0) {
        console.warn(`[multichain] Hard-failed chains: ${failedChains.map(c => c.chainName).join(', ')}`);
    }
    if (unpricedHoldingsCount > 0) {
        console.info(`[multichain] Unpriced symbols: ${unpricedSymbols.slice(0, 20).join(', ')}`);
    }

    const payload = {
        walletAddress:         address,
        totalPortfolioValueUsd,
        chainTotals,
        topHoldings,
        chainGroupedHoldings,
        allHoldingsFlat,
        activeChains,
        scannedChains:         SUPPORTED_PORTFOLIO_CHAINS.length,
        pricedHoldingsCount,
        unpricedHoldingsCount,
        fallbackPricedCount,
        reliablePricedCount,
        unpricedSymbols,
        failedChains,                          // [ { chainId, chainName, reason } ]
        partialChains,                         // [ { chainId, chainName, reason, holdingsCount } ]
        fetchedAt: new Date().toISOString(),
    };

    setCachedMultichain(address, payload);
    res.json(payload);
});

// ============= SERVE FRONTEND =============

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ── 404 catch-all for unmatched API routes ──────────────────────────────────
app.use('/api', (req, res) => {
    res.status(404).json({ error: `API route not found: ${req.method} ${req.path}` });
});

// ── Global error handler (must be last, after all routes) ───────────────────
// Catches any unhandled synchronous throws and next(err) calls.
// Without this, Express falls back to its built-in plain-text error page
// which causes "Unexpected token" JSON parse failures on the frontend.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
    console.error('[server] Unhandled error:', err?.message || err);
    const status = (typeof err?.status === 'number') ? err.status : 500;
    res.status(status).json({
        error: err?.message || 'Internal server error',
    });
});

// Start Server
app.listen(PORT, () => {
    console.log(`✅ NeuroWealth Server running at http://localhost:${PORT}/`);
    console.log(`📊 Plaid Environment: ${process.env.PLAID_ENV}`);

    // ── Runtime config verification ─────────────────────────────────────────
    console.log('\n[config] ALCHEMY_API_KEY present:', !!process.env.ALCHEMY_API_KEY);
    console.log('[config] ALCHEMY_CHAIN_MAP entries:');
    for (const [chainId, slug] of Object.entries(ALCHEMY_CHAIN_MAP)) {
        const inPortfolio = SUPPORTED_PORTFOLIO_CHAINS.includes(Number(chainId));
        console.log(`  chainId=${chainId.padStart(8)} → ${slug}${inPortfolio ? ' ✓ (portfolio chain)' : ''}`);
    }
    console.log(`[config] Multichain endpoint: GET http://localhost:${PORT}/api/wallet-tokens-multichain?address=0x...`);
    console.log('[config] Supported portfolio chains:', SUPPORTED_PORTFOLIO_CHAINS.join(', '), '\n');
});

