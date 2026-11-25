(function initCatalogVault(root) {
    'use strict';

    const CATALOG_ITEMS = [
        { id: 'vpn-init', category: 'tunnel', title: 'VPN Tunnel (Paket Awal 2 IP)', price: 10000, badges: ['SSH', 'VLESS', 'VMESS', 'Trojan'], desc: 'Akun multi-protokol 30 hari dengan dukungan WebSocket, TLS 443, dan gRPC.' },
        { id: 'vpn-renew', category: 'tunnel', title: 'Perpanjang VPN Tunnel (1 Bulan)', price: 7000, badges: ['Perpanjangan', '30 Hari'], desc: 'Perpanjangan masa aktif sebelum sisa 3 hari masa berlaku akun berakhir.' },
        { id: 'vpn-addip', category: 'tunnel', title: 'Tambahan Kuota Login (+1 IP)', price: 3000, badges: ['Add-on', '+1 Perangkat'], desc: 'Tambah batas perangkat simultan pada akun tunnel yang sedang aktif.' },
        { id: 'aktif-xl', category: 'masa_aktif', title: 'Masa Aktif Kartu XL Axiata (1 Bulan)', price: 7000, badges: ['XL Axiata', '30 Hari'], desc: 'Perpanjang masa aktif kartu XL tanpa perlu mengisi pulsa reguler.' },
        { id: 'aktif-axis', category: 'masa_aktif', title: 'Masa Aktif Kartu AXIS (1 Bulan)', price: 7000, badges: ['AXIS', '30 Hari'], desc: 'Perpanjang masa aktif nomor AXIS instan langsung terproses.' },
        { id: 'app-yt', category: 'premium', title: 'YouTube Premium (Famhead 1 Bulan)', price: 5000, badges: ['Famhead', '5 Slot Invite'], desc: 'Akun kepala keluarga selama 1 bulan, dapat mengundang hingga 5 akun anggota.' },
        { id: 'app-am', category: 'premium', title: 'Alight Motion Pro Privat (1 Tahun)', price: 4000, badges: ['1 Tahun', 'Akun Privat'], desc: 'Akses privat penuh selama 12 bulan tanpa tanda air dan efek terbuka.' },
        { id: 'vps-dewabiz', category: 'vps', title: 'Cloud VPS Dewabiz R1C1 (Indonesia)', price: 65000, badges: ['Region ID', 'Root Penuh'], desc: 'Server virtual Indonesia dengan bandwidth tanpa batas dan akses root penuh.' }
    ];

    function formatRupiah(amount) {
        return `Rp ${Number(amount || 0).toLocaleString('id-ID')}`;
    }

    function renderCatalog(Render, categoryFilter, queryText) {
        const { el, mount, createStateBanner } = Render;
        const query = String(queryText || '').trim().toLowerCase();
        const filtered = CATALOG_ITEMS.filter((item) => {
            const catMatch = categoryFilter === 'all' || item.category === categoryFilter;
            const textMatch = !query || item.title.toLowerCase().includes(query) || item.desc.toLowerCase().includes(query);
            return catMatch && textMatch;
        });

        const grid = document.getElementById('catalogGrid');
        if (!filtered.length) {
            mount(grid, createStateBanner('empty', 'Produk tidak ditemukan', 'Ubah kata kunci pencarian atau pilih kategori Semua Layanan.'));
            return;
        }

        const cards = filtered.map((item) =>
            el('article', { className: 'glass-inset product-card' }, [
                el('div', { className: 'product-top' }, [
                    el('div', { className: 'badge-row' }, item.badges.map((b) => el('span', { className: 'badge-tag', text: b }))),
                    el('h4', { className: 'product-title', text: item.title }),
                    el('p', { className: 'product-desc', text: item.desc })
                ]),
                el('div', {}, [
                    el('p', { className: 'price-line mono-text', text: formatRupiah(item.price) }),
                    el('div', { className: 'product-actions' }, [
                        el('button', { type: 'button', className: 'btn-secondary btn-compact', 'data-add-cart': item.id, text: '+ Keranjang' }),
                        el('button', { type: 'button', className: 'btn-primary btn-compact', 'data-direct-wa': item.id, text: 'Pesan Instan' })
                    ])
                ])
            ])
        );
        mount(grid, cards);
    }

    function renderCart(Render, cartItems) {
        const { el, mount, createStateBanner } = Render;
        const listEl = document.getElementById('cartItemsList');
        const totalEl = document.getElementById('cartTotalValue');
        const badgeEl = document.getElementById('cartBadgeCount');

        const totalQty = cartItems.reduce((sum, entry) => sum + entry.qty, 0);
        const totalPrice = cartItems.reduce((sum, entry) => sum + entry.price * entry.qty, 0);
        if (badgeEl) badgeEl.textContent = String(totalQty);
        if (totalEl) totalEl.textContent = formatRupiah(totalPrice);

        if (!cartItems.length) {
            mount(listEl, createStateBanner('empty', 'Keranjang masih kosong', 'Klik "+ Keranjang" pada layanan di kiri untuk menggabungkan beberapa paket sekaligus.'));
            return;
        }

        const rows = cartItems.map((entry) =>
            el('div', { className: 'glass-inset cart-row' }, [
                el('div', {}, [
                    el('strong', { text: entry.title }),
                    el('p', { className: 'muted-note mono-text', text: `${formatRupiah(entry.price)} x ${entry.qty}` })
                ]),
                el('div', { className: 'qty-controls' }, [
                    el('button', { type: 'button', className: 'qty-btn', 'aria-label': `Kurangi ${entry.title}`, 'data-cart-delta': '-1', 'data-cart-id': entry.id, text: '-' }),
                    el('span', { className: 'mono-text', text: String(entry.qty) }),
                    el('button', { type: 'button', className: 'qty-btn', 'aria-label': `Tambah ${entry.title}`, 'data-cart-delta': '1', 'data-cart-id': entry.id, text: '+' })
                ])
            ])
        );
        mount(listEl, rows);
    }

    function mutateCart(cartItems, itemId, delta) {
        const catalogItem = CATALOG_ITEMS.find((c) => c.id === itemId);
        if (!catalogItem) return cartItems;
        const copy = cartItems.map((c) => Object.assign({}, c));
        const existing = copy.find((c) => c.id === itemId);
        if (existing) {
            existing.qty += delta;
            return copy.filter((c) => c.qty > 0);
        }
        if (delta > 0) {
            copy.push({ id: catalogItem.id, title: catalogItem.title, price: catalogItem.price, qty: 1 });
        }
        return copy;
    }

    function openWhatsAppOrder(lines, totalText) {
        const waNum = document.body.dataset.waAdmin || '6283877842721';
        const origin = document.body.dataset.waOrigin || '';
        const note = (document.getElementById('cartNoteInput')?.value || '').trim();
        const msgParts = ['Halo Admin Barmods, saya ingin memesan layanan berikut:', '', ...lines, '', `Total Estimasi: ${totalText}`];
        if (note) msgParts.push(`Catatan: ${note}`);
        window.open(`${origin}/${waNum}?text=${encodeURIComponent(msgParts.join('\n'))}`, '_blank', 'noopener,noreferrer');
    }

    function renderVault(Render, vaultItems, queryText) {
        const { el, mount, createStateBanner } = Render;
        const q = String(queryText || '').trim().toLowerCase();
        const box = document.getElementById('vaultListContainer');
        const items = vaultItems.filter((v) => !q || v.username.toLowerCase().includes(q) || v.protocol.toLowerCase().includes(q));
        if (!items.length) {
            mount(box, createStateBanner('empty', 'Brankas akun kosong', 'Akun VPN yang Anda simpan dari hasil deploy akan tampil di sini secara lokal.'));
            return;
        }
        const nodes = items.map((entry) =>
            el('div', { className: 'glass-inset vault-item' }, [
                el('div', {}, [
                    el('span', { className: 'badge-tag mono-text', text: entry.protocol.toUpperCase() }),
                    el('strong', { className: 'mono-text', style: 'margin-left:8px;', text: entry.username }),
                    el('p', { className: 'muted-note', text: entry.savedAt })
                ]),
                el('div', { className: 'action-row' }, [
                    el('button', { type: 'button', className: 'btn-secondary btn-compact', 'data-vault-copy': entry.id, text: 'Salin' }),
                    entry.primaryUri ? el('button', { type: 'button', className: 'btn-secondary btn-compact', 'data-vault-qr': entry.id, text: 'QR' }) : null,
                    el('button', { type: 'button', className: 'btn-secondary btn-compact', 'data-vault-del': entry.id, text: 'Hapus' })
                ])
            ])
        );
        mount(box, nodes);
    }

    function renderCommandPalette(Render, shortcuts, queryText) {
        const { el, mount, createStateBanner } = Render;
        const q = String(queryText || '').trim().toLowerCase();
        const matches = shortcuts.filter((c) => !q || c.label.toLowerCase().includes(q) || c.hint.toLowerCase().includes(q));
        const list = document.getElementById('cmdResultsList');
        if (!matches.length) {
            mount(list, createStateBanner('empty', 'Perintah tidak ditemukan', 'Coba kata kunci lain seperti Clash, SSL, DNS, atau Kuota.'));
            return;
        }
        mount(list, matches.map((item, idx) =>
            el('button', {
                type: 'button',
                className: 'cmd-item',
                'data-cmd-idx': String(shortcuts.indexOf(item)),
                'aria-selected': String(idx === 0)
            }, [
                el('span', { text: item.label }),
                el('span', { className: 'badge-tag', text: item.hint })
            ])
        ));
    }

    root.BarmodsCatalogVault = {
        CATALOG_ITEMS,
        formatRupiah,
        renderCatalog,
        renderCart,
        mutateCart,
        openWhatsAppOrder,
        renderVault,
        renderCommandPalette
    };
})(typeof globalThis !== 'undefined' ? globalThis : this);
