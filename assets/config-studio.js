(function initConfigStudio(root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.BarmodsConfigStudio = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function createConfigStudio() {
    'use strict';

    function safeBase64Decode(input) {
        const normalized = String(input || '').trim().replace(/-/g, '+').replace(/_/g, '/');
        const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
        if (typeof atob === 'function') {
            const bin = atob(padded);
            const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
            return new TextDecoder().decode(bytes);
        }
        return Buffer.from(padded, 'base64').toString('utf8');
    }

    function parseTunnelUri(rawUri) {
        const text = String(rawUri || '').trim();
        if (!text) throw new Error('Masukkan tautan vless://, vmess://, atau trojan:// terlebih dahulu.');

        if (text.startsWith('vmess://')) {
            const decoded = JSON.parse(safeBase64Decode(text.slice(8)));
            return {
                protocol: 'vmess',
                name: decoded.ps || decoded.remarks || 'Barmods-VMess',
                server: decoded.add || '',
                port: Number(decoded.port) || 443,
                uuid: decoded.id || '',
                cipher: decoded.scy || 'auto',
                alterId: Number(decoded.aid || 0),
                network: decoded.net || 'ws',
                tls: decoded.tls === 'tls' || Number(decoded.port) === 443,
                sni: decoded.sni || decoded.host || decoded.add || '',
                hostHeader: decoded.host || decoded.add || '',
                path: decoded.path || '/',
                serviceName: decoded.path || 'vmess-grpc'
            };
        }

        if (text.startsWith('vless://') || text.startsWith('trojan://')) {
            const parsed = new URL(text);
            const protocol = parsed.protocol.replace(':', '');
            const params = parsed.searchParams;
            const network = params.get('type') || 'ws';
            const security = params.get('security') || (parsed.port === '443' ? 'tls' : 'none');

            return {
                protocol,
                name: decodeURIComponent(parsed.hash.replace(/^#/, '')) || `Barmods-${protocol.toUpperCase()}`,
                server: parsed.hostname,
                port: Number(parsed.port) || (security === 'tls' ? 443 : 80),
                uuid: decodeURIComponent(parsed.username),
                network,
                tls: security === 'tls' || security === 'reality',
                sni: params.get('sni') || params.get('host') || parsed.hostname,
                hostHeader: params.get('host') || parsed.hostname,
                path: params.get('path') || `/${protocol}`,
                serviceName: params.get('serviceName') || `${protocol}-grpc`
            };
        }

        throw new Error('Format belum didukung. Gunakan awalan vless://, vmess://, atau trojan://.');
    }

    function applyBugHostOverride(node, bugHost, mode) {
        const copy = Object.assign({}, node);
        const cleanBug = String(bugHost || '').trim();
        if (!cleanBug) return copy;

        if (mode === 'cdn_address') {
            copy.sni = copy.server;
            copy.hostHeader = copy.server;
            copy.server = cleanBug;
        } else if (mode === 'sni_spoof') {
            copy.sni = cleanBug;
            copy.hostHeader = cleanBug;
        }
        return copy;
    }

    function toClashYaml(rawNode) {
        const lines = [
            'proxies:',
            `  - name: "${rawNode.name.replace(/"/g, '')}"`,
            `    type: ${rawNode.protocol}`,
            `    server: ${rawNode.server}`,
            `    port: ${rawNode.port}`,
            '    udp: true',
            rawNode.protocol === 'trojan' ? `    password: "${rawNode.uuid}"` : `    uuid: "${rawNode.uuid}"`
        ];

        if (rawNode.protocol === 'vmess') {
            lines.push(`    alterId: ${rawNode.alterId || 0}`, `    cipher: ${rawNode.cipher || 'auto'}`);
        }
        lines.push(`    tls: ${Boolean(rawNode.tls)}`, '    skip-cert-verify: true');
        if (rawNode.sni) {
            lines.push(`    ${rawNode.protocol === 'trojan' ? 'sni' : 'servername'}: ${rawNode.sni}`);
        }
        lines.push(`    network: ${rawNode.network}`);
        if (rawNode.network === 'ws') {
            lines.push('    ws-opts:', `      path: "${rawNode.path || '/'}"`, '      headers:', `        Host: ${rawNode.hostHeader || rawNode.server}`);
        } else if (rawNode.network === 'grpc') {
            lines.push('    grpc-opts:', `      grpc-service-name: "${rawNode.serviceName || 'grpc'}"`);
        }
        return lines.join('\n');
    }

    function toSingBoxJson(rawNode) {
        const outbound = {
            type: rawNode.protocol,
            tag: rawNode.name,
            server: rawNode.server,
            server_port: rawNode.port
        };
        if (rawNode.protocol === 'trojan') outbound.password = rawNode.uuid;
        else outbound.uuid = rawNode.uuid;

        if (rawNode.protocol === 'vmess') {
            outbound.security = rawNode.cipher || 'auto';
            outbound.alter_id = rawNode.alterId || 0;
        }
        if (rawNode.tls) {
            outbound.tls = { enabled: true, server_name: rawNode.sni || rawNode.server, insecure: true };
        }
        if (rawNode.network === 'ws') {
            outbound.transport = { type: 'ws', path: rawNode.path || '/', headers: { Host: rawNode.hostHeader || rawNode.server } };
        } else if (rawNode.network === 'grpc') {
            outbound.transport = { type: 'grpc', service_name: rawNode.serviceName || 'grpc' };
        }
        return JSON.stringify({ outbounds: [outbound] }, null, 2);
    }

    function buildHttpPayload(options) {
        const serverHost = (options.serverHost || 'sg1.barmods.id').trim();
        const bugHost = (options.bugHost || 'quiz.vidio.com').trim();
        const mode = options.mode || 'ws_cdn';

        if (mode === 'ws_direct') {
            return `GET / HTTP/1.1[crlf]Host: ${serverHost}[crlf]Upgrade: websocket[crlf]Connection: Upgrade[crlf]User-Agent: [ua][crlf][crlf]`;
        }
        if (mode === 'tls_sni') {
            return `GET wss://${bugHost}/ HTTP/1.1[crlf]Host: ${serverHost}[crlf]Upgrade: websocket[crlf]Connection: Upgrade[crlf]User-Agent: [ua][crlf][crlf]`;
        }
        if (mode === 'split_front') {
            return `GET http://${bugHost}/ HTTP/1.1[crlf]Host: ${bugHost}[crlf]Connection: Keep-Alive[crlf][crlf][split]GET / HTTP/1.1[crlf]Host: ${serverHost}[crlf]Upgrade: websocket[crlf]Connection: Upgrade[crlf][crlf]`;
        }
        return `GET / HTTP/1.1[crlf]Host: ${serverHost}[crlf]X-Online-Host: ${bugHost}[crlf]Connection: Upgrade[crlf]Upgrade: websocket[crlf]User-Agent: [ua][crlf][crlf]`;
    }

    function formatSshAccount(user, host, limit, exp, pass) {
        const textBlock = [
            'SSH & OPENVPN ACCOUNT',
            `Username   : ${user}`,
            `Password   : ${pass}`,
            `Host       : ${host}`,
            `Batas IP   : ${limit} Perangkat`,
            `Kadaluarsa : ${exp}`,
            'Port TLS   : 443 | Port WS : 80, 8080, 2082 | UDP : 1-65535',
            `Format WS  : ${host}:80@${user}:${pass}`,
            `Format TLS : ${host}:443@${user}:${pass}`,
            `Payload    : GET / HTTP/1.1[crlf]Host: ${host}[crlf]Upgrade: websocket[crlf]Connection: Upgrade[crlf][crlf]`
        ].join('\n');
        return { summary: `Akun SSH ${user}@${host} siap digunakan.`, primaryUri: `${host}:443@${user}:${pass}`, textBlock };
    }

    function formatXrayAccount(ctx) {
        const { p, user, host, limit, exp, data, formPayload } = ctx;
        const uuid = data.uuid || data.id || data.password || '00000000-0000-4000-8000-000000000000';
        const quotaVal = !formPayload.quota || String(formPayload.quota) === '0' ? 'Tanpa Batas' : `${formPayload.quota} GB`;
        const enc = p === 'vless' ? '&encryption=none' : '';

        const urlTls = data[`${p}_tls`] || data.tls || data.link_tls || data.vmess_tls
            || ((p === 'vless' || p === 'trojan') ? `${p}://${uuid}@${host}:443?path=/${p}&security=tls&host=${host}${enc}&type=ws&sni=${host}#${encodeURIComponent(user)}` : '');
        const urlHttp = data[`${p}_ntls`] || data.ntls || data.http || data.link_http || data.vmess_ntls
            || ((p === 'vless' || p === 'trojan') ? `${p}://${uuid}@${host}:80?path=/${p}&security=none&host=${host}${enc}&type=ws#${encodeURIComponent(user)}` : '');
        const urlGrpc = data[`${p}_grpc`] || data.grpc || data.link_grpc || data.vmess_grpc
            || ((p === 'vless' || p === 'trojan') ? `${p}://${uuid}@${host}:443?mode=gun&security=tls${enc}&type=grpc&serviceName=${p}-grpc&sni=${host}#${encodeURIComponent(user)}` : '');

        const textBlock = [
            `${p.toUpperCase()} TUNNEL ACCOUNT`,
            `Username   : ${user}`,
            `Host / SNI : ${host}`,
            `UUID / Key : ${uuid}`,
            `Kuota      : ${quotaVal} | Batas IP : ${limit} | Exp : ${exp}`,
            '',
            '[TLS 443]', urlTls || '(Dikirim langsung oleh agent VPS)',
            '',
            '[HTTP 80]', urlHttp || '(Dikirim langsung oleh agent VPS)',
            '',
            '[gRPC 443]', urlGrpc || '(Dikirim langsung oleh agent VPS)'
        ].join('\n');

        return { summary: `Akun ${p.toUpperCase()} ${user} aktif hingga ${exp}.`, primaryUri: urlTls || urlHttp || '', textBlock };
    }

    function formatVpnCredentials(action, protocol, data, formPayload = {}) {
        const user = data.username || data.user || formPayload.username || 'client';
        if (action === 'delete') {
            return { summary: `Akun ${user} dihapus.`, primaryUri: '', textBlock: `[STATUS: DELETED]\nUsername : ${user}\nProtokol : ${String(protocol || '').toUpperCase()}` };
        }
        if (action === 'renew') {
            const newExp = data.expired || data.exp || `${formPayload.exp || 30} hari`;
            return { summary: `Akun ${user} diperbarui hingga ${newExp}.`, primaryUri: '', textBlock: `[STATUS: RENEWED]\nUsername   : ${user}\nMasa Aktif : ${newExp}` };
        }
        const p = String(protocol || 'vless').toLowerCase();
        const host = data.domain || data.host || 'tunnel.barmods.id';
        const limit = data.iplimit || data.limit_ip || formPayload.iplimit || '2';
        const exp = data.expired || data.exp || `${formPayload.exp || 30} hari`;

        if (p === 'ssh') {
            return formatSshAccount(user, host, limit, exp, data.password || data.pass || formPayload.password || '1');
        }
        return formatXrayAccount({ p, user, host, limit, exp, data, formPayload });
    }

    return {
        parseTunnelUri,
        applyBugHostOverride,
        toClashYaml,
        toSingBoxJson,
        buildHttpPayload,
        formatVpnCredentials
    };
});
