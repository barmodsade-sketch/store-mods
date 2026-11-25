'use strict';

const crypto = require('crypto');
const { escapeHtml, sanitizeFileName, buildMultipartPayload, requestHttp } = require('./http');

async function handleServerStats(config) {
    const capabilities = {
        vpsConfigured: Boolean(config.vpsDomain && config.vpsAuth && config.adminPin),
        groqConfigured: Boolean(config.groqKey),
        mediaKeyConfigured: Boolean(config.botcahxKey),
        kmspConfigured: Boolean(config.kmspAuth && config.kmspKey)
    };

    if (!config.vpsDomain) {
        return {
            statusCode: 200,
            body: {
                status: 'unconfigured',
                message: 'Sensor VPS belum dihubungkan (variabel VPS_DOMAIN kosong). Fitur lokal dan diagnostik tetap aktif.',
                capabilities,
                serverTime: new Date().toISOString()
            }
        };
    }

    try {
        const statsUrl = `http://${config.vpsDomain}:${config.vpsStatsPort}/stats`;
        const response = await requestHttp(statsUrl, { timeoutMs: 5000 });
        if (!response.ok) {
            return {
                statusCode: 502,
                body: { status: 'error', message: `Sensor VPS merespons HTTP ${response.status}.`, capabilities, serverTime: new Date().toISOString() }
            };
        }
        return { statusCode: 200, body: { status: 'success', data: response.data, capabilities, serverTime: new Date().toISOString() } };
    } catch (err) {
        return { statusCode: 502, body: { status: 'error', message: `Sensor VPS tidak terjangkau (${err.message}).`, capabilities, serverTime: new Date().toISOString() } };
    }
}

async function runMultipartProvider(spec, mimeType, buffer) {
    const started = Date.now();
    try {
        const form = buildMultipartPayload(spec.fields || {}, spec.fileField, spec.fileName, mimeType, buffer);
        const res = await requestHttp(spec.endpoint, {
            method: 'POST',
            headers: form.headers,
            body: form.payload,
            timeoutMs: 15000,
            responseType: spec.responseType
        });
        const url = spec.extractUrl(res);
        if (!url) throw new Error(`Respons ${spec.name} tidak memuat tautan valid`);
        return { provider: spec.name, status: 'success', url, durationMs: Date.now() - started };
    } catch (err) {
        return { provider: spec.name, status: 'failed', url: null, reason: err.message, durationMs: Date.now() - started };
    }
}

async function handleMultiCloudUpload(body, config) {
    const { fileBase64, fileName, mimeType } = body;
    if (typeof fileBase64 !== 'string' || !fileBase64.trim()) {
        return { statusCode: 400, body: { status: 'error', message: 'Berkas unggahan tidak boleh kosong.' } };
    }
    const buffer = Buffer.from(fileBase64.replace(/^data:[^;]*;base64,/, ''), 'base64');
    if (buffer.length === 0) {
        return { statusCode: 400, body: { status: 'error', message: 'Isi berkas kosong atau format Base64 rusak.' } };
    }
    if (buffer.length > 3 * 1024 * 1024) {
        return { statusCode: 400, body: { status: 'error', message: 'Ukuran berkas melebihi batas maksimal 3 MB untuk kompatibilitas serverless.' } };
    }

    const safeName = sanitizeFileName(fileName);
    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
    const prefix = crypto.randomBytes(4).toString('hex');

    const providerSpecs = [
        {
            name: 'Yupra CDN',
            endpoint: `${config.upstreams.yupra}/upload`,
            fileField: 'files',
            fileName: safeName,
            extractUrl: (res) => {
                const u = res.data?.files?.[0]?.url;
                if (!res.data?.success || !u) return '';
                return u.startsWith('http') ? u : `${config.upstreams.yupra}${u}`;
            }
        },
        {
            name: 'Catbox',
            endpoint: `${config.upstreams.catbox}/user/api.php`,
            fields: { reqtype: 'fileupload' },
            fileField: 'fileToUpload',
            fileName: safeName,
            responseType: 'text',
            extractUrl: (res) => {
                const txt = String(res.data || '').trim();
                return txt.startsWith('http') ? txt : '';
            }
        },
        {
            name: 'Qu.ax',
            endpoint: `${config.upstreams.quax}/upload.php`,
            fields: { expiry: '-1' },
            fileField: 'files[]',
            fileName: safeName,
            extractUrl: (res) => res.data?.files?.[0]?.url || ''
        },
        {
            name: 'Pomf2',
            endpoint: `${config.upstreams.pomf2}/upload.php`,
            fileField: 'files[]',
            fileName: `${prefix}_${safeName}`,
            extractUrl: (res) => res.data?.files?.[0]?.url || ''
        },
        {
            name: 'GoFile',
            endpoint: `${config.upstreams.gofile}/contents/uploadfile`,
            fileField: 'file',
            fileName: safeName,
            extractUrl: (res) => res.data?.data?.downloadPage || ''
        },
        {
            name: 'Fadzzz Cloud',
            endpoint: `${config.upstreams.fadzzz}/upload`,
            fileField: 'file',
            fileName: safeName,
            extractUrl: (res) => res.data?.url || ''
        }
    ];

    const results = await Promise.all(providerSpecs.map((spec) => runMultipartProvider(spec, mimeType, buffer)));
    return {
        statusCode: 200,
        body: { status: 'success', fileName: safeName, sizeBytes: buffer.length, sha256, data: results }
    };
}

function normalizeMsisdn(input) {
    const digits = String(input || '').trim().replace(/[\s().-]/g, '').replace(/^\+/, '');
    let normalized = digits;
    if (/^0\d+$/.test(normalized)) normalized = `62${normalized.slice(1)}`;
    else if (/^8\d+$/.test(normalized)) normalized = `62${normalized}`;
    return /^62\d{8,13}$/.test(normalized) ? normalized : null;
}

function computeQuotaPercent(remainingStr, totalStr, fallbackPct) {
    const toBytes = (str) => {
        if (!str || typeof str !== 'string') return 0;
        const m = str.replace(/,/g, '').trim().match(/^([\d.]+)\s*(TB|GB|MB|KB)?/i);
        if (!m) return 0;
        const factors = { TB: 1024 ** 4, GB: 1024 ** 3, MB: 1024 ** 2, KB: 1024 };
        return parseFloat(m[1]) * (factors[(m[2] || 'MB').toUpperCase()] || 1);
    };
    const rem = toBytes(remainingStr);
    const tot = toBytes(totalStr);
    if (tot > 0) return Math.max(0, Math.min(100, Math.round((rem / tot) * 100)));
    if (fallbackPct != null && Number.isFinite(Number(fallbackPct))) {
        return Math.max(0, Math.min(100, Math.round(Number(fallbackPct))));
    }
    return null;
}

async function fetchBendithKuota(msisdn, config) {
    const bendUrl = `${config.upstreams.bendith}/end.php?check=package&number=${encodeIComponentSafe(msisdn)}&version=2`;
    const bendRes = await requestHttp(bendUrl, { timeoutMs: 14000 });
    if (!bendRes.data?.success || !bendRes.data?.data?.subs_info) {
        throw new Error(bendRes.data?.message || `HTTP ${bendRes.status}`);
    }
    const info = bendRes.data.data.subs_info;
    const rawPkgs = bendRes.data.data.package_info?.packages || [];
    const packages = rawPkgs.map((pkg) => ({
        name: escapeHtml(pkg.name || 'Paket Aktif'),
        expiry: escapeHtml(pkg.expiry || '-'),
        quotas: (pkg.quotas || []).map((q) => ({
            name: escapeHtml(q.name || 'Kuota'),
            remaining: escapeHtml(q.remaining || '-'),
            total: escapeHtml(q.total || '-'),
            percent: computeQuotaPercent(q.remaining, q.total, q.percent)
        }))
    }));
    return {
        statusCode: 200,
        body: {
            status: 'success',
            source: 'Bendith Engine',
            subscriber: {
                msisdn,
                operator: escapeHtml(info.operator || 'XL / Axis'),
                network: escapeHtml(info.net_type || '4G LTE'),
                activeUntil: escapeHtml(info.exp_date || '-'),
                graceUntil: escapeHtml(info.grace_until || '-'),
                tenure: escapeHtml(info.tenure || '-')
            },
            packages
        }
    };
}

function encodeIComponentSafe(val) {
    return encodeURIComponent(String(val || ''));
}

async function fetchKmspKuota(msisdn, config) {
    const kmspUrl = `${config.upstreams.kmsp}/sidompul/v4/cek_kuota?msisdn=${encodeIComponentSafe(msisdn)}&isJSON=true`;
    const kmspRes = await requestHttp(kmspUrl, {
        timeoutMs: 18000,
        headers: { Authorization: config.kmspAuth, 'X-API-Key': config.kmspKey, 'X-App-Version': '4.0.0' }
    });
    if (!kmspRes.data?.status) {
        return { statusCode: 400, body: { status: 'error', message: kmspRes.data?.message || 'Nomor tidak ditemukan pada gateway.' } };
    }
    const sp = kmspRes.data.data?.data_sp || {};
    const plainLines = String(kmspRes.data.data?.hasil || '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/li>/gi, '\n')
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/g, ' ')
        .trim()
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, 20);

    return {
        statusCode: 200,
        body: {
            status: 'success',
            source: 'KMSP Sidompul Engine',
            subscriber: {
                msisdn,
                operator: escapeHtml(sp.prefix?.value || 'XL / Axis'),
                network: escapeHtml(sp.status_4g?.value || '-'),
                activeUntil: escapeHtml(sp.active_period?.value || '-'),
                graceUntil: escapeHtml(sp.grace_period?.value || '-'),
                tenure: escapeHtml(sp.active_card?.value || '-')
            },
            packages: plainLines.length
                ? [{
                    name: 'Rincian Paket Sidompul',
                    expiry: escapeHtml(sp.active_period?.value || '-'),
                    quotas: plainLines.map((line) => ({ name: escapeHtml(line), remaining: '-', total: '-', percent: null }))
                }]
                : []
        }
    };
}

async function handleCekKuota(rawNumber, config) {
    if (!rawNumber) {
        return { statusCode: 400, body: { status: 'error', message: 'Nomor telepon tidak boleh kosong.' } };
    }
    const msisdn = normalizeMsisdn(rawNumber);
    if (!msisdn) {
        return { statusCode: 400, body: { status: 'error', message: 'Format nomor seluler Indonesia tidak valid (gunakan awalan 08 atau 628).' } };
    }

    let primaryFailure = '';
    try {
        return await fetchBendithKuota(msisdn, config);
    } catch (err) {
        primaryFailure = err.message;
    }

    if (!config.kmspAuth || !config.kmspKey) {
        return {
            statusCode: 503,
            body: { status: 'error', message: `Gateway utama tidak merespons (${primaryFailure}) dan kredensial cadangan KMSP belum diatur.` }
        };
    }

    try {
        return await fetchKmspKuota(msisdn, config);
    } catch (err) {
        return { statusCode: 502, body: { status: 'error', message: `Gagal mengambil data kuota: ${err.message}` } };
    }
}

module.exports = {
    handleServerStats,
    handleMultiCloudUpload,
    handleCekKuota
};
