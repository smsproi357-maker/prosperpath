const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT     = 3005;
const API_PORT = 3000; // server.js Express API server

const MIME_TYPES = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.wav': 'audio/wav',
    '.mp4': 'video/mp4',
    '.woff': 'application/font-woff',
    '.ttf': 'application/font-ttf',
    '.eot': 'application/vnd.ms-fontobject',
    '.otf': 'application/font-otf',
    '.wasm': 'application/wasm'
};

const server = http.createServer((req, res) => {
    const isPrivateHost = (hostname) => {
        if (!hostname) return true;
        const host = hostname.toLowerCase();
        if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.local')) return true;
        if (host.startsWith('10.') || host.startsWith('192.168.') || host.startsWith('169.254.')) return true;
        if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return true;
        return false;
    };

    const isSafeProxyTarget = (rawUrl) => {
        try {
            const parsed = new URL(rawUrl);
            if (!['http:', 'https:'].includes(parsed.protocol)) return false;
            if (isPrivateHost(parsed.hostname)) return false;
            return true;
        } catch {
            return false;
        }
    };

    let urlPath = req.url.split('?')[0];

    // ── API PROXY ──────────────────────────────────────────────────────────────
    // Forward all /api/* requests to server.js running on port 3000.
    // THIS IS THE ROOT FIX: without this, /api/* hits the static file server
    // which returns "404 Not Found" (plain text). JSON.parse("404 Not Found")
    // parses "404" as a valid number, then chokes at " N" (position 4) causing:
    //   "Unexpected non-whitespace character after JSON at position 4"
    if (urlPath.startsWith('/api/') || urlPath === '/api') {
        const proxyOptions = {
            hostname: 'localhost',
            port: API_PORT,
            path: req.url,
            method: req.method,
            headers: { ...req.headers, host: `localhost:${API_PORT}` },
        };

        const proxyReq = http.request(proxyOptions, (proxyRes) => {
            // Forward status and headers from the API server
            res.writeHead(proxyRes.statusCode, {
                ...proxyRes.headers,
                'Access-Control-Allow-Origin': '*',
            });
            proxyRes.pipe(res, { end: true });
        });

        proxyReq.on('error', (err) => {
            // server.js is not running — return a clear JSON 503
            // so the frontend parser never sees plain text again
            if (!res.headersSent) {
                res.writeHead(503, {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                });
                res.end(JSON.stringify({
                    error: `API server is not running on port ${API_PORT}. Start it with: node server.js`,
                    hint: 'Run `node server.js` in a second terminal from the neurowealth directory.',
                    code: 'API_SERVER_OFFLINE',
                }));
            }
        });

        // Forward request body (for POST etc.)
        req.pipe(proxyReq, { end: true });
        return;
    }
    // ── END API PROXY ──────────────────────────────────────────────────────────

    if (urlPath === '/proxy') {
        const queryUrl = new URL(req.url, `http://${req.headers.host}`).searchParams.get('url');
        if (!queryUrl) {
            res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ error: 'Missing "url" query parameter' }));
            return;
        }

        if (!isSafeProxyTarget(queryUrl)) {
            res.writeHead(403, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ error: 'Blocked proxy target' }));
            return;
        }

        const client = queryUrl.startsWith('https') ? require('https') : require('http');

        client.get(queryUrl, (proxyRes) => {
            let data = '';
            proxyRes.on('data', chunk => data += chunk);
            proxyRes.on('end', () => {
                res.writeHead(200, {
                    'Content-Type': 'text/html', // Assume HTML for news reader
                    'Access-Control-Allow-Origin': '*'
                });
                res.end(data);
            });
        }).on('error', (err) => {
            res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ error: 'Proxy error: ' + err.message }));
        });
        return; // Stop further processing
    }

    const baseDir = process.cwd();
    const safeUrlPath = decodeURIComponent(urlPath);
    let filePath = path.resolve(baseDir, '.' + safeUrlPath);
    if (filePath === baseDir) {
        filePath = path.join(baseDir, 'index.html');
    }

    if (!filePath.startsWith(baseDir + path.sep) && filePath !== baseDir) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Forbidden');
        return;
    }

    const extname = String(path.extname(filePath)).toLowerCase();
    const contentType = MIME_TYPES[extname] || 'application/octet-stream';

    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code === 'ENOENT') {
                fs.readFile('./404.html', (error, content) => {
                    res.writeHead(404, {
                        'Content-Type': 'text/html',
                        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
                        'Pragma': 'no-cache',
                        'Expires': '0'
                    });
                    res.end(content || '404 Not Found', 'utf-8');
                });
            } else {
                res.writeHead(500, {
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
                    'Pragma': 'no-cache',
                    'Expires': '0'
                });
                res.end(JSON.stringify({ error: 'Server error: ' + error.code }));
            }
        } else {
            res.writeHead(200, {
                'Content-Type': contentType,
                'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0',
                'Surrogate-Control': 'no-store'
            });
            res.end(content, 'utf-8');
        }
    });
});

server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}/`);
});
