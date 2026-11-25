'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const vpnHandler = require('./api/vpn');
const { getRuntimeConfig } = require('./lib/config');

const ROOT_DIR = __dirname;

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon'
};

const PUBLIC_PATHS = new Set(['/', '/index.html', '/404.html']);

function decorateResponse(res) {
    res.status = function status(code) {
        res.statusCode = code;
        return res;
    };
    res.json = function json(payload) {
        if (!res.headersSent) {
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
        }
        res.end(JSON.stringify(payload));
        return res;
    };
    return res;
}

function collectRequestBody(req, maxBytes = 6 * 1024 * 1024) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let total = 0;
        req.on('data', (chunk) => {
            total += chunk.length;
            if (total > maxBytes) {
                reject(new Error('Ukuran body melebihi batas 6 MB.'));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        req.on('error', reject);
    });
}

function serveStaticFile(reqPath, res) {
    let cleanPath = reqPath.split('?')[0];
    if (cleanPath === '/') {
        cleanPath = '/index.html';
    }

    const isAllowedAsset = cleanPath.startsWith('/assets/') && !cleanPath.includes('..');
    if (!PUBLIC_PATHS.has(cleanPath) && !isAllowedAsset) {
        const notFoundPage = path.join(ROOT_DIR, '404.html');
        res.statusCode = 404;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        if (fs.existsSync(notFoundPage)) {
            res.end(fs.readFileSync(notFoundPage));
        } else {
            res.end('404 Not Found');
        }
        return;
    }

    const resolvedFile = path.resolve(ROOT_DIR, `.${cleanPath}`);
    if (!resolvedFile.startsWith(ROOT_DIR) || !fs.existsSync(resolvedFile) || fs.statSync(resolvedFile).isDirectory()) {
        const notFoundPage = path.join(ROOT_DIR, '404.html');
        res.statusCode = 404;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(fs.existsSync(notFoundPage) ? fs.readFileSync(notFoundPage) : '404 Not Found');
        return;
    }

    const ext = path.extname(resolvedFile).toLowerCase();
    res.statusCode = 200;
    res.setHeader('Content-Type', MIME_TYPES[ext] || 'application/octet-stream');
    res.end(fs.readFileSync(resolvedFile));
}

function createAppServer() {
    return http.createServer(async (req, res) => {
        decorateResponse(res);
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'SAMEORIGIN');
        res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

        const urlPath = (req.url || '/').split('?')[0];

        if (urlPath === '/api/health') {
            res.status(200).json({ status: 'ok', uptimeSec: Math.round(process.uptime()) });
            return;
        }

        if (urlPath === '/api/vpn' || urlPath === '/api/vpn.js') {
            try {
                req.body = await collectRequestBody(req);
                await vpnHandler(req, res);
            } catch (err) {
                if (!res.headersSent) {
                    res.status(413).json({ status: 'error', message: err.message });
                }
            }
            return;
        }

        if (req.method !== 'GET' && req.method !== 'HEAD') {
            res.status(405).json({ status: 'error', message: 'Method Not Allowed' });
            return;
        }

        serveStaticFile(urlPath, res);
    });
}

if (require.main === module) {
    const { port } = getRuntimeConfig();
    const server = createAppServer();
    server.listen(port, () => {
        process.stdout.write(`Barmods Tunnel running at http://localhost:${port}\n`);
    });
}

module.exports = {
    createAppServer
};
