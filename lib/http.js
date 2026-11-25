'use strict';

const crypto = require('crypto');
const net = require('net');

const BROWSER_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function verifyPin(providedPin, expectedPin) {
    if (!providedPin || !expectedPin) {
        return false;
    }
    const left = Buffer.from(String(providedPin), 'utf8');
    const right = Buffer.from(String(expectedPin), 'utf8');
    if (left.length !== right.length) {
        return false;
    }
    return crypto.timingSafeEqual(left, right);
}

function isPrivateIpAddress(ip) {
    if (net.isIPv4(ip)) {
        const parts = ip.split('.').map(Number);
        if (parts[0] === 10 || parts[0] === 127 || parts[0] === 0) return true;
        if (parts[0] === 169 && parts[1] === 254) return true;
        if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
        if (parts[0] === 192 && parts[1] === 168) return true;
        if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true;
        return false;
    }
    if (net.isIPv6(ip)) {
        const lower = ip.toLowerCase();
        return lower === '::1' || lower === '::' || lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80:');
    }
    return false;
}

function normalizePublicUrl(rawInput) {
    if (typeof rawInput !== 'string' || !rawInput.trim()) {
        return { ok: false, error: 'URL atau domain target wajib diisi.' };
    }
    let candidate = rawInput.trim();
    if (!/^https?:\/\//i.test(candidate)) {
        candidate = `https://${candidate}`;
    }
    let parsed;
    try {
        parsed = new URL(candidate);
    } catch (err) {
        return { ok: false, error: `Format URL tidak valid (${err.message}).` };
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return { ok: false, error: 'Hanya protokol HTTP dan HTTPS yang diizinkan.' };
    }
    const host = parsed.hostname.toLowerCase();
    if (!host || host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal') || isPrivateIpAddress(host)) {
        return { ok: false, error: 'Target jaringan privat atau loopback tidak diizinkan.' };
    }
    return { ok: true, url: parsed.toString(), hostname: host, parsed };
}

function sanitizeFileName(rawName) {
    const cleaned = String(rawName || 'upload.bin')
        .replace(/[\r\n"\\/:*?<>|]+/g, '_')
        .replace(/\s+/g, '_')
        .slice(0, 96);
    return cleaned || 'upload.bin';
}

function buildMultipartPayload(fields, fileField, fileName, mimeType, fileBuffer) {
    const boundary = `----BarmodsBoundary${crypto.randomBytes(8).toString('hex')}`;
    const safeName = sanitizeFileName(fileName);
    const safeMime = String(mimeType || 'application/octet-stream').replace(/[\r\n]+/g, '');
    const chunks = [];

    for (const [key, value] of Object.entries(fields || {})) {
        const safeKey = String(key).replace(/[\r\n"]+/g, '');
        chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${safeKey}"\r\n\r\n${String(value)}\r\n`, 'utf8'));
    }

    chunks.push(
        Buffer.from(
            `--${boundary}\r\nContent-Disposition: form-data; name="${fileField}"; filename="${safeName}"\r\nContent-Type: ${safeMime}\r\n\r\n`,
            'utf8'
        )
    );
    chunks.push(fileBuffer);
    chunks.push(Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8'));

    return {
        payload: Buffer.concat(chunks),
        headers: {
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
            'User-Agent': BROWSER_UA
        }
    };
}

async function requestHttp(url, options = {}) {
    const timeoutMs = options.timeoutMs || 15000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const headers = Object.assign({ 'User-Agent': BROWSER_UA }, options.headers || {});
        const response = await fetch(url, {
            method: options.method || 'GET',
            headers,
            body: options.body,
            redirect: options.redirect || 'follow',
            signal: controller.signal
        });

        const contentType = response.headers.get('content-type') || '';
        const headerMap = {};
        response.headers.forEach((val, key) => {
            headerMap[key.toLowerCase()] = val;
        });

        if (options.responseType === 'buffer') {
            const ab = await response.arrayBuffer();
            return {
                status: response.status,
                ok: response.ok,
                contentType,
                headers: headerMap,
                data: Buffer.from(ab)
            };
        }

        const rawText = await response.text();
        let parsedData = rawText;
        if (options.responseType !== 'text' && (contentType.includes('application/json') || rawText.trim().startsWith('{') || rawText.trim().startsWith('['))) {
            try {
                parsedData = JSON.parse(rawText);
            } catch (parseErr) {
                parsedData = rawText;
                headerMap['x-parse-note'] = parseErr.message;
            }
        }

        return {
            status: response.status,
            ok: response.ok,
            contentType,
            headers: headerMap,
            data: parsedData,
            rawText
        };
    } finally {
        clearTimeout(timer);
    }
}

module.exports = {
    BROWSER_UA,
    escapeHtml,
    verifyPin,
    isPrivateIpAddress,
    normalizePublicUrl,
    sanitizeFileName,
    buildMultipartPayload,
    requestHttp
};
