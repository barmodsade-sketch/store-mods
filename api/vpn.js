'use strict';

const { getRuntimeConfig } = require('../lib/config');
const {
    handleDnsLookup,
    handleSslCheck,
    handleSubdomainScan,
    handlePingCheck,
    handleIpIntel
} = require('../lib/network-tools');
const {
    handleServerStats,
    handleMultiCloudUpload,
    handleCekKuota,
    handleScreenshotWeb,
    handleIphoneQuote,
    handleMediaDownload,
    handleAiChat,
    handleVpnDeployment
} = require('../lib/services');

function sendJson(res, statusCode, payload) {
    if (typeof res.status === 'function' && typeof res.json === 'function') {
        res.status(statusCode).json(payload);
        return;
    }
    res.statusCode = statusCode;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(payload));
}

function collectStreamBody(req, maxBytes = 4.2 * 1024 * 1024) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let total = 0;
        req.on('data', (chunk) => {
            total += chunk.length;
            if (total > maxBytes) {
                reject(new Error('Ukuran payload melebihi batas serverless (4.2 MB).'));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        req.on('error', reject);
    });
}

async function parseIncomingBody(req) {
    if (req.body !== undefined && req.body !== null) {
        if (typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
            return { ok: true, value: req.body };
        }
        const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body);
        if (!raw.trim()) return { ok: true, value: {} };
        try {
            return { ok: true, value: JSON.parse(raw) };
        } catch (err) {
            return { ok: false, error: `Payload JSON tidak valid: ${err.message}` };
        }
    }

    if (typeof req.on === 'function') {
        try {
            const streamed = await collectStreamBody(req);
            if (!streamed.trim()) return { ok: true, value: {} };
            return { ok: true, value: JSON.parse(streamed) };
        } catch (err) {
            return { ok: false, error: err.message };
        }
    }

    return { ok: true, value: {} };
}

function readClientIp(req) {
    const forwarded = req.headers?.['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.trim()) {
        return forwarded.split(',')[0].trim();
    }
    return req.socket?.remoteAddress || '';
}

async function vpnHandler(req, res) {
    res.setHeader('X-Content-Type-Options', 'nosniff');

    if (req.method === 'OPTIONS') {
        res.statusCode = 204;
        res.end();
        return;
    }

    if (req.method !== 'POST') {
        sendJson(res, 405, { status: 'error', message: 'Metode HTTP tidak diizinkan. Gunakan POST.' });
        return;
    }

    const parsedBody = await parseIncomingBody(req);
    if (!parsedBody.ok) {
        sendJson(res, 400, { status: 'error', message: parsedBody.error });
        return;
    }

    const body = parsedBody.value || {};
    const action = typeof body.action === 'string' ? body.action.trim() : '';
    if (!action) {
        sendJson(res, 400, { status: 'error', message: 'Parameter action wajib disertakan.' });
        return;
    }

    const config = getRuntimeConfig();
    let outcome;

    switch (action) {
        case 'server_stats':
            outcome = await handleServerStats(config);
            break;
        case 'tourl':
            outcome = await handleMultiCloudUpload(body, config);
            break;
        case 'cekkuota':
            outcome = await handleCekKuota(body.username, config);
            break;
        case 'ssweb':
            outcome = await handleScreenshotWeb(body, config);
            break;
        case 'iqc':
            outcome = await handleIphoneQuote(body.username, config);
            break;
        case 'pinterest':
        case 'tiktok':
        case 'youtube':
        case 'yt_play':
            outcome = await handleMediaDownload(action, body.username, config);
            break;
        case 'ai_chat':
            outcome = await handleAiChat(body, config);
            break;
        case 'dns_lookup':
            outcome = await handleDnsLookup(body.target || body.username);
            break;
        case 'ssl_check':
            outcome = await handleSslCheck(body.target || body.username);
            break;
        case 'subdomain_scan':
            outcome = await handleSubdomainScan(body.target || body.username, config);
            break;
        case 'ping_check':
            outcome = await handlePingCheck(body.target || body.username);
            break;
        case 'ip_intel':
            outcome = await handleIpIntel(body.target || body.username, readClientIp(req), config);
            break;
        default:
            outcome = await handleVpnDeployment(body, config);
            break;
    }

    sendJson(res, outcome.statusCode, outcome.body);
}

vpnHandler.config = {
    maxDuration: 30
};

module.exports = vpnHandler;
