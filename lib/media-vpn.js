'use strict';

const { verifyPin, normalizePublicUrl, requestHttp } = require('./http');

const ALLOWED_PROTOCOLS = new Set(['ssh', 'vless', 'vmess', 'trojan', 'shadowsocks']);
const ALLOWED_VPN_ACTIONS = new Set(['create', 'trial', 'renew', 'delete']);

async function handleScreenshotWeb(body, config) {
    const normalized = normalizePublicUrl(body.username);
    if (!normalized.ok) {
        return { statusCode: 400, body: { status: 'error', message: normalized.error } };
    }
    if (!config.botcahxKey) {
        return { statusCode: 503, body: { status: 'error', message: 'Variabel BOTCAHX_APIKEY belum dikonfigurasi pada server.' } };
    }

    const device = body.device === 'mobile' ? 'mobile' : 'desktop';
    const width = device === 'desktop' ? 1920 : 390;
    const height = device === 'desktop' ? 1080 : 844;
    const endpoint = `${config.upstreams.botcahx}/api/tools/ssweb?url=${encodeURIComponent(normalized.url)}&device=${device}&width=${width}&height=${height}&apikey=${encodeURIComponent(config.botcahxKey)}`;

    try {
        const res = await requestHttp(endpoint, { responseType: 'buffer', timeoutMs: 26000 });
        if (!res.contentType.includes('image')) {
            return { statusCode: 400, body: { status: 'error', message: `Tangkapan layar gagal (${res.data.toString('utf8').slice(0, 60)}).` } };
        }
        return {
            statusCode: 200,
            body: { status: 'success', data: `data:${res.contentType};base64,${res.data.toString('base64')}`, device, url: normalized.url }
        };
    } catch (err) {
        return { statusCode: 502, body: { status: 'error', message: `Layanan SSWeb timeout: ${err.message}` } };
    }
}

async function handleIphoneQuote(rawText, config) {
    if (typeof rawText !== 'string' || !rawText.trim()) {
        return { statusCode: 400, body: { status: 'error', message: 'Teks kutipan tidak boleh kosong.' } };
    }
    if (!config.botcahxKey) {
        return { statusCode: 503, body: { status: 'error', message: 'Variabel BOTCAHX_APIKEY belum dikonfigurasi pada server.' } };
    }

    const endpoint = `${config.upstreams.botcahx}/api/maker/iqc?text=${encodeURIComponent(rawText.trim().slice(0, 280))}&apikey=${encodeURIComponent(config.botcahxKey)}`;
    try {
        const res = await requestHttp(endpoint, { responseType: 'buffer', timeoutMs: 26000 });
        if (res.contentType.includes('image')) {
            return { statusCode: 200, body: { status: 'success', data: `data:${res.contentType};base64,${res.data.toString('base64')}` } };
        }
        let parsed;
        try {
            parsed = JSON.parse(res.data.toString('utf8'));
        } catch (parseErr) {
            return { statusCode: 400, body: { status: 'error', message: `Respons pembuat kutipan tidak valid (${parseErr.message}).` } };
        }
        const remoteUrl = parsed?.result?.url || parsed?.result;
        if (typeof remoteUrl === 'string' && remoteUrl.startsWith('http')) {
            const imgRes = await requestHttp(remoteUrl, { responseType: 'buffer', timeoutMs: 20000 });
            return { statusCode: 200, body: { status: 'success', data: `data:${imgRes.contentType || 'image/jpeg'};base64,${imgRes.data.toString('base64')}` } };
        }
        return { statusCode: 400, body: { status: 'error', message: parsed?.message || 'Gagal merender gambar kutipan.' } };
    } catch (err) {
        return { statusCode: 502, body: { status: 'error', message: `Pembuat kutipan gagal: ${err.message}` } };
    }
}

async function handlePinterestSearch(query, config) {
    if (typeof query !== 'string' || !query.trim()) {
        return { statusCode: 400, body: { status: 'error', message: 'Kata kunci pencarian gambar wajib diisi.' } };
    }
    const cleanQuery = query.trim().slice(0, 100);
    const scrapeUrl = `${config.upstreams.pinterest}/resource/BaseSearchResource/get/?data=${encodeURIComponent(JSON.stringify({ options: { query: cleanQuery } }))}`;
    const reqHeaders = { 'screen-dpr': '4', 'x-pinterest-pws-handler': 'www/search/[scope].js' };

    try {
        let res = await requestHttp(scrapeUrl, { method: 'HEAD', headers: reqHeaders, timeoutMs: 12000, responseType: 'text' });
        let linkHeader = res.headers.link || '';
        if (!linkHeader) {
            res = await requestHttp(scrapeUrl, { method: 'GET', headers: reqHeaders, timeoutMs: 12000, responseType: 'text' });
            linkHeader = res.headers.link || '';
        }
        const urls = [...linkHeader.matchAll(/<(.*?)>/g)].map((m) => m[1]);
        const validUrls = [...new Set(urls.filter((u) => u.includes('pinimg.com') && /\.(jpg|png|webp)$/i.test(u)))];
        if (!validUrls.length) {
            return { statusCode: 404, body: { status: 'error', message: 'Gambar referensi tidak ditemukan.' } };
        }
        return { statusCode: 200, body: { status: 'success', query: cleanQuery, data: validUrls.slice(0, 8) } };
    } catch (err) {
        return { statusCode: 502, body: { status: 'error', message: `Pencarian Pinterest gagal: ${err.message}` } };
    }
}

async function fetchTikwmFallback(input, config) {
    try {
        const res = await requestHttp(`${config.upstreams.tikwm}/api/?url=${encodeURIComponent(input)}`, { timeoutMs: 18000 });
        const item = res.data?.data;
        if (!item) {
            return { statusCode: 400, body: { status: 'error', message: res.data?.msg || 'Tautan TikTok tidak valid.' } };
        }
        return {
            statusCode: 200,
            body: { status: 'success', data: { title: item.title || 'TikTok Media', video: item.play, audio: item.music, images: item.images || [] } }
        };
    } catch (err) {
        return { statusCode: 502, body: { status: 'error', message: `Ekstraksi TikTok gagal: ${err.message}` } };
    }
}

async function handleMediaDownload(action, rawInput, config) {
    if (action === 'pinterest') return handlePinterestSearch(rawInput, config);
    if (typeof rawInput !== 'string' || !rawInput.trim()) {
        return { statusCode: 400, body: { status: 'error', message: 'URL media atau kata kunci wajib diisi.' } };
    }
    const input = rawInput.trim();
    if (action === 'tiktok' && !config.botcahxKey) return fetchTikwmFallback(input, config);
    if (!config.botcahxKey) {
        return { statusCode: 503, body: { status: 'error', message: 'Variabel BOTCAHX_APIKEY diperlukan untuk ekstraksi YouTube.' } };
    }

    try {
        if (action === 'yt_play') {
            const searchRes = await requestHttp(`${config.upstreams.botcahx}/api/search/yts?query=${encodeURIComponent(input)}&apikey=${encodeURIComponent(config.botcahxKey)}`, { timeoutMs: 15000 });
            const video = searchRes.data?.result?.[0];
            if (!video?.url) return { statusCode: 404, body: { status: 'error', message: 'Lagu tidak ditemukan.' } };
            const dlRes = await requestHttp(`${config.upstreams.botcahx}/api/dowloader/yt?url=${encodeURIComponent(video.url)}&apikey=${encodeURIComponent(config.botcahxKey)}`, { timeoutMs: 22000 });
            const dl = dlRes.data?.result || {};
            return {
                statusCode: 200,
                body: {
                    status: 'success',
                    data: {
                        type: 'yt_play',
                        title: video.title || dl.title || 'Audio Track',
                        thumbnail: video.image || video.thumbnail || dl.thumb || null,
                        duration: video.timestamp || video.duration || '-',
                        views: video.views || '-',
                        url: video.url,
                        audio: dl.mp3 || dl.audio || dl.url_audio || dl.url || null
                    }
                }
            };
        }

        const route = action === 'youtube' ? '/api/dowloader/yt' : '/api/dowloader/tiktok';
        const res = await requestHttp(`${config.upstreams.botcahx}${route}?url=${encodeURIComponent(input)}&apikey=${encodeURIComponent(config.botcahxKey)}`, { timeoutMs: 22000 });
        if (!res.data?.result || res.data.status === false) {
            return { statusCode: 400, body: { status: 'error', message: res.data?.message || 'Gagal mengekstrak tautan media.' } };
        }
        return { statusCode: 200, body: { status: 'success', data: res.data.result } };
    } catch (err) {
        return { statusCode: 502, body: { status: 'error', message: `Layanan ekstraksi media gagal: ${err.message}` } };
    }
}

async function handleAiChat(body, config) {
    const prompt = typeof body.username === 'string' ? body.username.trim() : '';
    if (!prompt) return { statusCode: 400, body: { status: 'error', message: 'Pesan pertanyaan tidak boleh kosong.' } };
    if (!config.groqKey) return { statusCode: 503, body: { status: 'error', message: 'GROQ_API_KEY belum diatur pada Environment Variables Vercel.' } };

    const personaPrompts = {
        network: 'Kamu adalah Teknisi Senior Jaringan & Tunneling Barmods. Jawab akurat, ringkas, dan praktis seputar SSH, Xray/V2Ray, OpenClash/Mihomo, Sing-box, DNS, dan VPS dalam Bahasa Indonesia tanpa tanda em-dash.',
        coder: 'Kamu adalah Insinyur Perangkat Lunak Barmods. Berikan solusi skrip yang bersih dan aman dalam Bahasa Indonesia.',
        general: 'Kamu adalah Asisten Teknis Barmods Command Center. Jawab jelas dan ringkas dalam Bahasa Indonesia.'
    };
    const history = Array.isArray(body.history)
        ? body.history
            .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
            .slice(-8)
            .map((m) => ({ role: m.role, content: m.content.slice(0, 1500) }))
        : [];

    try {
        const res = await requestHttp(`${config.upstreams.groq}/openai/v1/chat/completions`, {
            method: 'POST',
            timeoutMs: 18000,
            headers: { Authorization: `Bearer ${config.groqKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: config.groqModel,
                messages: [{ role: 'system', content: personaPrompts[body.persona] || personaPrompts.network }, ...history, { role: 'user', content: prompt.slice(0, 2000) }],
                temperature: 0.55
            })
        });
        const reply = res.data?.choices?.[0]?.message?.content;
        if (!res.ok || !reply) {
            return { statusCode: 502, body: { status: 'error', message: res.data?.error?.message || `Groq HTTP ${res.status}.` } };
        }
        return { statusCode: 200, body: { status: 'success', reply } };
    } catch (err) {
        return { statusCode: 502, body: { status: 'error', message: `Koneksi Groq gagal: ${err.message}` } };
    }
}

function buildVpnPanelQuery(body, config) {
    const safeExp = String(Math.max(1, Math.min(3650, Number(body.exp) || 30)));
    const safeIpLimit = String(Math.max(1, Math.min(100, Number(body.iplimit) || 2)));
    const safeQuota = String(Math.max(0, Math.min(100000, Number(body.quota) || 0)));
    const params = new URLSearchParams({ user: String(body.username), auth: config.vpsAuth });

    if (body.action === 'delete') {
        return { endpoint: `del${body.protocol}`, params };
    }
    params.set('exp', safeExp);
    params.set('iplimit', safeIpLimit);
    if (body.action === 'renew') {
        if (body.protocol !== 'ssh') params.set('quota', safeQuota);
        return { endpoint: `renew${body.protocol}`, params };
    }
    if (body.protocol === 'ssh') params.set('password', String(body.password || '1').slice(0, 64));
    else params.set('quota', safeQuota);
    return { endpoint: `${body.action}${body.protocol}`, params };
}

async function handleVpnDeployment(body, config) {
    if (!ALLOWED_VPN_ACTIONS.has(body.action)) {
        return { statusCode: 400, body: { status: 'error', message: `Aksi '${String(body.action || '')}' tidak dikenali.` } };
    }
    if (!ALLOWED_PROTOCOLS.has(body.protocol)) {
        return { statusCode: 400, body: { status: 'error', message: 'Protokol tunnel tidak valid.' } };
    }
    if (!body.username || !/^[a-zA-Z0-9_-]{3,32}$/.test(String(body.username))) {
        return { statusCode: 400, body: { status: 'error', message: 'Username wajib 3 sampai 32 karakter alfanumerik, garis bawah, atau tanda hubung.' } };
    }
    if (!config.vpsDomain || !config.vpsAuth || !config.adminPin) {
        return { statusCode: 503, body: { status: 'error', message: 'Konfigurasi VPS belum lengkap pada Environment Variables Vercel.' } };
    }
    if (!verifyPin(body.dev_pin, config.adminPin)) {
        return { statusCode: 403, body: { status: 'error', message: 'Akses ditolak: Developer PIN tidak cocok.' } };
    }

    const { endpoint, params } = buildVpnPanelQuery(body, config);
    const basePanelUrl = `http://${config.vpsDomain}:${config.vpsPanelPort}`;

    try {
        let res = await requestHttp(`${basePanelUrl}/${endpoint}?${params.toString()}`, { timeoutMs: 15000 });
        if (body.action === 'delete' && res.status === 404) {
            res = await requestHttp(`${basePanelUrl}/delete${body.protocol}?${params.toString()}`, { timeoutMs: 15000 });
        }
        if (!res.ok) {
            return { statusCode: 502, body: { status: 'error', message: `Agent VPS menolak permintaan (HTTP ${res.status}).` } };
        }
        if (res.data && typeof res.data === 'object') {
            if (res.data.status === 'error' || res.data.error) {
                return { statusCode: 400, body: { status: 'error', message: res.data.message || res.data.error || 'Operasi ditolak VPS.' } };
            }
            return { statusCode: 200, body: { status: 'success', data: res.data } };
        }
        return { statusCode: 200, body: { status: 'success', data: { raw: String(res.data), username: String(body.username), domain: config.vpsDomain } } };
    } catch (err) {
        return { statusCode: 502, body: { status: 'error', message: `Agent VPS tidak merespons: ${err.message}` } };
    }
}

module.exports = {
    handleScreenshotWeb,
    handleIphoneQuote,
    handleMediaDownload,
    handleAiChat,
    handleVpnDeployment
};
