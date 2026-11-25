'use strict';

const dns = require('dns').promises;
const net = require('net');
const tls = require('tls');
const { isPrivateIpAddress, normalizePublicUrl, requestHttp } = require('./http');

function extractCleanHost(rawTarget) {
    if (typeof rawTarget !== 'string' || !rawTarget.trim()) {
        return { ok: false, error: 'Domain atau alamat IP wajib diisi.' };
    }
    const trimmed = rawTarget.trim();
    if (net.isIP(trimmed)) {
        if (isPrivateIpAddress(trimmed)) {
            return { ok: false, error: 'Alamat IP privat atau loopback tidak diizinkan.' };
        }
        return { ok: true, host: trimmed, isIp: true };
    }
    const normalized = normalizePublicUrl(trimmed);
    if (!normalized.ok) {
        return normalized;
    }
    return { ok: true, host: normalized.hostname, isIp: net.isIP(normalized.hostname) !== 0 };
}

async function resolveRecordSafe(host, type, fn) {
    const started = Date.now();
    try {
        const values = await fn(host);
        return { type, ok: true, durationMs: Date.now() - started, records: values };
    } catch (err) {
        return { type, ok: false, durationMs: Date.now() - started, records: [], code: err.code || 'NO_RECORD' };
    }
}

async function handleDnsLookup(target) {
    const parsed = extractCleanHost(target);
    if (!parsed.ok) {
        return { statusCode: 400, body: { status: 'error', message: parsed.error } };
    }
    const host = parsed.host;
    if (parsed.isIp) {
        const ptr = await resolveRecordSafe(host, 'PTR', (ip) => dns.reverse(ip));
        return {
            statusCode: 200,
            body: { status: 'success', host, queriedAt: new Date().toISOString(), results: [ptr] }
        };
    }

    const queries = await Promise.all([
        resolveRecordSafe(host, 'A', (h) => dns.resolve4(h)),
        resolveRecordSafe(host, 'AAAA', (h) => dns.resolve6(h)),
        resolveRecordSafe(host, 'CNAME', (h) => dns.resolveCname(h)),
        resolveRecordSafe(host, 'MX', (h) => dns.resolveMx(h)),
        resolveRecordSafe(host, 'NS', (h) => dns.resolveNs(h)),
        resolveRecordSafe(host, 'TXT', (h) => dns.resolveTxt(h).then((rows) => rows.map((r) => r.join(''))))
    ]);

    return {
        statusCode: 200,
        body: { status: 'success', host, queriedAt: new Date().toISOString(), results: queries }
    };
}

function inspectTlsCertificate(hostname, port = 443, timeoutMs = 8000) {
    return new Promise((resolve, reject) => {
        const started = Date.now();
        const socket = tls.connect(
            { host: hostname, port, servername: hostname, rejectUnauthorized: false },
            () => {
                const handshakeMs = Date.now() - started;
                const cert = socket.getPeerCertificate();
                const protocol = socket.getProtocol() || 'unknown';
                const cipher = socket.getCipher();
                const authorized = socket.authorized;
                socket.end();

                if (!cert || Object.keys(cert).length === 0) {
                    reject(new Error('Sertifikat TLS tidak ditemukan pada host tersebut.'));
                    return;
                }

                const validToMs = cert.valid_to ? Date.parse(cert.valid_to) : NaN;
                const daysRemaining = Number.isFinite(validToMs)
                    ? Math.floor((validToMs - Date.now()) / (1000 * 60 * 60 * 24))
                    : null;

                resolve({
                    authorized,
                    protocol,
                    cipherName: cipher ? cipher.name : '-',
                    handshakeMs,
                    subject: cert.subject?.CN || hostname,
                    issuer: cert.issuer?.O || cert.issuer?.CN || 'Unknown Issuer',
                    validFrom: cert.valid_from || '-',
                    validTo: cert.valid_to || '-',
                    daysRemaining,
                    serialNumber: cert.serialNumber || '-',
                    fingerprint256: cert.fingerprint256 || '-',
                    altNames: cert.subjectaltname
                        ? cert.subjectaltname.split(',').map((s) => s.trim().replace(/^DNS:/i, '')).slice(0, 15)
                        : []
                });
            }
        );

        socket.setTimeout(timeoutMs, () => {
            socket.destroy();
            reject(new Error('Waktu koneksi TLS habis (timeout).'));
        });

        socket.on('error', (err) => reject(err));
    });
}

async function handleSslCheck(target) {
    const normalized = normalizePublicUrl(target);
    if (!normalized.ok) {
        return { statusCode: 400, body: { status: 'error', message: normalized.error } };
    }
    if (net.isIP(normalized.hostname)) {
        return { statusCode: 400, body: { status: 'error', message: 'Masukkan nama domain (bukan IP mentah) untuk inspeksi SNI/SSL.' } };
    }

    try {
        const [tlsInfo, httpProbe] = await Promise.allSettled([
            inspectTlsCertificate(normalized.hostname, Number(normalized.parsed.port) || 443),
            requestHttp(`https://${normalized.hostname}`, { method: 'HEAD', timeoutMs: 8000, responseType: 'text' })
        ]);

        if (tlsInfo.status === 'rejected') {
            return { statusCode: 502, body: { status: 'error', message: `Inspeksi TLS gagal: ${tlsInfo.reason.message}` } };
        }

        const headers = httpProbe.status === 'fulfilled' ? httpProbe.value.headers : {};
        return {
            statusCode: 200,
            body: {
                status: 'success',
                hostname: normalized.hostname,
                httpStatus: httpProbe.status === 'fulfilled' ? httpProbe.value.status : null,
                certificate: tlsInfo.value,
                securityHeaders: {
                    strictTransportSecurity: Boolean(headers['strict-transport-security']),
                    contentSecurityPolicy: Boolean(headers['content-security-policy']),
                    xFrameOptions: headers['x-frame-options'] || null,
                    xContentTypeOptions: headers['x-content-type-options'] || null,
                    server: headers.server || 'Hidden',
                    cfRay: Boolean(headers['cf-ray'])
                }
            }
        };
    } catch (err) {
        return { statusCode: 500, body: { status: 'error', message: `Gagal memeriksa SSL: ${err.message}` } };
    }
}

async function handleSubdomainScan(target, config) {
    const parsed = extractCleanHost(target);
    if (!parsed.ok || parsed.isIp) {
        return { statusCode: 400, body: { status: 'error', message: 'Masukkan domain publik yang valid (contoh: example.com).' } };
    }
    const domain = parsed.host.replace(/^www\./i, '');

    try {
        const endpoint = `${config.upstreams.crtsh}/?q=${encodeURIComponent(`%.${domain}`)}&output=json`;
        const response = await requestHttp(endpoint, { timeoutMs: 18000 });
        if (!response.ok || !Array.isArray(response.data)) {
            return { statusCode: 502, body: { status: 'error', message: 'Basis data Certificate Transparency sedang sibuk, coba beberapa saat lagi.' } };
        }

        const discovered = new Set();
        for (const entry of response.data) {
            const names = String(entry.name_value || '').split(/\r?\n/);
            for (const rawName of names) {
                const clean = rawName.trim().toLowerCase().replace(/^\*\./, '');
                if (clean && (clean === domain || clean.endsWith(`.${domain}`)) && !clean.includes(' ')) {
                    discovered.add(clean);
                }
            }
            if (discovered.size >= 80) break;
        }

        const list = Array.from(discovered).sort();
        return { statusCode: 200, body: { status: 'success', domain, count: list.length, subdomains: list } };
    } catch (err) {
        return { statusCode: 502, body: { status: 'error', message: `Pencarian subdomain gagal: ${err.message}` } };
    }
}

async function handlePingCheck(target) {
    const normalized = normalizePublicUrl(target);
    if (!normalized.ok) {
        return { statusCode: 400, body: { status: 'error', message: normalized.error } };
    }

    const dnsStart = Date.now();
    let resolvedIps = [];
    try {
        resolvedIps = net.isIP(normalized.hostname) ? [normalized.hostname] : await dns.resolve4(normalized.hostname);
    } catch (dnsErr) {
        return { statusCode: 400, body: { status: 'error', message: `Host tidak dapat di-resolve melalui DNS (${dnsErr.code || dnsErr.message}).` } };
    }
    const dnsMs = Date.now() - dnsStart;

    if (resolvedIps.some((ip) => isPrivateIpAddress(ip))) {
        return { statusCode: 400, body: { status: 'error', message: 'Resolusi DNS mengarah ke alamat privat yang diblokir.' } };
    }

    const samples = [];
    for (let i = 0; i < 3; i += 1) {
        const sampleStart = Date.now();
        try {
            const res = await requestHttp(normalized.url, { method: 'HEAD', timeoutMs: 7000, responseType: 'text' });
            samples.push({ seq: i + 1, ok: true, status: res.status, latencyMs: Date.now() - sampleStart, server: res.headers.server || '-' });
        } catch (probeErr) {
            samples.push({ seq: i + 1, ok: false, status: 0, latencyMs: Date.now() - sampleStart, error: probeErr.message });
        }
    }

    const validLatencies = samples.filter((s) => s.ok).map((s) => s.latencyMs);
    return {
        statusCode: 200,
        body: {
            status: 'success',
            url: normalized.url,
            hostname: normalized.hostname,
            resolvedIps: resolvedIps.slice(0, 6),
            dnsMs,
            avgMs: validLatencies.length ? Math.round(validLatencies.reduce((acc, v) => acc + v, 0) / validLatencies.length) : null,
            minMs: validLatencies.length ? Math.min(...validLatencies) : null,
            maxMs: validLatencies.length ? Math.max(...validLatencies) : null,
            samples
        }
    };
}

async function handleIpIntel(target, clientIp, config) {
    let lookupTarget = typeof target === 'string' ? target.trim() : '';
    if (!lookupTarget && clientIp && !isPrivateIpAddress(clientIp)) {
        lookupTarget = clientIp;
    }

    if (lookupTarget && !net.isIP(lookupTarget)) {
        const parsed = extractCleanHost(lookupTarget);
        if (!parsed.ok) return { statusCode: 400, body: { status: 'error', message: parsed.error } };
        try {
            const ips = await dns.resolve4(parsed.host);
            if (!ips.length) return { statusCode: 400, body: { status: 'error', message: 'Domain tidak memiliki record IPv4.' } };
            lookupTarget = ips[0];
        } catch (err) {
            return { statusCode: 400, body: { status: 'error', message: `Gagal me-resolve domain: ${err.code || err.message}` } };
        }
    }

    if (lookupTarget && isPrivateIpAddress(lookupTarget)) {
        return { statusCode: 400, body: { status: 'error', message: 'Alamat IP lokal/privat tidak memiliki geolokasi publik.' } };
    }

    try {
        const pathPart = lookupTarget ? `/${encodeURIComponent(lookupTarget)}` : '/';
        const response = await requestHttp(`${config.upstreams.ipwhois}${pathPart}`, { timeoutMs: 10000 });
        if (!response.data || response.data.success === false) {
            return { statusCode: 400, body: { status: 'error', message: response.data?.message || 'Data IP tidak ditemukan.' } };
        }

        const info = response.data;
        let reverseDns = [];
        if (info.ip && net.isIP(info.ip)) {
            try { reverseDns = await dns.reverse(info.ip); }
            catch (ptrErr) { reverseDns = ptrErr.code ? [] : []; }
        }

        return {
            statusCode: 200,
            body: {
                status: 'success',
                data: {
                    ip: info.ip,
                    type: info.type || '-',
                    continent: info.continent || '-',
                    country: info.country || '-',
                    countryCode: info.country_code || '-',
                    region: info.region || '-',
                    city: info.city || '-',
                    latitude: info.latitude ?? null,
                    longitude: info.longitude ?? null,
                    timezone: info.timezone?.id || '-',
                    asn: info.connection?.asn || '-',
                    org: info.connection?.org || '-',
                    isp: info.connection?.isp || '-',
                    domain: info.connection?.domain || '-',
                    reverseDns
                }
            }
        };
    } catch (err) {
        return { statusCode: 502, body: { status: 'error', message: `Gagal melacak IP: ${err.message}` } };
    }
}

module.exports = {
    handleDnsLookup,
    handleSslCheck,
    handleSubdomainScan,
    handlePingCheck,
    handleIpIntel
};
