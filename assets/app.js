(function runBarmodsApp() {
    'use strict';

    const Render = window.BarmodsRenderers;
    const Studio = window.BarmodsConfigStudio;
    const QR = window.BarmodsQR;
    const Store = window.BarmodsCatalogVault;
    const UtilForms = window.BarmodsUtilityForms;

    const STORAGE_KEYS = {
        theme: 'barmods_theme_v2',
        cart: 'barmods_cart_v2',
        vault: 'barmods_vault_v2',
        kuotaHistory: 'barmods_kuota_recent_v2',
        aiHistory: 'barmods_ai_history_v2'
    };

    const WORKSPACE_META = {
        catalog: { title: 'Katalog & Keranjang Layanan', sub: 'Pilih paket tunnel, masa aktif, atau VPS lalu kirim rincian pesanan otomatis ke WhatsApp Admin.' },
        vpn: { title: 'Panel Deploy VPN & Vault Akun', sub: 'Kelola pembuatan akun server secara instan dan simpan salinan kredensial di brankas lokal peramban.' },
        studio: { title: 'Config Studio & Generator QR', sub: 'Konversi URI VLESS/VMess/Trojan menjadi YAML Clash atau JSON Sing-box beserta kode QR SVG lokal.' },
        netlab: { title: 'Laboratorium Diagnostik Jaringan', sub: 'Inspeksi geolokasi IP/ASN, record DNS, sertifikat SSL/TLS, subdomain CT, dan latensi host.' },
        kuota: { title: 'Pemeriksa Kuota XL & Axis', sub: 'Periksa sisa kuota paket data, umur kartu, serta masa tenggang nomor XL dan Axis.' },
        uploader: { title: 'Pengunggah Multi-Cloud Paralel', sub: 'Unggah satu berkas hingga 3.5 MB ke enam penyedia penyimpanan awan secara bersamaan.' },
        media: { title: 'Studio Ekstraksi Media & Web', sub: 'Unduh media TikTok/YouTube, cari referensi gambar, tangkap layar web, atau buat kutipan chat.' },
        ai: { title: 'Asisten Teknis AI Barmods', sub: 'Diskusi multi-giliran seputar konfigurasi tunnel, skrip jaringan, dan pemecahan masalah server.' }
    };

    const state = {
        activeTab: 'catalog',
        categoryFilter: 'all',
        netTool: 'ip_intel',
        cart: readStorage(STORAGE_KEYS.cart, []),
        vault: readStorage(STORAGE_KEYS.vault, []),
        kuotaRecent: readStorage(STORAGE_KEYS.kuotaHistory, []),
        aiHistory: readStorage(STORAGE_KEYS.aiHistory, []),
        lastVpnOutput: null,
        audioIdx: 0
    };

    const SHORTCUTS = [
        { label: 'Buka Katalog & Keranjang Layanan', hint: 'Ruang Kerja', run: () => activateWorkspace('catalog') },
        { label: 'Buka Panel Deploy VPN & Vault', hint: 'Ruang Kerja', run: () => activateWorkspace('vpn') },
        { label: 'Konversi VLESS/VMess ke Clash YAML', hint: 'Config Studio', run: () => activateWorkspace('studio') },
        { label: 'Periksa Sertifikat SSL/TLS Domain', hint: 'Network Lab', run: () => { activateWorkspace('netlab'); selectNetTool('ssl_check'); } },
        { label: 'Cari Subdomain Bug Host (crt.sh)', hint: 'Network Lab', run: () => { activateWorkspace('netlab'); selectNetTool('subdomain_scan'); } },
        { label: 'Resolusi Record DNS (A/AAAA/MX/TXT)', hint: 'Network Lab', run: () => { activateWorkspace('netlab'); selectNetTool('dns_lookup'); } },
        { label: 'Cek Kuota Kartu XL / Axis', hint: 'Utilitas', run: () => activateWorkspace('kuota') },
        { label: 'Unggah Berkas ke 6 Cloud Server', hint: 'Utilitas', run: () => activateWorkspace('uploader') },
        { label: 'Tanya Asisten Teknis AI Barmods', hint: 'Asisten', run: () => activateWorkspace('ai') },
        { label: 'Ganti Tema Gelap / Terang (Liquid Glass)', hint: 'Tampilan', run: () => toggleTheme() }
    ];

    function readStorage(key, fallback) {
        try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
        catch (err) { return err ? fallback : fallback; }
    }

    function writeStorage(key, val) {
        try { localStorage.setItem(key, JSON.stringify(val)); }
        catch (err) { showToast(`Penyimpanan penuh (${err.message}).`); }
    }

    function showToast(message) {
        const rack = document.getElementById('toastContainer');
        if (!rack) return;
        const item = Render.el('div', { className: 'toast-item', role: 'status', text: message });
        rack.appendChild(item);
        setTimeout(() => item.remove(), 3200);
    }

    async function copyText(text, msg = 'Teks berhasil disalin.') {
        if (!text) return;
        try { await navigator.clipboard.writeText(text); showToast(msg); }
        catch (err) { showToast(`Gagal menyalin otomatis (${err.message}).`); }
    }

    function downloadFile(filename, content, mime = 'text/plain;charset=utf-8') {
        const url = URL.createObjectURL(new Blob([content], { type: mime }));
        const link = Render.el('a', { href: url, download: filename });
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    }

    async function callApi(payload) {
        const started = performance.now();
        const res = await fetch('/api/vpn', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        document.getElementById('telemetryLatencyText').textContent = `${Math.round(performance.now() - started)} ms`;
        const rawText = await res.text();
        let data;
        try {
            data = rawText ? JSON.parse(rawText) : {};
        } catch (parseErr) {
            const detail = res.status === 413 ? 'Ukuran berkas melebihi batas payload Vercel.' : `Respons gateway HTTP ${res.status} (${parseErr.message.slice(0, 24)}).`;
            return { ok: false, data: { status: 'error', message: detail } };
        }
        return { ok: res.ok && data.status !== 'error', data };
    }

    function applyTheme(theme) {
        const clean = theme === 'light' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', clean);
        document.getElementById('themeLabel').textContent = clean === 'light' ? 'Frosted Pearl' : 'Obsidian Dark';
        try { localStorage.setItem(STORAGE_KEYS.theme, clean); } catch (err) { if (err) showToast(err.message); }
    }

    function toggleTheme() {
        applyTheme((document.documentElement.getAttribute('data-theme') || 'dark') === 'dark' ? 'light' : 'dark');
    }

    function activateWorkspace(tabId) {
        if (!WORKSPACE_META[tabId]) return;
        state.activeTab = tabId;
        document.querySelectorAll('[data-tab]').forEach((btn) => {
            if (btn.dataset.tab === tabId) btn.setAttribute('aria-current', 'page');
            else btn.removeAttribute('aria-current');
        });
        Object.keys(WORKSPACE_META).forEach((id) => {
            const panel = document.getElementById(`panel-${id}`);
            if (panel) panel.hidden = id !== tabId;
        });
        document.getElementById('workspaceTitle').textContent = WORKSPACE_META[tabId].title;
        document.getElementById('workspaceSubtitle').textContent = WORKSPACE_META[tabId].sub;
        document.getElementById('sidebarNav').classList.remove('is-open');
        document.getElementById('mobileBackdrop').classList.remove('is-open');
    }

    async function syncServerTelemetry() {
        const dot = document.getElementById('telemetryStatusDot');
        const txt = document.getElementById('telemetryStatusText');
        txt.textContent = 'Memeriksa sensor...';
        try {
            const res = await callApi({ action: 'server_stats' });
            dot.className = `status-dot ${res.data.status === 'success' ? 'dot-ok' : res.data.status === 'unconfigured' ? 'dot-warn' : 'dot-err'}`;
            txt.textContent = res.data.status === 'success' ? 'Sensor VPS Online' : res.data.status === 'unconfigured' ? 'API Aktif (Mode Lokal)' : 'Sensor VPS Offline';
        } catch (err) {
            dot.className = 'status-dot dot-err';
            txt.textContent = `Terputus (${err.message.slice(0, 16)})`;
        }
    }

    function randomToken(len) {
        const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
        const bytes = new Uint8Array(len);
        crypto.getRandomValues(bytes);
        return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
    }

    function openQrModal(uriText, caption) {
        if (!uriText) return showToast('Tidak ada URI untuk dirender.');
        try {
            const modal = document.getElementById('qrModal');
            Render.mount(document.getElementById('qrModalSvgBox'), QR.renderSvgElement(uriText));
            document.getElementById('qrModalCaption').textContent = caption || uriText.slice(0, 64);
            modal.dataset.currentSvg = QR.renderSvg(uriText);
            modal.hidden = false;
        } catch (err) {
            showToast(err.message);
        }
    }

    function runStudioConversion() {
        const rawUri = document.getElementById('studioUriInput').value;
        const outEl = document.getElementById('studioConfigOutput');
        const qrBox = document.getElementById('studioQrPreview');
        try {
            const parsed = Studio.parseTunnelUri(rawUri);
            const node = Studio.applyBugHostOverride(parsed, document.getElementById('studioBugHostInput').value, document.getElementById('studioBugModeSelect').value);
            outEl.textContent = document.getElementById('studioOutFormatSelect').value === 'singbox' ? Studio.toSingBoxJson(node) : Studio.toClashYaml(node);
            Render.mount(qrBox, QR.renderSvgElement(rawUri.trim()));
        } catch (err) {
            outEl.textContent = `Kesalahan konversi: ${err.message}`;
            Render.mount(qrBox, Render.createStateBanner('error', 'QR belum dapat dibuat', err.message));
        }
    }

    function selectNetTool(toolId) {
        state.netTool = toolId;
        document.querySelectorAll('[data-nettool]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.nettool === toolId)));
        const hints = { ip_intel: 'Contoh: 1.1.1.1 atau kosongkan untuk IP sendiri', dns_lookup: 'Contoh: cloudflare.com', ssl_check: 'Contoh: github.com', subdomain_scan: 'Contoh: vidio.com', ping_check: 'Contoh: https://one.one.one.one' };
        const input = document.getElementById('netlabTargetInput');
        input.placeholder = hints[toolId] || 'Masukkan domain atau IP';
        input.required = toolId !== 'ip_intel';
        document.getElementById('netlabMyIpBtn').hidden = toolId !== 'ip_intel';
    }

    function renderAiMessages() {
        const box = document.getElementById('aiChatLog');
        if (!state.aiHistory.length) {
            Render.mount(box, Render.createStateBanner('empty', 'Mulai diskusi teknis', 'Pilih salah satu topik cepat di atas atau ketik pertanyaan konfigurasi jaringan Anda.'));
            return;
        }
        Render.mount(box, state.aiHistory.map((m) => Render.el('div', { className: `chat-msg ${m.role === 'user' ? 'chat-msg-user' : 'chat-msg-assistant'}`, text: m.content })));
        box.scrollTop = box.scrollHeight;
    }

    function handleDelegatedClick(ev) {
        const t = ev.target;
        const copyBtn = t.closest('[data-copy-text]');
        if (copyBtn) return copyText(copyBtn.dataset.copyText);
        const addCart = t.closest('[data-add-cart]');
        if (addCart) {
            state.cart = Store.mutateCart(state.cart, addCart.dataset.addCart, 1);
            writeStorage(STORAGE_KEYS.cart, state.cart);
            Store.renderCart(Render, state.cart);
            return showToast('Layanan ditambahkan ke keranjang.');
        }
        const directWa = t.closest('[data-direct-wa]');
        if (directWa) {
            const item = Store.CATALOG_ITEMS.find((c) => c.id === directWa.dataset.directWa);
            return item && Store.openWhatsAppOrder([`- 1x ${item.title} (${Store.formatRupiah(item.price)})`], Store.formatRupiah(item.price));
        }
        const deltaBtn = t.closest('[data-cart-delta]');
        if (deltaBtn) {
            state.cart = Store.mutateCart(state.cart, deltaBtn.dataset.cartId, Number(deltaBtn.dataset.cartDelta));
            writeStorage(STORAGE_KEYS.cart, state.cart);
            return Store.renderCart(Render, state.cart);
        }
        const vCopy = t.closest('[data-vault-copy]');
        if (vCopy) return copyText(state.vault.find((v) => v.id === vCopy.dataset.vaultCopy)?.textBlock, 'Kredensial akun disalin.');
        const vQr = t.closest('[data-vault-qr]');
        if (vQr) {
            const found = state.vault.find((v) => v.id === vQr.dataset.vaultQr);
            return found && openQrModal(found.primaryUri, `${found.protocol.toUpperCase()} - ${found.username}`);
        }
        const vDel = t.closest('[data-vault-del]');
        if (vDel) {
            state.vault = state.vault.filter((v) => v.id !== vDel.dataset.vaultDel);
            writeStorage(STORAGE_KEYS.vault, state.vault);
            return Store.renderVault(Render, state.vault, document.getElementById('vaultSearchInput').value);
        }
        const cmdBtn = t.closest('[data-cmd-idx]');
        if (cmdBtn) {
            document.getElementById('cmdPaletteModal').hidden = true;
            return SHORTCUTS[Number(cmdBtn.dataset.cmdIdx)]?.run();
        }
        const kuotaChip = t.closest('[data-kuota-num]');
        if (kuotaChip) {
            document.getElementById('kuotaNumberInput').value = kuotaChip.dataset.kuotaNum;
            document.getElementById('kuotaForm').requestSubmit();
        }
    }

    function bindVpnAndStudio() {
        const syncVpnVis = () => {
            const act = document.getElementById('vpnAction').value;
            const proto = document.getElementById('vpnProtocol').value;
            document.getElementById('vpnDetailWrap').hidden = act === 'delete';
            document.getElementById('vpnPassWrap').hidden = !(proto === 'ssh' && act !== 'delete' && act !== 'renew');
            document.getElementById('vpnQuotaWrap').hidden = proto === 'ssh';
        };
        document.getElementById('vpnAction').addEventListener('change', syncVpnVis);
        document.getElementById('vpnProtocol').addEventListener('change', syncVpnVis);
        syncVpnVis();

        document.getElementById('genRandomUserBtn').addEventListener('click', () => { document.getElementById('vpnUsername').value = `bm_${randomToken(6)}`; });
        document.getElementById('genRandomPassBtn').addEventListener('click', () => { document.getElementById('vpnPassword').value = randomToken(10); });
        document.getElementById('vaultSearchInput').addEventListener('input', (e) => Store.renderVault(Render, state.vault, e.target.value));
        document.getElementById('vaultExportBtn').addEventListener('click', () => state.vault.length ? downloadFile(`barmods-vault-${Date.now()}.json`, JSON.stringify(state.vault, null, 2), 'application/json') : showToast('Brankas masih kosong.'));
        document.getElementById('vaultClearBtn').addEventListener('click', () => { state.vault = []; writeStorage(STORAGE_KEYS.vault, []); Store.renderVault(Render, [], ''); });

        document.getElementById('vpnDeployForm').addEventListener('submit', async (ev) => {
            ev.preventDefault();
            const outBox = document.getElementById('vpnOutputContainer');
            Render.mount(outBox, Render.createStateBanner('loading', 'Menghubungi panel server...', 'Memverifikasi Developer PIN dan mengeksekusi perintah tunnel.'));
            const payload = {
                action: document.getElementById('vpnAction').value,
                protocol: document.getElementById('vpnProtocol').value,
                username: document.getElementById('vpnUsername').value.trim(),
                password: document.getElementById('vpnPassword').value,
                exp: document.getElementById('vpnExp').value,
                iplimit: document.getElementById('vpnIpLimit').value,
                quota: document.getElementById('vpnQuota').value,
                dev_pin: document.getElementById('vpnDevPin').value
            };
            try {
                const res = await callApi(payload);
                if (!res.ok) return Render.mount(outBox, Render.createStateBanner('error', 'Eksekusi Ditolak', res.data.message || 'Gagal memproses akun.'));
                const formatted = Studio.formatVpnCredentials(payload.action, payload.protocol, res.data.data || {}, payload);
                state.lastVpnOutput = Object.assign({ username: payload.username, protocol: payload.protocol }, formatted);
                Render.mount(outBox, Render.el('pre', { className: 'code-output mono-text', text: formatted.textBlock }));
                document.getElementById('vpnSaveVaultBtn').disabled = false;
                document.getElementById('vpnCopyOutputBtn').disabled = false;
                document.getElementById('vpnShowQrBtn').disabled = !formatted.primaryUri;
            } catch (err) {
                Render.mount(outBox, Render.createStateBanner('error', 'Koneksi Gagal', err.message));
            }
        });

        document.getElementById('vpnCopyOutputBtn').addEventListener('click', () => state.lastVpnOutput && copyText(state.lastVpnOutput.textBlock, 'Detail akun disalin.'));
        document.getElementById('vpnShowQrBtn').addEventListener('click', () => state.lastVpnOutput?.primaryUri && openQrModal(state.lastVpnOutput.primaryUri, state.lastVpnOutput.summary));
        document.getElementById('vpnSaveVaultBtn').addEventListener('click', () => {
            if (!state.lastVpnOutput) return;
            state.vault = [{ id: `${Date.now()}_${randomToken(4)}`, username: state.lastVpnOutput.username, protocol: state.lastVpnOutput.protocol, primaryUri: state.lastVpnOutput.primaryUri, textBlock: state.lastVpnOutput.textBlock, savedAt: new Date().toLocaleString('id-ID') }, ...state.vault].slice(0, 50);
            writeStorage(STORAGE_KEYS.vault, state.vault);
            Store.renderVault(Render, state.vault, document.getElementById('vaultSearchInput').value);
            showToast('Akun disimpan ke Brankas Lokal.');
        });

        document.getElementById('studioSampleBtn').addEventListener('click', () => {
            document.getElementById('studioUriInput').value = 'vless://a189c320-6c1b-4b74-9c44-91b02f1190ab@sg1.barmods.id:443?path=%2Fvless&security=tls&encryption=none&host=sg1.barmods.id&type=ws&sni=sg1.barmods.id#Barmods-SG1';
            runStudioConversion();
        });
        document.getElementById('studioConvertBtn').addEventListener('click', runStudioConversion);
        document.getElementById('studioOutFormatSelect').addEventListener('change', runStudioConversion);
        document.getElementById('studioCopyConfigBtn').addEventListener('click', () => copyText(document.getElementById('studioConfigOutput').textContent, 'Konfigurasi disalin.'));
        document.getElementById('studioDownloadConfigBtn').addEventListener('click', () => downloadFile(`barmods-proxy.${document.getElementById('studioOutFormatSelect').value === 'singbox' ? 'json' : 'yaml'}`, document.getElementById('studioConfigOutput').textContent));
        document.getElementById('payloadGenerateBtn').addEventListener('click', () => {
            document.getElementById('payloadResultOutput').textContent = Studio.buildHttpPayload({ serverHost: document.getElementById('payloadServerInput').value, bugHost: document.getElementById('payloadBugInput').value, mode: document.getElementById('payloadModeSelect').value });
        });
        document.getElementById('payloadCopyBtn').addEventListener('click', () => copyText(document.getElementById('payloadResultOutput').textContent, 'Payload HTTP disalin.'));
    }

    function bindAiAndShell() {
        document.querySelectorAll('[data-ai-prompt]').forEach((c) => c.addEventListener('click', () => { document.getElementById('aiPromptInput').value = c.dataset.aiPrompt; document.getElementById('aiChatForm').requestSubmit(); }));
        document.getElementById('aiClearBtn').addEventListener('click', () => { state.aiHistory = []; writeStorage(STORAGE_KEYS.aiHistory, []); renderAiMessages(); });
        document.getElementById('aiExportBtn').addEventListener('click', () => state.aiHistory.length ? downloadFile(`barmods-ai-${Date.now()}.txt`, state.aiHistory.map((m) => `[${m.role.toUpperCase()}]\n${m.content}`).join('\n\n')) : showToast('Riwayat kosong.'));
        document.getElementById('aiChatForm').addEventListener('submit', async (ev) => {
            ev.preventDefault();
            const input = document.getElementById('aiPromptInput');
            const prompt = input.value.trim();
            if (!prompt) return;
            input.value = '';
            const snapshot = state.aiHistory.slice(-8);
            state.aiHistory.push({ role: 'user', content: prompt });
            renderAiMessages();
            const btn = document.getElementById('aiSendBtn');
            btn.disabled = true;
            try {
                const res = await callApi({ action: 'ai_chat', username: prompt, persona: document.getElementById('aiPersonaSelect').value, history: snapshot });
                state.aiHistory.push({ role: 'assistant', content: res.ok ? res.data.reply : `Kendala layanan: ${res.data.message}` });
                writeStorage(STORAGE_KEYS.aiHistory, state.aiHistory.slice(-24));
            } catch (err) {
                state.aiHistory.push({ role: 'assistant', content: `Koneksi terputus (${err.message}).` });
            } finally {
                btn.disabled = false;
                renderAiMessages();
            }
        });

        document.getElementById('themeToggleBtn').addEventListener('click', toggleTheme);
        document.getElementById('serverSyncBtn').addEventListener('click', syncServerTelemetry);
        document.getElementById('mobileMenuBtn').addEventListener('click', () => { document.getElementById('sidebarNav').classList.add('is-open'); document.getElementById('mobileBackdrop').classList.add('is-open'); });
        document.getElementById('closeSidebarBtn').addEventListener('click', () => activateWorkspace(state.activeTab));
        document.getElementById('mobileBackdrop').addEventListener('click', () => activateWorkspace(state.activeTab));
        document.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => activateWorkspace(b.dataset.tab)));
        document.addEventListener('click', handleDelegatedClick);

        document.getElementById('catalogSearchInput').addEventListener('input', (e) => Store.renderCatalog(Render, state.categoryFilter, e.target.value));
        document.querySelectorAll('[data-category]').forEach((chip) => chip.addEventListener('click', () => {
            state.categoryFilter = chip.dataset.category;
            document.querySelectorAll('[data-category]').forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
            Store.renderCatalog(Render, state.categoryFilter, document.getElementById('catalogSearchInput').value);
        }));
        document.getElementById('cartClearBtn').addEventListener('click', () => { state.cart = []; writeStorage(STORAGE_KEYS.cart, []); Store.renderCart(Render, []); });
        document.getElementById('cartCheckoutBtn').addEventListener('click', () => {
            if (!state.cart.length) return showToast('Tambahkan minimal satu layanan terlebih dahulu.');
            const sum = state.cart.reduce((acc, c) => acc + c.price * c.qty, 0);
            Store.openWhatsAppOrder(state.cart.map((c) => `- ${c.qty}x ${c.title} (${Store.formatRupiah(c.price * c.qty)})`), Store.formatRupiah(sum));
        });

        const audioEl = document.getElementById('bgAudioEl');
        const tracks = (document.body.dataset.audioTracks || '').split('|').filter(Boolean);
        document.getElementById('audioToggleBtn').addEventListener('click', () => {
            if (!tracks.length) return;
            if (!audioEl.src) audioEl.src = tracks[state.audioIdx];
            if (audioEl.paused) { audioEl.volume = 0.45; audioEl.play().catch((err) => showToast(err.message)); document.getElementById('audioToggleLabel').textContent = 'Jeda Audio'; }
            else { audioEl.pause(); document.getElementById('audioToggleLabel').textContent = 'Putar Audio'; }
        });
        document.getElementById('audioNextBtn').addEventListener('click', () => {
            if (!tracks.length) return;
            state.audioIdx = (state.audioIdx + 1) % tracks.length;
            audioEl.src = tracks[state.audioIdx];
            audioEl.play().catch((err) => showToast(err.message));
            document.getElementById('audioToggleLabel').textContent = 'Jeda Audio';
        });

        const openCmd = () => { document.getElementById('cmdPaletteModal').hidden = false; document.getElementById('cmdSearchInput').value = ''; Store.renderCommandPalette(Render, SHORTCUTS, ''); document.getElementById('cmdSearchInput').focus(); };
        document.getElementById('openCmdPaletteBtn').addEventListener('click', openCmd);
        document.getElementById('closeCmdPaletteBtn').addEventListener('click', () => { document.getElementById('cmdPaletteModal').hidden = true; });
        document.getElementById('cmdSearchInput').addEventListener('input', (e) => Store.renderCommandPalette(Render, SHORTCUTS, e.target.value));
        document.getElementById('qrModalCloseBtn').addEventListener('click', () => { document.getElementById('qrModal').hidden = true; });
        document.getElementById('qrModalDownloadBtn').addEventListener('click', () => { const svg = document.getElementById('qrModal').dataset.currentSvg; if (svg) downloadFile(`barmods-qr-${Date.now()}.svg`, svg, 'image/svg+xml'); });

        document.addEventListener('keydown', (ev) => {
            if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'k') { ev.preventDefault(); openCmd(); }
            else if (ev.key === 'Escape') { document.getElementById('cmdPaletteModal').hidden = true; document.getElementById('qrModal').hidden = true; activateWorkspace(state.activeTab); }
        });

        if (!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
            document.addEventListener('pointermove', (ev) => {
                const p = ev.target.closest?.('.glass-panel');
                if (!p) return;
                const r = p.getBoundingClientRect();
                p.style.setProperty('--pointer-x', `${Math.round(ev.clientX - r.left)}px`);
                p.style.setProperty('--pointer-y', `${Math.round(ev.clientY - r.top)}px`);
            }, { passive: true });
        }
    }

    applyTheme(localStorage.getItem(STORAGE_KEYS.theme) || 'dark');
    Store.renderCatalog(Render, 'all', '');
    Store.renderCart(Render, state.cart);
    Store.renderVault(Render, state.vault, '');
    selectNetTool('ip_intel');
    renderAiMessages();
    bindVpnAndStudio();
    UtilForms.bindNetworkAndKuota({ Render, state, callApi, writeStorage, kuotaKey: STORAGE_KEYS.kuotaHistory, selectNetTool });
    UtilForms.bindUploaderAndMedia({ Render, callApi });
    bindAiAndShell();
    setInterval(() => { document.getElementById('liveClockText').textContent = new Date().toLocaleTimeString('id-ID', { hour12: false }); }, 1000);
    syncServerTelemetry();
})();
