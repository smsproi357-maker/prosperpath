import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid';

function getAllowedOrigins(env) {
    const configured = (env.ALLOWED_ORIGINS || '')
        .split(',')
        .map(v => v.trim())
        .filter(Boolean);

    if (configured.length > 0) return configured;
    return ['http://localhost:3000', 'http://localhost:3005', 'http://127.0.0.1:3000', 'http://127.0.0.1:3005'];
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
                    access_token: accessToken,
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
