import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid';
import { handleWalletTokens, handleWalletTokensMultichain } from './wallet-tokens.js';
import { handleWaitlist } from './waitlist.js';

function getAllowedOrigins(env) {
    const configured = (env.ALLOWED_ORIGINS || '')
        .split(',')
        .map(v => v.trim())
        .filter(Boolean);

    if (configured.length > 0) return configured;
    return ['http://localhost:3000', 'http://localhost:3005', 'http://127.0.0.1:3000', 'http://127.0.0.1:3005', 'https://prosperpath.pages.dev'];
}

function getCorsHeaders(request, env) {
    const origin = request.headers.get('Origin');
    const allowedOrigins = getAllowedOrigins(env);
    const allowOrigin = origin && allowedOrigins.includes(origin) ? origin : 'null';

    return {
        'Access-Control-Allow-Origin': allowOrigin,
        'Vary': 'Origin',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };
}

function isPrivateHost(hostname) {
    const host = (hostname || '').toLowerCase();
    if (!host) return true;
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.local')) return true;
    if (host.startsWith('10.') || host.startsWith('192.168.') || host.startsWith('169.254.')) return true;
    if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return true;
    return false;
}

function isSafeProxyTarget(rawUrl) {
    try {
        const parsed = new URL(rawUrl);
        if (!['http:', 'https:'].includes(parsed.protocol)) return false;
        if (isPrivateHost(parsed.hostname)) return false;
        return true;
    } catch {
        return false;
    }
}

function isValidGoogleTokenPayload(payload, env) {
    if (!payload) return false;
    const issuer = payload.iss;
    if (issuer !== 'https://accounts.google.com' && issuer !== 'accounts.google.com') return false;
    if (payload.exp && Number(payload.exp) * 1000 < Date.now()) return false;
    if (env.GOOGLE_CLIENT_ID && payload.aud !== env.GOOGLE_CLIENT_ID) return false;
    return !!payload.sub;
}

// Helper: Get User from Authorization Header
async function getAuthenticatedUser(request, env) {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) return { error: 'Missing Authorization header' };
    if (!authHeader.startsWith('Bearer ')) return { error: 'Invalid Authorization format (must be Bearer)' };

    const idToken = authHeader.split(' ')[1];
    if (!idToken || idToken === 'null' || idToken === 'undefined') return { error: 'Token is null or undefined' };

    // Validate with Google's tokeninfo endpoint
    try {
        const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`);
        if (!res.ok) {
            const errorBody = await res.text();
            console.error('Google Token Validation Failed:', errorBody);
            return { error: `Google validation failed: ${res.status} ${errorBody}` };
        }
        const payload = await res.json();
        if (!isValidGoogleTokenPayload(payload, env)) return { error: 'Invalid token claims' };
        return payload;
    } catch (e) {
        console.error('Auth Fetch Error:', e);
        return { error: `Internal auth check error: ${e.message}` };
    }
}

// ============================================================
// Finance Query Detector (server-side)
// Mirrors the old client-side isFinanceQuery() from ai-widget.js.
// Used to trigger BASELINE automatic source retrieval even when
// the web icon (webMode) is OFF — matching old OpenRouter behavior.
// ============================================================
function isFinanceQuery(text) {
    if (!text) return false;
    const lower = text.toLowerCase();
    const keywords = [
        'price', 'market', 'stock', 'crypto', 'yahoo', 'bloomberg', 'live', 'now', 'today',
        'news', 'earnings', 'fed', 'rate', 'invest', 'fund', 'etf', 'forex', 'gold', 'oil',
        'bitcoin', 'btc', 'ethereum', 'eth', 'nifty', 'sensex', 's&p', 'dow', 'nasdaq',
        'ipo', 'dividend', 'portfolio', 'inflation', 'gdp', 'recession', 'rally', 'crash',
        'trade', 'bond', 'yield', 'commodit', 'currency', 'exchange rate', 'hedge', 'mutual fund'
    ];
    return keywords.some(k => lower.includes(k));
}

// ============================================================
// Tavily Web Search Helper (server-side only)
//
// BASELINE mode (enhanced=false): Called automatically for any
//   finance-related query, even when webMode=false.
//   Adds "live financial data" bias to focus on finance sources.
//
// ENHANCED mode (enhanced=true): Called when webMode=true.
//   Runs broader/fresher retrieval on top of baseline.
//
// API key lives exclusively in Worker env secrets.
// ============================================================
async function fetchTavilyContext(query, apiKey, enhanced = false) {
    try {
        // Enrich baseline finance queries to bias toward finance/news sources
        const searchQuery = enhanced
            ? query  // Enhanced: use query as-is for broader results
            : `${query} live financial data stock market news`;  // Baseline: finance-biased

        const label = enhanced ? '[Tavily Enhanced]' : '[Tavily Baseline]';
        console.log(label, 'Searching for:', searchQuery.substring(0, 120));

        const res = await fetch('https://api.tavily.com/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                api_key: apiKey,
                query: searchQuery,
                search_depth: 'basic', // free tvly-dev-* keys only support 'basic'
                include_answer: true,
                max_results: enhanced ? 5 : 3  // baseline: 3 sources; enhanced: 5 sources
            })
        });
        if (!res.ok) {
            const errBody = await res.text().catch(() => '');
            console.warn(label, 'Search failed:', res.status, errBody);
            return null;
        }
        const data = await res.json();
        console.log(label, 'Success:', data.results?.length ?? 0, 'results');
        return data;
    } catch (e) {
        console.warn('[Tavily] Search error:', e.message);
        return null;
    }
}

function buildTavilyContextString(tavilyData, label = 'WEB SEARCH') {
    if (!tavilyData) return '';
    let ctx = `\n\n--- ${label} RESULTS (use for accurate, up-to-date information) ---\n`;
    if (tavilyData.answer) ctx += `Quick Answer: ${tavilyData.answer}\n`;
    if (tavilyData.results?.length) {
        ctx += 'Sources:\n';
        tavilyData.results.forEach((r, i) => {
            ctx += `${i + 1}. [${r.title || 'Source'}] ${(r.content || '').substring(0, 300)}\n   URL: ${r.url}\n`;
        });
    }
    ctx += `--- END ${label} RESULTS ---\n`;
    return ctx;
}

export default {
    async fetch(request, env, ctx) {
        const corsHeaders = getCorsHeaders(request, env);

        // Handle CORS preflight requests
        if (request.method === 'OPTIONS') {
            return new Response(null, {
                headers: corsHeaders,
            });
        }

        const url = new URL(request.url);
        const path = url.pathname;

        // Pass ctx so waitlist handler can use ctx.waitUntil for fire-and-forget email
        env.__ctx = ctx;

        // ── Waitlist endpoint (public — no auth required) ─────────────────────
        if (path === '/api/waitlist' && request.method === 'POST') {
            return handleWaitlist(request, env, corsHeaders);
        }

        // Initialize Plaid Client
        const configuration = new Configuration({
            basePath: PlaidEnvironments[env.PLAID_ENV || 'sandbox'],
            baseOptions: {
                headers: {
                    'PLAID-CLIENT-ID': env.PLAID_CLIENT_ID,
                    'PLAID-SECRET': env.PLAID_SECRET,
                },
            },
        });

        const plaidClient = new PlaidApi(configuration);

        try {
            // --- AUTH ROUTES ---

            // POST /api/auth/google
            if (path === '/api/auth/google' && request.method === 'POST') {
                const { token } = await request.json();
                const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${token}`);
                if (!res.ok) {
                    return new Response(JSON.stringify({ error: 'Invalid Google Token' }), { status: 401, headers: corsHeaders });
                }

                const googleUser = await res.json();
                if (!isValidGoogleTokenPayload(googleUser, env)) {
                    return new Response(JSON.stringify({ error: 'Invalid token claims' }), { status: 401, headers: corsHeaders });
                }

                // Save/Update user profile in KV if needed
                await env.USER_DATA.put(`user:${googleUser.sub}:profile`, JSON.stringify({
                    name: googleUser.name,
                    email: googleUser.email,
                    picture: googleUser.picture,
                    lastLogin: Date.now()
                }));

                return new Response(JSON.stringify({
                    user: googleUser,
                    session_token: token // We use the ID token as session token for now
                }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            // --- USER DATA ROUTES ---

            // GET /api/user/data
            if (path === '/api/user/data' && request.method === 'GET') {
                const result = await getAuthenticatedUser(request, env);
                if (result.error) return new Response(result.error, { status: 401, headers: corsHeaders });
                const user = result;

                const watchlist = await env.USER_DATA.get(`user:${user.sub}:watchlist`, 'json');
                const chatSessions = await env.USER_DATA.get(`user:${user.sub}:chat_sessions`, 'json');

                return new Response(JSON.stringify({
                    watchlist: watchlist || [],
                    chat_sessions: chatSessions || []
                }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            // POST /api/user/chat
            if (path === '/api/user/chat' && request.method === 'POST') {
                const authResult = await getAuthenticatedUser(request, env);
                if (authResult.error) return new Response(authResult.error, { status: 401, headers: corsHeaders });
                const user = authResult;

                const { sessions } = await request.json();
                await env.USER_DATA.put(`user:${user.sub}:chat_sessions`, JSON.stringify(sessions));

                return new Response(JSON.stringify({ success: true }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            // POST /api/user/watchlist
            if (path === '/api/user/watchlist' && request.method === 'POST') {
                const authResult = await getAuthenticatedUser(request, env);
                if (authResult.error) return new Response(authResult.error, { status: 401, headers: corsHeaders });
                const user = authResult;

                const { watchlist } = await request.json();
                await env.USER_DATA.put(`user:${user.sub}:watchlist`, JSON.stringify(watchlist));

                return new Response(JSON.stringify({ success: true }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            // --- PROXY ---
            if (path === '/proxy' && request.method === 'GET') {
                const targetUrl = url.searchParams.get('url');
                if (!targetUrl) {
                    return new Response('Missing url parameter', { status: 400, headers: corsHeaders });
                }
                if (!isSafeProxyTarget(targetUrl)) {
                    return new Response('Blocked proxy target', { status: 403, headers: corsHeaders });
                }

                try {
                    const response = await fetch(targetUrl, {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                        }
                    });

                    const contentType = response.headers.get('content-type') || 'text/html';
                    const text = await response.text();

                    return new Response(text, {
                        headers: {
                            ...corsHeaders,
                            'Content-Type': contentType
                        }
                    });
                } catch (e) {
                    return new Response('Failed to fetch content: ' + e.message, { status: 500, headers: corsHeaders });
                }
            }

            // --- PLAID ROUTES (AUTH REQUIRED) ---

            // GET /api/status
            if (path === '/api/status' && request.method === 'GET') {
                const result = await getAuthenticatedUser(request, env);
                if (result.error) return new Response(JSON.stringify({ connected: false, error: result.error }), { headers: corsHeaders });
                const user = result;

                const sessionData = await env.USER_DATA.get(`user:${user.sub}:plaid`, 'json');
                return new Response(JSON.stringify({
                    connected: !!sessionData?.accessToken,
                    item_id: sessionData?.itemId
                }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            // POST /api/create_link_token
            if (path === '/api/create_link_token' && request.method === 'POST') {
                const authResult = await getAuthenticatedUser(request, env);
                if (authResult.error) return new Response(authResult.error, { status: 401, headers: corsHeaders });
                const user = authResult;

                const client_user_id = `user-${user.sub}`;

                const configs = {
                    user: { client_user_id },
                    client_name: 'NeuroWealth',
                    products: ['investments'],
                    country_codes: ['US'],
                    language: 'en',
                };

                const createTokenResponse = await plaidClient.linkTokenCreate(configs);
                return new Response(JSON.stringify(createTokenResponse.data), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            // POST /api/set_access_token
            if (path === '/api/set_access_token' && request.method === 'POST') {
                const authResult = await getAuthenticatedUser(request, env);
                if (authResult.error) return new Response(authResult.error, { status: 401, headers: corsHeaders });
                const user = authResult;

                const body = await request.json();
                const public_token = body.public_token;

                const tokenResponse = await plaidClient.itemPublicTokenExchange({
                    public_token: public_token,
                });

                const accessToken = tokenResponse.data.access_token;
                const itemId = tokenResponse.data.item_id;

                // Save to KV per user
                await env.USER_DATA.put(`user:${user.sub}:plaid`, JSON.stringify({
                    accessToken,
                    itemId,
                    updatedAt: Date.now()
                }));

                return new Response(JSON.stringify({
                    item_id: itemId,
                }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            // GET /api/holdings
            if (path === '/api/holdings' && request.method === 'GET') {
                const authResult = await getAuthenticatedUser(request, env);
                if (authResult.error) return new Response(authResult.error, { status: 401, headers: corsHeaders });
                const user = authResult;

                const sessionData = await env.USER_DATA.get(`user:${user.sub}:plaid`, 'json');
                if (!sessionData?.accessToken) {
                    return new Response(JSON.stringify({ error: 'No account linked' }), { status: 400, headers: corsHeaders });
                }

                const holdingsResponse = await plaidClient.investmentsHoldingsGet({
                    access_token: sessionData.accessToken,
                });

                const { holdings, securities, accounts } = holdingsResponse.data;
                const securityMap = {};
                securities.forEach(s => securityMap[s.security_id] = s);

                const joinedHoldings = holdings.map(h => ({
                    ...h,
                    security: securityMap[h.security_id] || { name: 'Unknown Security' }
                }));

                return new Response(JSON.stringify({
                    holdings: joinedHoldings,
                    accounts: accounts,
                    securities: securities
                }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            // GET /api/transactions
            if (path === '/api/transactions' && request.method === 'GET') {
                const authResult = await getAuthenticatedUser(request, env);
                if (authResult.error) return new Response(authResult.error, { status: 401, headers: corsHeaders });
                const user = authResult;

                const sessionData = await env.USER_DATA.get(`user:${user.sub}:plaid`, 'json');
                if (!sessionData?.accessToken) {
                    return new Response(JSON.stringify({ error: 'No account linked' }), { status: 400, headers: corsHeaders });
                }

                const endDate = new Date();
                const startDate = new Date();
                startDate.setDate(startDate.getDate() - 90);

                const transactionsResponse = await plaidClient.investmentsTransactionsGet({
                    access_token: sessionData.accessToken,
                    start_date: startDate.toISOString().split('T')[0],
                    end_date: endDate.toISOString().split('T')[0],
                });

                const { investment_transactions, securities } = transactionsResponse.data;
                const securityMap = {};
                securities.forEach(s => securityMap[s.security_id] = s);

                const joinedTransactions = investment_transactions.map(t => ({
                    ...t,
                    security: securityMap[t.security_id] || { name: 'Unknown Security' }
                }));

                return new Response(JSON.stringify({
                    investment_transactions: joinedTransactions,
                    securities: securities
                }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            // ============================================================
            // POST /api/ai/chat — AI Provider Proxy
            // TEMPORARY: Routes all AI requests through Sarvam by default.
            // To restore OpenRouter: set AI_PROVIDER=openrouter in env.
            // ============================================================
            if (path === '/api/ai/chat' && request.method === 'POST') {
                let body;
                try {
                    body = await request.json();
                } catch {
                    return new Response(JSON.stringify({ error: 'Invalid request body' }), {
                        status: 400,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                    });
                }

                const { messages, webMode } = body;
                if (!messages || !Array.isArray(messages)) {
                    return new Response(JSON.stringify({ error: 'messages array is required' }), {
                        status: 400,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                    });
                }

                // TEMPORARY — SARVAM FORCED ROUTING
                // AI_PROVIDER env var controls which provider is active.
                // Current default: sarvam. Fallback (preserved, dormant): openrouter.
                // To roll back: set AI_PROVIDER=openrouter (no code changes needed).
                const activeProvider = (env.AI_PROVIDER || 'sarvam').toLowerCase();

                // ============================================================
                // SOURCE RETRIEVAL — Two-tier architecture (restored):
                //
                // A. BASELINE (always-on for finance queries, web icon OFF or ON)
                //    Mirrors old OpenRouter behavior: automatically detects finance
                //    queries and fetches grounded context from finance/news sources.
                //
                // B. ENHANCED (web icon ON only)
                //    Runs on top of baseline when webMode=true for broader/fresher
                //    retrieval with a broader query scope.
                //
                // C. Sarvam consumes the combined grounded context to produce final answer.
                // ============================================================

                // Extract the user's latest query for source retrieval
                const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
                let rawContent = typeof lastUserMsg?.content === 'string'
                    ? lastUserMsg.content
                    : (Array.isArray(lastUserMsg?.content)
                        ? lastUserMsg.content.filter(p => p.type === 'text').map(p => p.text).join(' ')
                        : '');
                // Strip system instructions prefix to get the clean user query
                const sysPrefixMatch = rawContent.match(/^\[System Instructions:[\s\S]*?\]\n\n/);
                const searchQuery = sysPrefixMatch ? rawContent.slice(sysPrefixMatch[0].length).trim() : rawContent.trim();

                console.log('[AI Proxy] webMode:', webMode, '| TAVILY_API_KEY present:', !!env.TAVILY_API_KEY, '| isFinanceQuery:', isFinanceQuery(searchQuery));

                let baselineData = null;   // Tier A: always-on finance baseline
                let enhancedData = null;   // Tier B: web icon ON enhanced search
                let allSources = [];       // Combined sources for UI rendering

                if (env.TAVILY_API_KEY && searchQuery) {

                    // ---- TIER A: BASELINE RETRIEVAL ----
                    // Always run for finance-related queries regardless of web icon state.
                    // This restores the old OpenRouter-era behavior where the chatbot could
                    // access finance/news sources (Yahoo Finance, Bloomberg, Reuters, etc.)
                    // even when the web search toggle was OFF.
                    if (isFinanceQuery(searchQuery)) {
                        console.log('[Baseline] Finance query detected — running automatic source retrieval');
                        baselineData = await fetchTavilyContext(searchQuery, env.TAVILY_API_KEY, false);
                        if (baselineData?.results?.length) {
                            const baselineSources = baselineData.results.map(r => ({
                                title: r.title || 'Source',
                                url: r.url || '#',
                                content: (r.content || '').substring(0, 300),
                                tier: 'baseline'
                            }));
                            allSources.push(...baselineSources);
                            console.log('[Baseline] Retrieved', baselineSources.length, 'sources');
                        } else {
                            console.warn('[Baseline] No results returned — Sarvam will answer from own knowledge');
                        }
                    } else {
                        console.log('[Baseline] Skipped — not a finance/market query');
                    }

                    // ---- TIER B: ENHANCED RETRIEVAL (web icon ON) ----
                    // Run broader search on top of baseline when user explicitly enables web mode.
                    if (webMode === true) {
                        console.log('[Enhanced] Web icon ON — running enhanced source retrieval');
                        enhancedData = await fetchTavilyContext(searchQuery, env.TAVILY_API_KEY, true);
                        if (enhancedData?.results?.length) {
                            const enhancedSources = enhancedData.results.map(r => ({
                                title: r.title || 'Source',
                                url: r.url || '#',
                                content: (r.content || '').substring(0, 300),
                                tier: 'enhanced'
                            }));
                            // Add enhanced sources that aren't already in baseline (dedup by URL)
                            const existingUrls = new Set(allSources.map(s => s.url));
                            const newSources = enhancedSources.filter(s => !existingUrls.has(s.url));
                            allSources.push(...newSources);
                            console.log('[Enhanced] Added', newSources.length, 'new sources');
                        } else {
                            console.warn('[Enhanced] webMode=true but no enhanced results returned');
                        }
                    }

                } else if (!env.TAVILY_API_KEY) {
                    console.warn('[Tavily] TAVILY_API_KEY not set — all source retrieval skipped');
                }

                // ---- INJECT CONTEXT INTO MESSAGES ----
                // Build combined context string from all retrieved sources.
                // Baseline context is injected first, enhanced context appended after.
                let enrichedMessages = messages;
                const hasBaselineContext = baselineData?.results?.length > 0;
                const hasEnhancedContext = enhancedData?.results?.length > 0;

                if (hasBaselineContext || hasEnhancedContext) {
                    let combinedContextStr = '';
                    if (hasBaselineContext) {
                        combinedContextStr += buildTavilyContextString(baselineData, 'FINANCE & NEWS SOURCE');
                    }
                    if (hasEnhancedContext) {
                        combinedContextStr += buildTavilyContextString(enhancedData, 'ENHANCED WEB SEARCH');
                    }

                    enrichedMessages = messages.map((m, idx) => {
                        // Inject into the first user message
                        if (m.role === 'user' && idx === messages.findIndex(x => x.role === 'user')) {
                            const originalContent = typeof m.content === 'string' ? m.content : m.content;
                            if (typeof originalContent === 'string') {
                                return { ...m, content: originalContent + combinedContextStr };
                            }
                            if (Array.isArray(originalContent)) {
                                const parts = originalContent.map((p, pi) =>
                                    pi === 0 && p.type === 'text'
                                        ? { ...p, text: p.text + combinedContextStr }
                                        : p
                                );
                                return { ...m, content: parts };
                            }
                        }
                        return m;
                    });
                }

                try {
                    let aiResponse;

                    if (activeProvider === 'sarvam') {
                        // ---- SARVAM PROVIDER (ACTIVE) ----
                        // Use enrichedMessages (may include injected web context)
                        const sarvamKey = env.SARVAM_API_KEY;
                        if (!sarvamKey) {
                            return new Response(JSON.stringify({ error: 'Sarvam API key not configured on server' }), {
                                status: 503,
                                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                            });
                        }

                        // Sarvam requires `content` to be a plain string, not an OpenAI-style
                        // multipart array ([{type:'text',text:'...'}]). Normalize here.
                        const normalizeContent = (content) => {
                            if (typeof content === 'string') return content;
                            if (Array.isArray(content)) {
                                return content
                                    .filter(p => p && p.type === 'text')
                                    .map(p => p.text || '')
                                    .join('\n')
                                    .trim();
                            }
                            return String(content ?? '');
                        };
                        const sarvamMessages = enrichedMessages.map(m => ({
                            role: m.role,
                            content: normalizeContent(m.content)
                        }));

                        // Sarvam requires: turns must alternate, starting with user (or system).
                        // Strip any leading assistant messages (e.g. the chatbot welcome greeting
                        // stored in history) until the first user or system message is reached.
                        while (sarvamMessages.length > 0 && sarvamMessages[0].role === 'assistant') {
                            sarvamMessages.shift();
                        }

                        if (sarvamMessages.length === 0) {
                            return new Response(JSON.stringify({ error: 'No valid user message to send' }), {
                                status: 400,
                                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                            });
                        }

                        console.log('[AI Proxy] Sending to Sarvam. Message count:', sarvamMessages.length);

                        // TEMPORARY: Ignore any requested model — always use Sarvam model.
                        // Sarvam uses OpenAI-compatible chat completions endpoint.
                        const sarvamRes = await fetch('https://api.sarvam.ai/v1/chat/completions', {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bearer ${sarvamKey}`,
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                                model: 'sarvam-m', // Sarvam general-purpose model
                                messages: sarvamMessages
                            })
                        });

                        if (!sarvamRes.ok) {
                            const errText = await sarvamRes.text();
                            let errMsg = `Sarvam API error: ${sarvamRes.status}`;
                            try {
                                const errData = JSON.parse(errText);
                                errMsg = errData.error?.message || errMsg;
                            } catch { /* ignore parse error */ }
                            console.error('[AI Proxy] Sarvam error:', errMsg);
                            return new Response(JSON.stringify({ error: errMsg }), {
                                status: sarvamRes.status,
                                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                            });
                        }

                        aiResponse = await sarvamRes.json();

                    } else {
                        // ---- OPENROUTER PROVIDER (PRESERVED FALLBACK — DORMANT) ----
                        // This path is only reached when AI_PROVIDER=openrouter.
                        // All original OpenRouter logic is preserved here.
                        const openrouterKey = env.OPENROUTER_API_KEY;
                        if (!openrouterKey) {
                            return new Response(JSON.stringify({ error: 'OpenRouter API key not configured on server' }), {
                                status: 503,
                                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                            });
                        }

                        const requestedModel = body.model || 'zhipu/glm-4.5-air';
                        const orRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bearer ${openrouterKey}`,
                                'HTTP-Referer': 'https://prosperpath.pages.dev',
                                'X-Title': 'ProsperPath AI',
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                                model: requestedModel,
                                messages: enrichedMessages
                            })
                        });

                        if (!orRes.ok) {
                            const errText = await orRes.text();
                            let errMsg = `OpenRouter API error: ${orRes.status}`;
                            try {
                                const errData = JSON.parse(errText);
                                errMsg = errData.error?.message || errMsg;
                            } catch { /* ignore parse error */ }
                            console.error('[AI Proxy] OpenRouter error:', errMsg);
                            return new Response(JSON.stringify({ error: errMsg }), {
                                status: orRes.status,
                                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                            });
                        }

                        aiResponse = await orRes.json();
                    }

                    // Return the OpenAI-compatible response shape.
                    // Include sources array when any retrieval tier returned results.
                    // This covers both web-icon-OFF (baseline) and web-icon-ON (enhanced) cases.
                    const finalResponse = allSources.length > 0
                        ? { ...aiResponse, sources: allSources }
                        : aiResponse;
                    return new Response(JSON.stringify(finalResponse), {
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                    });

                } catch (aiErr) {
                    console.error('[AI Proxy] Unexpected error:', aiErr);
                    return new Response(JSON.stringify({
                        error: `AI proxy error: ${aiErr.message || 'Unknown error'}`
                    }), {
                        status: 500,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                    });
                }
            }
            // ============================================================
            // END AI Provider Proxy
            // ============================================================

            // ── Wallet-token endpoints ─────────────────────────────────────
            // Handled by wallet-tokens.js — runs directly in the Worker using
            // the ALCHEMY_API_KEY secret. No local backend required.
            if (path === '/api/wallet-tokens-multichain' && request.method === 'GET') {
                return handleWalletTokensMultichain(request, env, corsHeaders);
            }
            if (path === '/api/wallet-tokens' && request.method === 'GET') {
                return handleWalletTokens(request, env, corsHeaders);
            }

            return new Response('Not Found', { status: 404, headers: corsHeaders });


        } catch (error) {
            console.error('Worker Error:', error);
            const errorMessage = error.response ? JSON.stringify(error.response.data) : error.message;
            return new Response(JSON.stringify({ error: errorMessage }), {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }
    },
};
