'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { escapeHtml, verifyPin, isPrivateIpAddress, normalizePublicUrl } = require('../lib/http');
const QR = require('../assets/qr');
const Studio = require('../assets/config-studio');
const { buildStaticBundle } = require('../scripts/build');
const { createAppServer } = require('../server');

test('Vercel layout exposes strictly 1 serverless endpoint in api/ and builds dist/ cleanly', () => {
    const apiEntries = fs.readdirSync(path.join(__dirname, '..', 'api'));
    assert.deepEqual(apiEntries, ['vpn.js']);

    const distDir = path.join(__dirname, '..', 'dist');
    try {
        buildStaticBundle();
        assert.equal(fs.existsSync(path.join(distDir, 'index.html')), true);
        assert.equal(fs.existsSync(path.join(distDir, '404.html')), true);
        assert.equal(fs.existsSync(path.join(distDir, 'assets', 'app.js')), true);
    } finally {
        fs.rmSync(distDir, { recursive: true, force: true });
    }
});

test('HTTP security helpers neutralize XSS, private IPs, and PIN mismatches', () => {
    assert.equal(escapeHtml('<img src=x onerror="alert(1)">'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
    assert.equal(verifyPin('994411', '994411'), true);
    assert.equal(verifyPin('994412', '994411'), false);
    assert.equal(verifyPin('99', '994411'), false);
    assert.equal(verifyPin('', '994411'), false);

    assert.equal(isPrivateIpAddress('127.0.0.1'), true);
    assert.equal(isPrivateIpAddress('169.254.169.254'), true);
    assert.equal(isPrivateIpAddress('192.168.1.10'), true);
    assert.equal(isPrivateIpAddress('::1'), true);
    assert.equal(isPrivateIpAddress('1.1.1.1'), false);

    assert.equal(normalizePublicUrl('http://127.0.0.1:8080/secret').ok, false);
    assert.equal(normalizePublicUrl('http://localhost/admin').ok, false);
    assert.equal(normalizePublicUrl('javascript:alert(1)').ok, false);
    const pub = normalizePublicUrl('cloudflare.com');
    assert.equal(pub.ok, true);
    assert.equal(pub.hostname, 'cloudflare.com');
});

test('Offline QR SVG encoder builds valid QR matrices for VLESS and text payloads', () => {
    const sampleUri = 'vless://a189c320-6c1b-4b74-9c44-91b02f1190ab@sg1.barmods.id:443?path=%2Fvless&security=tls&type=ws#Barmods';
    const matrix = QR.buildMatrix(sampleUri);
    assert.ok(matrix.length >= 29);
    assert.equal(matrix[0][0], 1);
    assert.equal(matrix[0][6], 1);
    assert.equal(matrix[6][0], 1);

    const svg = QR.renderSvg(sampleUri);
    assert.ok(svg.startsWith('<svg'));
    assert.ok(svg.includes('role="img"'));
});

test('Config Studio parses VLESS, VMess, and Trojan URIs into Clash YAML and Sing-box JSON', () => {
    const vless = Studio.parseTunnelUri(
        'vless://a189c320-6c1b-4b74-9c44-91b02f1190ab@sg1.barmods.id:443?path=%2Fvless&security=tls&host=sg1.barmods.id&type=ws&sni=sg1.barmods.id#Barmods-SG1'
    );
    assert.equal(vless.protocol, 'vless');
    assert.equal(vless.server, 'sg1.barmods.id');
    assert.equal(vless.port, 443);

    const overridden = Studio.applyBugHostOverride(vless, 'quiz.vidio.com', 'cdn_address');
    assert.equal(overridden.server, 'quiz.vidio.com');
    assert.equal(overridden.sni, 'sg1.barmods.id');

    const yaml = Studio.toClashYaml(overridden);
    assert.ok(yaml.includes('type: vless'));
    assert.ok(yaml.includes('server: quiz.vidio.com'));
    assert.ok(yaml.includes('servername: sg1.barmods.id'));

    const vmessPayload = Buffer.from(
        JSON.stringify({ v: '2', ps: 'VMess-ID', add: 'id1.barmods.id', port: '443', id: '1234-uuid', aid: '0', net: 'ws', path: '/vmess', tls: 'tls' })
    ).toString('base64');
    const vmess = Studio.parseTunnelUri(`vmess://${vmessPayload}`);
    const singbox = JSON.parse(Studio.toSingBoxJson(vmess));
    assert.equal(singbox.outbounds[0].type, 'vmess');
    assert.equal(singbox.outbounds[0].server, 'id1.barmods.id');

    const payload = Studio.buildHttpPayload({ serverHost: 'sg1.barmods.id', bugHost: 'quiz.vidio.com', mode: 'ws_cdn' });
    assert.ok(payload.includes('X-Online-Host: quiz.vidio.com'));
});

test('HTTP server serves Liquid Glass UI, enforces path safety, and validates API actions', async () => {
    process.env.ADMIN_PIN = '778899';
    process.env.VPS_DOMAIN = 'vps.example.com';
    process.env.VPS_AUTH = 'token123';

    const server = createAppServer();
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    const base = `http://127.0.0.1:${port}`;

    try {
        const homeRes = await fetch(`${base}/`);
        assert.equal(homeRes.status, 200);
        const html = await homeRes.text();
        assert.ok(html.includes('<meta name="generator" content="Build by konoha">'));
        assert.ok(html.includes('Build by konoha'));
        assert.ok(html.includes('id="liquid-refraction"'));

        const cssTxt = fs.readFileSync(path.join(__dirname, '..', 'assets', 'styles.css'), 'utf8');
        assert.ok(cssTxt.includes('[data-theme="light"]'));
        assert.ok(cssTxt.includes('prefers-reduced-motion: reduce'));

        const traversalRes = await fetch(`${base}/package.json`);
        assert.equal(traversalRes.status, 404);

        const healthRes = await fetch(`${base}/api/health`);
        assert.equal(healthRes.status, 200);

        const getVpn = await fetch(`${base}/api/vpn`);
        assert.equal(getVpn.status, 405);

        const badJson = await fetch(`${base}/api/vpn`, { method: 'POST', body: '{broken' });
        assert.equal(badJson.status, 400);

        const sswebEmpty = await fetch(`${base}/api/vpn`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'ssweb' })
        });
        assert.equal(sswebEmpty.status, 400);

        const sswebSsrf = await fetch(`${base}/api/vpn`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'ssweb', username: 'http://127.0.0.1/private' })
        });
        assert.equal(sswebSsrf.status, 400);

        const badKuota = await fetch(`${base}/api/vpn`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'cekkuota', username: '123' })
        });
        assert.equal(badKuota.status, 400);

        const badProtocol = await fetch(`${base}/api/vpn`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'create', protocol: '../etc', username: 'user01', dev_pin: '778899' })
        });
        assert.equal(badProtocol.status, 400);

        const wrongPin = await fetch(`${base}/api/vpn`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'create', protocol: 'vless', username: 'user01', dev_pin: '000000' })
        });
        assert.equal(wrongPin.status, 403);
    } finally {
        await new Promise((resolve) => server.close(resolve));
        delete process.env.ADMIN_PIN;
        delete process.env.VPS_DOMAIN;
        delete process.env.VPS_AUTH;
    }
});
