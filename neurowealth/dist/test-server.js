const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3001; // Avoid conflict with user's 3000

const server = http.createServer((req, res) => {
    let filePath = '.' + req.url;
    if (filePath === './') filePath = './index.html';

    // Serve from the current directory (neurowealth)
    filePath = path.join(__dirname, filePath);

    const extname = String(path.extname(filePath)).toLowerCase();
    const mimeTypes = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
    };

    const contentType = mimeTypes[extname] || 'application/octet-stream';

    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code == 'ENOENT') {
                res.writeHead(404);
                res.end('Not found');
            } else {
                res.writeHead(500);
                res.end('Internal server error: ' + error.code + ' ..\n');
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

server.listen(PORT, (error) => {
    if (error) {
        console.error('Server failed:', error);
        process.exit(1);
    }
    console.log(`Server running at http://localhost:${PORT}/backtest.html`);

    // Now trigger a script to load it and test the button if puppeteer is available, 
    // or just leave it up for 10s so we can ping it.
    setTimeout(() => {
        console.log("Shutting down test server");
        server.close();
        process.exit(0);
    }, 15000);
});
