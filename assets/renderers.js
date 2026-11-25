(function initRenderers(root) {
    'use strict';

    function el(tag, attrs = {}, children = []) {
        const node = document.createElement(tag);
        for (const [key, val] of Object.entries(attrs)) {
            if (val === undefined || val === null || val === false) continue;
            if (key === 'className') node.className = val;
            else if (key === 'text') node.textContent = String(val);
            else if (key === 'style') node.setAttribute('style', String(val));
            else if (key.startsWith('data-')) node.setAttribute(key, String(val));
            else node.setAttribute(key, val === true ? '' : String(val));
        }
        const list = Array.isArray(children) ? children : [children];
        for (const child of list) {
            if (child === null || child === undefined || child === false) continue;
            node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
        }
        return node;
    }

    function mount(container, content) {
        if (!container) return;
        const nodes = Array.isArray(content) ? content.filter(Boolean) : [content].filter(Boolean);
        container.replaceChildren(...nodes);
    }

    function createStateBanner(type, title, detail) {
        const tone = type === 'error' ? 'state-error' : type === 'loading' ? 'state-loading' : 'state-empty';
        return el('div', { className: `state-card ${tone}`, role: type === 'error' ? 'alert' : 'status' }, [
            el('p', { className: 'state-title', text: title }),
            el('p', { className: 'state-detail', text: detail })
        ]);
    }

    function metricCell(label, value, mono = false) {
        return el('div', { className: 'glass-inset metric-cell' }, [
            el('span', { className: 'metric-label', text: label }),
            el('strong', { className: mono ? 'mono-text' : '', text: value ?? '-' })
        ]);
    }

    function buildKuotaNode(payload) {
        const sub = payload.subscriber || {};
        const pkgs = Array.isArray(payload.packages) ? payload.packages : [];

        const metaGrid = el('div', { className: 'metric-grid' }, [
            metricCell('Nomor MSISDN', sub.msisdn, true),
            metricCell('Operator & Jaringan', `${sub.operator || '-'} (${sub.network || '-'})`),
            metricCell('Masa Aktif', sub.activeUntil),
            metricCell('Masa Tenggang', sub.graceUntil)
        ]);

        if (!pkgs.length) {
            return el('div', { className: 'result-stack' }, [
                metaGrid,
                createStateBanner('empty', 'Tidak ada paket kuota aktif', 'Kartu aktif tetapi belum memiliki paket data berjalan.')
            ]);
        }

        const pkgCards = pkgs.map((pkg) => {
            const quotaItems = (pkg.quotas || []).map((q) => {
                const pct = q.percent != null ? Number(q.percent) : null;
                const valText = q.remaining !== '-' || q.total !== '-' ? `${q.remaining} / ${q.total}` : '';
                return el('div', { className: 'quota-item' }, [
                    el('div', { className: 'quota-row-top' }, [
                        el('span', { text: q.name }),
                        valText ? el('span', { className: 'mono-text', text: valText }) : null
                    ]),
                    pct != null
                        ? el('div', { className: 'quota-bar-track', 'aria-label': `Sisa ${pct}%` }, [
                            el('div', { className: 'quota-bar-fill', style: `width:${pct}%` })
                        ])
                        : null
                ]);
            });
            return el('article', { className: 'glass-inset pkg-card' }, [
                el('div', { className: 'pkg-header' }, [
                    el('h4', { text: pkg.name }),
                    el('span', { className: 'badge-tag', text: `Aktif s/d ${pkg.expiry}` })
                ]),
                el('div', { className: 'quota-list' }, quotaItems)
            ]);
        });

        return el('div', { className: 'result-stack' }, [
            el('div', { className: 'result-meta-row' }, [
                el('span', { className: 'badge-tag', text: `Sumber: ${payload.source || 'Gateway'}` }),
                el('span', { className: 'muted-note', text: `Umur kartu: ${sub.tenure || '-'}` })
            ]),
            metaGrid,
            el('div', { className: 'pkg-grid' }, pkgCards)
        ]);
    }

    function buildUploadNode(payload) {
        const items = Array.isArray(payload.data) ? payload.data : [];
        const successUrls = items.filter((r) => r.status === 'success' && r.url).map((r) => r.url);

        const rows = items.map((item) => {
            const ok = item.status === 'success' && item.url;
            return el('div', { className: 'glass-inset upload-host-row' }, [
                el('div', {}, [
                    el('div', { className: 'host-title-line' }, [
                        el('span', { className: `status-dot ${ok ? 'dot-ok' : 'dot-err'}` }),
                        el('strong', { text: item.provider }),
                        el('span', { className: 'mono-text muted-note', text: `${item.durationMs} ms` })
                    ]),
                    ok
                        ? el('a', { href: item.url, target: '_blank', rel: 'noopener noreferrer', className: 'result-link mono-text', text: item.url })
                        : el('p', { className: 'muted-note', text: item.reason || 'Host menolak unggahan' })
                ]),
                ok ? el('button', { type: 'button', className: 'btn-secondary btn-compact', 'data-copy-text': item.url, text: 'Salin' }) : null
            ]);
        });

        return el('div', { className: 'result-stack' }, [
            el('div', { className: 'glass-inset file-digest-bar' }, [
                el('div', {}, [
                    el('strong', { text: `${payload.fileName} ` }),
                    el('span', { className: 'muted-note', text: `(${(Number(payload.sizeBytes || 0) / 1024).toFixed(1)} KB)` })
                ]),
                el('span', { className: 'mono-text muted-note', text: `SHA-256: ${String(payload.sha256 || '').slice(0, 20)}...` }),
                successUrls.length
                    ? el('button', { type: 'button', className: 'btn-secondary btn-compact', 'data-copy-text': successUrls.join('\n'), text: `Salin Semua URL (${successUrls.length})` })
                    : null
            ]),
            el('div', { className: 'upload-grid' }, rows)
        ]);
    }

    function pickMediaUrl(candidates) {
        for (const entry of candidates) {
            const val = Array.isArray(entry) ? entry[0] : entry;
            if (typeof val !== 'string' || !val) continue;
            if (val.startsWith('//')) return `https:${val}`;
            if (val.startsWith('http') || val.startsWith('data:image/')) return val;
        }
        return '';
    }

    function buildMediaNode(actionType, resData) {
        const data = resData.data;
        if (actionType === 'iqc' || actionType === 'ssweb') {
            const label = actionType === 'iqc' ? 'Kutipan Chat iPhone' : `Tangkapan Layar (${resData.device || 'desktop'})`;
            return el('div', { className: 'result-stack' }, [
                el('p', { className: 'section-sub', text: label }),
                el('img', { src: data, alt: label, width: '960', height: '540', className: 'preview-media-img' }),
                el('div', { className: 'action-row' }, [
                    el('a', { href: data, download: `${actionType}_${Date.now()}.png`, className: 'btn-primary', text: 'Unduh Gambar' }),
                    resData.url ? el('a', { href: resData.url, target: '_blank', rel: 'noopener noreferrer', className: 'btn-secondary', text: 'Buka Situs Asli' }) : null
                ])
            ]);
        }

        if (actionType === 'pinterest') {
            const list = Array.isArray(data) ? data : [];
            return el('div', { className: 'result-stack' }, [
                el('p', { className: 'section-sub', text: `Ditemukan ${list.length} gambar untuk "${resData.query}"` }),
                el('div', { className: 'pin-grid' }, list.map((imgUrl, idx) =>
                    el('a', { href: imgUrl, target: '_blank', rel: 'noopener noreferrer', className: 'pin-card glass-inset' }, [
                        el('img', { src: imgUrl, alt: `Referensi ${resData.query} ${idx + 1}`, width: '320', height: '320', loading: 'lazy' })
                    ])
                ))
            ]);
        }

        if (actionType === 'yt_play') {
            return el('div', { className: 'result-stack' }, [
                el('div', { className: 'media-summary-card glass-inset' }, [
                    data.thumbnail ? el('img', { src: data.thumbnail, alt: data.title, width: '480', height: '270', className: 'yt-thumb' }) : null,
                    el('div', { className: 'media-meta' }, [
                        el('h4', { text: data.title }),
                        el('p', { className: 'muted-note', text: `Durasi: ${data.duration} | Tayangan: ${data.views}` }),
                        el('div', { className: 'action-row' }, [
                            data.audio ? el('a', { href: data.audio, target: '_blank', rel: 'noopener noreferrer', className: 'btn-primary', text: 'Unduh / Putar Audio' }) : null,
                            data.url ? el('a', { href: data.url, target: '_blank', rel: 'noopener noreferrer', className: 'btn-secondary', text: 'Lihat di YouTube' }) : null
                        ])
                    ])
                ])
            ]);
        }

        const title = String(data?.title || data?.nama || data?.description || 'Berkas Media').slice(0, 140);
        const vidUrl = pickMediaUrl([data?.mp4, data?.video, data?.url_video, data?.video_url, data?.nowm, data?.no_watermark, data?.play]);
        const audUrl = pickMediaUrl([data?.mp3, data?.audio, data?.url_audio, data?.m4a, data?.audio_url, data?.music, data?.music_url]);
        const slides = Array.isArray(data?.images) ? data.images : [];

        return el('div', { className: 'result-stack' }, [
            el('div', { className: 'glass-inset pkg-card' }, [
                el('h4', { text: title }),
                el('div', { className: 'action-row' }, [
                    vidUrl ? el('a', { href: vidUrl, target: '_blank', rel: 'noopener noreferrer', className: 'btn-primary', text: 'Unduh Video Tanpa Watermark' }) : null,
                    audUrl ? el('a', { href: audUrl, target: '_blank', rel: 'noopener noreferrer', className: 'btn-secondary', text: 'Unduh Audio MP3' }) : null
                ])
            ]),
            slides.length
                ? el('div', { className: 'pin-grid' }, slides.map((u, i) =>
                    el('a', { href: u, target: '_blank', rel: 'noopener noreferrer', className: 'pin-card glass-inset' }, [
                        el('img', { src: u, alt: `Slide ${i + 1}`, width: '300', height: '300', loading: 'lazy' })
                    ])
                ))
                : null
        ]);
    }

    function buildNetworkLabNode(mode, res) {
        if (mode === 'ip_intel') {
            const d = res.data || {};
            const ptr = Array.isArray(d.reverseDns) && d.reverseDns.length ? d.reverseDns.join(', ') : 'Tidak ada PTR';
            return el('div', { className: 'metric-grid' }, [
                metricCell('Alamat IP & Tipe', `${d.ip} (${d.type})`, true),
                metricCell('ISP / Organisasi', d.isp),
                metricCell('ASN & Domain', `AS${d.asn} (${d.domain})`, true),
                metricCell('Lokasi & Zona Waktu', `${d.city}, ${d.region}, ${d.country} (${d.timezone})`),
                metricCell('Koordinat', `${d.latitude}, ${d.longitude}`, true),
                metricCell('Reverse DNS (PTR)', ptr, true)
            ]);
        }

        if (mode === 'dns_lookup') {
            return el('div', { className: 'result-stack' }, (res.results || []).map((r) => {
                const formatted = Array.isArray(r.records) && r.records.length
                    ? r.records.map((item) => (typeof item === 'object' ? `${item.priority} ${item.exchange}` : String(item))).join('\n')
                    : 'Tidak ada record';
                return el('div', { className: 'glass-inset dns-row' }, [
                    el('div', { className: 'dns-head' }, [
                        el('span', { className: 'badge-tag mono-text', text: r.type }),
                        el('span', { className: 'mono-text muted-note', text: `${r.durationMs} ms` })
                    ]),
                    el('pre', { className: 'code-output mono-text', text: formatted })
                ]);
            }));
        }

        if (mode === 'ssl_check') {
            const c = res.certificate || {};
            const h = res.securityHeaders || {};
            return el('div', { className: 'result-stack' }, [
                el('div', { className: 'metric-grid' }, [
                    metricCell('Subjek & Penerbit', `${c.subject} (${c.issuer})`),
                    metricCell('Sisa Masa Berlaku', `${c.daysRemaining != null ? `${c.daysRemaining} hari` : '-'} (s/d ${c.validTo})`),
                    metricCell('Protokol & Handshake', `${c.protocol} / ${c.handshakeMs} ms`, true),
                    metricCell('Server & Cloudflare', `${h.server} ${h.cfRay ? '(CF Proxy Aktif)' : ''}`),
                    metricCell('Header Keamanan', `HSTS: ${h.strictTransportSecurity ? 'Aktif' : 'Absen'} | CSP: ${h.contentSecurityPolicy ? 'Aktif' : 'Absen'}`),
                    metricCell('HTTP Status', res.httpStatus || '-', true)
                ]),
                c.altNames?.length
                    ? el('div', { className: 'glass-inset pkg-card' }, [
                        el('p', { className: 'metric-label', text: 'Subject Alternative Names (SAN)' }),
                        el('p', { className: 'mono-text muted-note', text: c.altNames.join(', ') })
                    ])
                    : null
            ]);
        }

        if (mode === 'subdomain_scan') {
            const subs = Array.isArray(res.subdomains) ? res.subdomains : [];
            if (!subs.length) return createStateBanner('empty', 'Subdomain tidak ditemukan', 'Log Certificate Transparency belum mencatat subdomain publik untuk domain ini.');
            return el('div', { className: 'result-stack' }, [
                el('div', { className: 'result-meta-row' }, [
                    el('span', { className: 'badge-tag', text: `Ditemukan ${subs.length} Subdomain` }),
                    el('button', { type: 'button', className: 'btn-secondary btn-compact', 'data-copy-text': subs.join('\n'), text: 'Salin Daftar Subdomain' })
                ]),
                el('pre', { className: 'code-output mono-text', text: subs.join('\n') })
            ]);
        }

        return el('div', { className: 'result-stack' }, [
            el('div', { className: 'metric-grid' }, [
                metricCell('Host & IP', `${res.hostname} (${(res.resolvedIps || []).join(', ')})`, true),
                metricCell('Resolusi DNS', `${res.dnsMs} ms`, true),
                metricCell('Rata-rata HTTP RTT', res.avgMs != null ? `${res.avgMs} ms` : 'Timeout', true),
                metricCell('Rentang Min / Maks', `${res.minMs ?? '-'} ms / ${res.maxMs ?? '-'} ms`, true)
            ]),
            el('div', { className: 'upload-grid' }, (res.samples || []).map((s) =>
                el('div', { className: 'glass-inset upload-host-row' }, [
                    el('span', { text: `Percobaan #${s.seq} (${s.ok ? `HTTP ${s.status}` : 'Gagal'})` }),
                    el('strong', { className: 'mono-text', text: `${s.latencyMs} ms` })
                ])
            ))
        ]);
    }

    root.BarmodsRenderers = {
        el,
        mount,
        createStateBanner,
        buildKuotaNode,
        buildUploadNode,
        buildMediaNode,
        buildNetworkLabNode
    };
})(typeof globalThis !== 'undefined' ? globalThis : this);
