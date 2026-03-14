// ============================================================
// wallet-tokens.js — Cloudflare Worker module
//
// Ports the /api/wallet-tokens and /api/wallet-tokens-multichain
// endpoints from server.js so they run directly in the Worker,
// enabling production wallet scanning without a local backend.
//
// Alchemy API key is stored as a Worker secret: ALCHEMY_API_KEY
// ============================================================

// ── Chain configuration ──────────────────────────────────────────────────────

const ALCHEMY_CHAIN_MAP = {
    1:        'eth-mainnet',
    56:       'bnb-mainnet',
    137:      'polygon-mainnet',
    42161:    'arb-mainnet',
    8453:     'base-mainnet',
    10:       'opt-mainnet',
    43114:    'avax-mainnet',
};

const CHAIN_NATIVE_SYMBOL = {
    1: 'ETH', 56: 'BNB', 137: 'MATIC',
    42161: 'ETH', 8453: 'ETH', 10: 'ETH', 43114: 'AVAX',
};

const CHAIN_LABELS = {
    1: 'Ethereum', 56: 'BNB Chain', 137: 'Polygon',
    42161: 'Arbitrum', 8453: 'Base', 10: 'Optimism', 43114: 'Avalanche C-Chain',
};

const GECKO_PLATFORM = {
    1: 'ethereum', 56: 'binance-smart-chain', 137: 'polygon-pos',
    42161: 'arbitrum-one', 8453: 'base', 10: 'optimistic-ethereum', 43114: 'avalanche',
};

const GECKO_ONCHAIN_NETWORK = {
    1: 'eth', 56: 'bsc', 137: 'polygon_pos',
    42161: 'arbitrum', 8453: 'base', 10: 'optimism', 43114: 'avax',
};

const GECKO_NATIVE_ID = {
    1: 'ethereum', 56: 'binancecoin', 137: 'matic-network',
    42161: 'ethereum', 8453: 'ethereum', 10: 'ethereum', 43114: 'avalanche-2',
};

const SUPPORTED_PORTFOLIO_CHAINS = [1, 56, 137, 42161, 8453, 10, 43114];
const DEXSCREENER_MIN_LIQUIDITY_USD = 500;

// ── Simple in-memory cache (Workers restart frequently, so this is best-effort) ──
const _cache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getCache(key) {
    const entry = _cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.ts > CACHE_TTL_MS) { _cache.delete(key); return null; }
    return entry.data;
}
function setCache(key, data) {
    _cache.set(key, { ts: Date.now(), data });
    if (_cache.size > 100) _cache.delete(_cache.keys().next().value);
}

// ── Alchemy JSON-RPC helper ──────────────────────────────────────────────────

async function alchemyRpc(networkSlug, method, params, apiKey) {
    const url = `https://${networkSlug}.g.alchemy.com/v2/${apiKey}`;
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    if (response.status === 403) {
        throw new Error(
            `Alchemy 403 Forbidden for ${networkSlug}. ` +
            `This network is not enabled for your API key. ` +
            `Go to dashboard.alchemy.com → your app → "Networks" and add ${networkSlug}.`
        );
    }
    if (!response.ok) throw new Error(`Alchemy HTTP ${response.status} for ${method} on ${networkSlug}`);
    const json = await response.json();
    if (json.error) throw new Error(`Alchemy error: ${json.error.message}`);
    return json.result;
}

// ── Pricing Tier 1: CoinGecko Onchain (GeckoTerminal) ───────────────────────

async function fetchCoinGeckoOnchainPrices(chainId, addresses) {
    const network = GECKO_ONCHAIN_NETWORK[chainId];
    if (!network || addresses.length === 0) return {};
    const BATCH = 30;
    const result = {};
    for (let i = 0; i < addresses.length; i += BATCH) {
        const batch = addresses.slice(i, i + BATCH).join(',');
        const url = `https://api.geckoterminal.com/api/v2/simple/networks/${network}/token_price/${batch}`;
        try {
            const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
            if (!res.ok) continue;
            const json = await res.json();
            const prices = json?.data?.attributes?.token_prices || {};
            for (const [addr, priceStr] of Object.entries(prices)) {
                const price = parseFloat(priceStr);
                if (!isNaN(price) && price > 0) result[addr.toLowerCase()] = price;
            }
        } catch (_) { /* soft fail */ }
    }
    return result;
}

// ── Pricing Tier 2: CoinGecko Simple Token Price ─────────────────────────────

async function fetchCoinGeckoSimplePrices(chainId, addresses) {
    const platform = GECKO_PLATFORM[chainId];
    if (!platform || addresses.length === 0) return {};
    const url = `https://api.coingecko.com/api/v3/simple/token_price/${platform}?contract_addresses=${addresses.join(',')}&vs_currencies=usd`;
    try {
        const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
        if (res.status === 429) {
            await new Promise(r => setTimeout(r, 2000));
            const retry = await fetch(url, { headers: { 'Accept': 'application/json' } });
            if (!retry.ok) return {};
            return normalizeCGSimple(await retry.json());
        }
        if (!res.ok) return {};
        return normalizeCGSimple(await res.json());
    } catch (_) { return {}; }
}

function normalizeCGSimple(json) {
    const result = {};
    for (const [addr, data] of Object.entries(json || {})) {
        const price = data?.usd;
        if (typeof price === 'number' && price > 0) result[addr.toLowerCase()] = price;
    }
    return result;
}

// ── Pricing Tier 3: DexScreener fallback ────────────────────────────────────

async function fetchDexScreenerPrice(address) {
    const url = `https://api.dexscreener.com/latest/dex/tokens/${address.toLowerCase()}`;
    try {
        const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
        if (!res.ok) return null;
        const json = await res.json();
        const validPairs = (json?.pairs || []).filter(p =>
            p.priceUsd != null &&
            parseFloat(p.priceUsd) > 0 &&
            (p.liquidity?.usd || 0) >= DEXSCREENER_MIN_LIQUIDITY_USD
        );
        if (validPairs.length === 0) return null;
        function score(p) {
            return Math.log10(Math.max(p.liquidity?.usd || 1, 1)) * 10 +
                   Math.log10(Math.max(p.volume?.h24 || 1, 1)) * 3;
        }
        validPairs.sort((a, b) => score(b) - score(a));
        const best = validPairs[0];
        return {
            priceUsd:     parseFloat(best.priceUsd),
            liquidityUsd: best.liquidity?.usd || 0,
            pairAddress:  best.pairAddress || '',
            dexId:        best.dexId || '',
            quoteSymbol:  best.quoteToken?.symbol || '',
        };
    } catch (_) { return null; }
}

// ── Full 3-tier price engine ─────────────────────────────────────────────────

async function getTokenPrices({ chainId, contractAddresses }) {
    const pricesByKey = {}, sourcesByKey = {}, reliabilityByKey = {}, metaByKey = {};
    const addrs = contractAddresses.map(a => a.toLowerCase()).filter(Boolean);
    if (addrs.length === 0) return { pricesByKey, sourcesByKey, reliabilityByKey, metaByKey, unresolvedKeys: [], stats: {} };

    const makeKey = addr => `token:${chainId}:${addr.toLowerCase()}`;

    // Tier 1
    const t1Prices = await fetchCoinGeckoOnchainPrices(chainId, addrs);
    let t1Hits = 0, t1Misses = 0;
    for (const addr of addrs) {
        const key = makeKey(addr), price = t1Prices[addr];
        if (price != null && price > 0) {
            pricesByKey[key] = price; sourcesByKey[key] = 'coingecko_onchain'; reliabilityByKey[key] = 'high'; t1Hits++;
        } else { t1Misses++; }
    }

    // Tier 2
    const unresT1 = addrs.filter(a => pricesByKey[makeKey(a)] == null);
    let t2Hits = 0, t2Misses = 0;
    if (unresT1.length > 0) {
        const t2Prices = await fetchCoinGeckoSimplePrices(chainId, unresT1);
        for (const addr of unresT1) {
            const key = makeKey(addr), price = t2Prices[addr];
            if (price != null && price > 0) {
                pricesByKey[key] = price; sourcesByKey[key] = 'coingecko_simple'; reliabilityByKey[key] = 'high'; t2Hits++;
            } else { t2Misses++; }
        }
    }

    // Tier 3
    const unresT2 = addrs.filter(a => pricesByKey[makeKey(a)] == null);
    let t3Accepted = 0, t3Rejected = 0;
    for (const addr of unresT2) {
        const key = makeKey(addr);
        const result = await fetchDexScreenerPrice(addr);
        if (result) {
            pricesByKey[key] = result.priceUsd; sourcesByKey[key] = 'dexscreener_fallback';
            reliabilityByKey[key] = 'low'; metaByKey[key] = result; t3Accepted++;
        } else { t3Rejected++; }
    }

    const unresolvedKeys = addrs.filter(a => pricesByKey[makeKey(a)] == null).map(makeKey);
    const stats = { t1Hits, t1Misses, t2Hits, t2Misses, t3Accepted, t3Rejected,
        totalResolved: addrs.length - unresolvedKeys.length, totalUnresolved: unresolvedKeys.length };
    return { pricesByKey, sourcesByKey, reliabilityByKey, metaByKey, unresolvedKeys, stats };
}

// ── Native asset prices (batched CoinGecko call) ─────────────────────────────

async function fetchNativeAssetPrices(chainIds) {
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
        if (!res.ok) return {};
        const json = await res.json();
        for (const [geckoId, data] of Object.entries(json)) {
            const price = data?.usd;
            if (typeof price === 'number' && price > 0) {
                for (const chainId of (geckoIdToChainIds[geckoId] || [])) chainPrices[chainId] = price;
            }
        }
    } catch (_) { /* soft fail */ }
    return chainPrices;
}

// ── Single chain scanner ─────────────────────────────────────────────────────

async function scanSingleChain(address, chainId, nativePrice, apiKey) {
    const networkSlug = ALCHEMY_CHAIN_MAP[chainId];
    if (!networkSlug) throw new Error(`Unsupported chain: ${chainId}`);

    const nativeSymbol = CHAIN_NATIVE_SYMBOL[chainId] || 'ETH';
    const chainLabel   = CHAIN_LABELS[chainId] || `Chain ${chainId}`;
    const failureReasons = [];

    // 1. Native balance
    let nativeBalance = null, hexNative = null, nativeFailed = false;
    try {
        hexNative     = await alchemyRpc(networkSlug, 'eth_getBalance', [address, 'latest'], apiKey);
        nativeBalance = Number(BigInt(hexNative)) / 1e18;
    } catch (e) { nativeFailed = true; failureReasons.push(`native: ${e.message}`); }

    // 2. ERC-20 tokens
    let rawTokens = [], tokenFailed = false;
    try {
        const tokenData = await alchemyRpc(networkSlug, 'alchemy_getTokenBalances', [address, 'erc20'], apiKey);
        rawTokens = (tokenData?.tokenBalances || []).filter(t => {
            if (!t.tokenBalance || t.tokenBalance === '0x0') return false;
            try { return BigInt(t.tokenBalance) > 0n; } catch { return false; }
        });
    } catch (e) { tokenFailed = true; failureReasons.push(`tokens: ${e.message}`); }

    if (nativeFailed && tokenFailed) throw new Error(failureReasons.join('; '));
    const isPartial = nativeFailed || tokenFailed;

    // 3. Token metadata
    const tokensToFetch = rawTokens.slice(0, 50);
    const metaResults = await Promise.allSettled(
        tokensToFetch.map(async (token) => {
            let meta = null;
            try { meta = await alchemyRpc(networkSlug, 'alchemy_getTokenMetadata', [token.contractAddress], apiKey); } catch (_) {}
            const decimals = (meta?.decimals != null && meta.decimals >= 0) ? meta.decimals : 18;
            let quantity = 0;
            try { quantity = Number(BigInt(token.tokenBalance || '0x0')) / Math.pow(10, decimals); } catch {}
            return {
                symbol: meta?.symbol || null, name: meta?.name || 'Unknown Token',
                decimals, quantity, contractAddress: token.contractAddress,
                logoUrl: meta?.logo || null, rawBalance: token.tokenBalance, metaOk: !!meta?.symbol,
            };
        })
    );

    const enrichedTokens = metaResults
        .filter(r => r.status === 'fulfilled')
        .map(r => r.value)
        .filter(t => t.quantity > 0.000001);

    // 4. Prices
    const nativeUsdPrice = (typeof nativePrice === 'number' && nativePrice > 0) ? nativePrice : 0;
    let pricingResult = { pricesByKey: {}, sourcesByKey: {}, reliabilityByKey: {}, metaByKey: {} };
    try {
        const contractList = enrichedTokens.map(t => t.contractAddress).filter(Boolean);
        if (contractList.length > 0) pricingResult = await getTokenPrices({ chainId, contractAddresses: contractList });
    } catch (_) {}
    const { pricesByKey, sourcesByKey, reliabilityByKey, metaByKey } = pricingResult;

    // 5. Build holdings
    const holdings = [];

    if (nativeBalance !== null && nativeBalance > 0.000001) {
        const nativeValueUsd = parseFloat((nativeBalance * nativeUsdPrice).toFixed(2));
        holdings.push({
            walletAddress: address, chainId, chainName: chainLabel,
            symbol: nativeSymbol, name: `${nativeSymbol} (Native)`,
            contractAddress: null, decimals: 18, rawBalance: hexNative,
            formattedBalance: parseFloat(nativeBalance.toFixed(8)),
            priceUsd: nativeUsdPrice, valueUsd: nativeValueUsd,
            logoUrl: null, isNative: true, isPriced: nativeUsdPrice > 0,
            pricingSource: nativeUsdPrice > 0 ? 'coingecko_simple' : null,
            pricingReliability: nativeUsdPrice > 0 ? 'high' : null, pricingMeta: null,
            quantity: parseFloat(nativeBalance.toFixed(8)), institution_price: nativeUsdPrice,
            usdValue: nativeValueUsd, sourceType: 'wallet',
            security: { name: `${nativeSymbol} (Native)`, type: 'Crypto', ticker_symbol: nativeSymbol, logo_url: null },
            chain: chainLabel,
        });
    }

    for (const token of enrichedTokens) {
        if (token.quantity <= 0) continue;
        const contractKey  = (token.contractAddress || '').toLowerCase();
        const pKey         = `token:${chainId}:${contractKey}`;
        const usdPrice     = pricesByKey[pKey] ?? 0;
        const usdValue     = parseFloat((token.quantity * usdPrice).toFixed(2));
        const displaySymbol = token.symbol || 'UNKNOWN';
        holdings.push({
            walletAddress: address, chainId, chainName: chainLabel,
            symbol: displaySymbol, name: token.name,
            contractAddress: token.contractAddress, decimals: token.decimals,
            rawBalance: token.rawBalance,
            formattedBalance: parseFloat(token.quantity.toFixed(8)),
            priceUsd: usdPrice, valueUsd: usdValue,
            logoUrl: token.logoUrl || null, isNative: false, isPriced: usdPrice > 0,
            pricingSource: sourcesByKey[pKey] || null,
            pricingReliability: reliabilityByKey[pKey] || null,
            pricingMeta: metaByKey[pKey] || null,
            quantity: parseFloat(token.quantity.toFixed(8)), institution_price: usdPrice,
            usdValue, sourceType: 'wallet',
            security: { name: token.name, type: 'Crypto', ticker_symbol: displaySymbol, logo_url: token.logoUrl || null },
            chain: chainLabel,
        });
    }

    holdings.sort((a, b) => (b.valueUsd || 0) - (a.valueUsd || 0));
    const totalChainUsd = holdings.reduce((s, h) => s + (h.valueUsd || 0), 0);

    return {
        chainId, chainName: chainLabel, holdings,
        totalChainUsd: parseFloat(totalChainUsd.toFixed(2)),
        partial: isPartial,
        failureReasons: failureReasons.length ? failureReasons : undefined,
    };
}

// ── Route handlers (called from index.js) ────────────────────────────────────

/**
 * Handle GET /api/wallet-tokens?address=0x...&chainId=1
 */
export async function handleWalletTokens(request, env, corsHeaders) {
    const apiKey = env.ALCHEMY_API_KEY;
    if (!apiKey) {
        return new Response(JSON.stringify({ error: 'ALCHEMY_API_KEY not configured on the server.' }), {
            status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    const url = new URL(request.url);
    const address   = url.searchParams.get('address') || '';
    const chainIdStr = url.searchParams.get('chainId') || '';
    const noCache   = url.searchParams.get('noCache') === '1';
    const chainId   = parseInt(chainIdStr, 10);

    if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
        return new Response(JSON.stringify({ error: 'Invalid or missing wallet address.' }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
    if (isNaN(chainId)) {
        return new Response(JSON.stringify({ error: 'Invalid or missing chainId.' }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    const networkSlug = ALCHEMY_CHAIN_MAP[chainId];
    if (!networkSlug) {
        return new Response(JSON.stringify({
            unsupported: true, chainId,
            chainName: CHAIN_LABELS[chainId] || `Chain ${chainId}`, holdings: [],
        }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const cacheKey = `wt:${address.toLowerCase()}:${chainId}`;
    if (!noCache) {
        const cached = getCache(cacheKey);
        if (cached) return new Response(JSON.stringify({ ...cached, fromCache: true }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    try {
        const nativeSymbol  = CHAIN_NATIVE_SYMBOL[chainId] || 'ETH';
        const chainLabel    = CHAIN_LABELS[chainId] || `Chain ${chainId}`;

        const hexNativeBalance = await alchemyRpc(networkSlug, 'eth_getBalance', [address, 'latest'], apiKey);
        const nativeBalance    = Number(BigInt(hexNativeBalance)) / 1e18;

        const tokenData = await alchemyRpc(networkSlug, 'alchemy_getTokenBalances', [address, 'erc20'], apiKey);
        const rawTokens = (tokenData?.tokenBalances || []).filter(t => t.tokenBalance && t.tokenBalance !== '0x0');

        const tokensToFetch  = rawTokens.slice(0, 50);
        const tokenMetaResults = await Promise.allSettled(
            tokensToFetch.map(async (token) => {
                const meta     = await alchemyRpc(networkSlug, 'alchemy_getTokenMetadata', [token.contractAddress], apiKey).catch(() => null);
                const decimals = (meta?.decimals != null && meta.decimals >= 0) ? meta.decimals : 18;
                const quantity = Number(BigInt(token.tokenBalance || '0x0')) / Math.pow(10, decimals);
                return {
                    symbol: meta?.symbol || '???', name: meta?.name || 'Unknown Token',
                    decimals, quantity, contractAddress: token.contractAddress,
                    logoUrl: meta?.logo || null, chain: chainLabel, rawBalance: token.tokenBalance,
                };
            })
        );

        const enrichedTokens = tokenMetaResults
            .filter(r => r.status === 'fulfilled')
            .map(r => r.value)
            .filter(t => t.quantity > 0.000001 && t.symbol !== '???');

        // Prices
        let priceMap = {};
        try {
            const contractAddresses = enrichedTokens.map(t => t.contractAddress).join(',');
            const geckoNetwork = GECKO_PLATFORM[chainId] || 'ethereum';
            if (contractAddresses) {
                const geckoRes = await fetch(
                    `https://api.coingecko.com/api/v3/simple/token_price/${geckoNetwork}?contract_addresses=${contractAddresses}&vs_currencies=usd`,
                    { headers: { 'Accept': 'application/json' } }
                );
                if (geckoRes.ok) priceMap = await geckoRes.json();
            }
            const nativeGeckoId = GECKO_NATIVE_ID[chainId] || 'ethereum';
            const nativePriceRes = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${nativeGeckoId}&vs_currencies=usd`);
            if (nativePriceRes.ok) {
                const d = await nativePriceRes.json();
                priceMap['_native'] = d[nativeGeckoId]?.usd || 0;
            }
        } catch (_) {}

        const holdings = [];
        const nativeUsdPrice = priceMap['_native'] || 0;
        if (nativeBalance > 0.000001) {
            holdings.push({
                quantity: parseFloat(nativeBalance.toFixed(8)), institution_price: nativeUsdPrice,
                security: { name: `${nativeSymbol} (Native)`, type: 'Crypto', ticker_symbol: nativeSymbol },
                chain: chainLabel, contractAddress: null,
                usdValue: parseFloat((nativeBalance * nativeUsdPrice).toFixed(2)), sourceType: 'wallet',
            });
        }
        for (const token of enrichedTokens) {
            const priceEntry = priceMap[token.contractAddress?.toLowerCase()] || {};
            const usdPrice = priceEntry.usd || 0;
            const usdValue = parseFloat((token.quantity * usdPrice).toFixed(2));
            if (usdValue === 0 && token.quantity <= 0) continue;
            holdings.push({
                quantity: parseFloat(token.quantity.toFixed(8)), institution_price: usdPrice,
                security: { name: token.name, type: 'Crypto', ticker_symbol: token.symbol, logo_url: token.logoUrl || null },
                chain: token.chain, contractAddress: token.contractAddress,
                usdValue, sourceType: 'wallet', isNative: false,
            });
        }
        holdings.sort((a, b) => b.usdValue - a.usdValue);
        const totalUsd = parseFloat(holdings.reduce((s, h) => s + (h.usdValue || 0), 0).toFixed(2));

        const payload = { holdings, address, chainId, chainName: chainLabel, nativeSymbol, totalUsd, fetchedAt: new Date().toISOString() };
        setCache(cacheKey, payload);

        return new Response(JSON.stringify(payload), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    } catch (err) {
        return new Response(JSON.stringify({ error: `Failed to fetch token balances: ${err.message}` }), {
            status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
}

/**
 * Handle GET /api/wallet-tokens-multichain?address=0x...&noCache=1
 */
export async function handleWalletTokensMultichain(request, env, corsHeaders) {
    const apiKey = env.ALCHEMY_API_KEY;
    if (!apiKey) {
        return new Response(JSON.stringify({ error: 'ALCHEMY_API_KEY not configured on the server.' }), {
            status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    const url = new URL(request.url);
    const address = url.searchParams.get('address') || '';
    const noCache = url.searchParams.get('noCache') === '1';

    if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
        return new Response(JSON.stringify({ error: 'Invalid or missing wallet address.' }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    const cacheKey = `wt-multi:${address.toLowerCase()}`;
    if (!noCache) {
        const cached = getCache(cacheKey);
        if (cached) return new Response(JSON.stringify({ ...cached, fromCache: true }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    // Pre-fetch native prices (batched)
    const nativePrices = await fetchNativeAssetPrices(SUPPORTED_PORTFOLIO_CHAINS);

    // Scan all chains in parallel
    const chainResults = await Promise.allSettled(
        SUPPORTED_PORTFOLIO_CHAINS.map(chainId => scanSingleChain(address, chainId, nativePrices[chainId] || 0, apiKey))
    );

    const successfulChains = [], failedChains = [], partialChains = [];
    for (let i = 0; i < chainResults.length; i++) {
        const chainId    = SUPPORTED_PORTFOLIO_CHAINS[i];
        const chainLabel = CHAIN_LABELS[chainId] || `Chain ${chainId}`;
        const result     = chainResults[i];
        if (result.status === 'fulfilled') {
            successfulChains.push(result.value);
            if (result.value.partial) {
                partialChains.push({ chainId, chainName: chainLabel, reason: (result.value.failureReasons || []).join('; '), holdingsCount: result.value.holdings.length });
            }
        } else {
            failedChains.push({ chainId, chainName: chainLabel, reason: result.reason?.message || String(result.reason) });
        }
    }

    const chainGroupedHoldings = {}, chainTotals = {}, allHoldingsFlat = [];
    for (const chain of successfulChains) {
        if (chain.holdings.length > 0) {
            chainGroupedHoldings[chain.chainName] = chain.holdings;
            chainTotals[chain.chainName]           = chain.totalChainUsd;
            allHoldingsFlat.push(...chain.holdings);
        }
    }
    allHoldingsFlat.sort((a, b) => (b.valueUsd || 0) - (a.valueUsd || 0));

    const totalPortfolioValueUsd   = parseFloat(successfulChains.reduce((s, c) => s + c.totalChainUsd, 0).toFixed(2));
    const pricedHoldingsCount      = allHoldingsFlat.filter(h => h.isPriced).length;
    const unpricedHoldingsCount    = allHoldingsFlat.length - pricedHoldingsCount;
    const fallbackPricedCount      = allHoldingsFlat.filter(h => h.pricingSource === 'dexscreener_fallback').length;
    const reliablePricedCount      = allHoldingsFlat.filter(h => h.isPriced && h.pricingSource !== 'dexscreener_fallback').length;
    const unpricedSymbols          = allHoldingsFlat.filter(h => !h.isPriced).map(h => h.symbol).filter(Boolean);
    const activeChains             = Object.keys(chainGroupedHoldings).length;

    const topHoldings = allHoldingsFlat.filter(h => h.isPriced).slice(0, 5).map(h => ({
        symbol: h.symbol, name: h.name, chain: h.chainName, valueUsd: h.valueUsd,
        pct: totalPortfolioValueUsd > 0 ? ((h.valueUsd / totalPortfolioValueUsd) * 100).toFixed(1) : '0',
    }));

    const payload = {
        walletAddress: address, totalPortfolioValueUsd, chainTotals, topHoldings,
        chainGroupedHoldings, allHoldingsFlat, activeChains,
        scannedChains: SUPPORTED_PORTFOLIO_CHAINS.length,
        pricedHoldingsCount, unpricedHoldingsCount, fallbackPricedCount, reliablePricedCount,
        unpricedSymbols, failedChains, partialChains, fetchedAt: new Date().toISOString(),
    };

    setCache(cacheKey, payload);
    return new Response(JSON.stringify(payload), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
}
