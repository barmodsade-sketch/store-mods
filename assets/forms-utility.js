(function initUtilityForms(root) {
    'use strict';

    function bindNetworkAndKuota(ctx) {
        const { Render, state, callApi, writeStorage, kuotaKey, selectNetTool } = ctx;

        document.querySelectorAll('[data-nettool]').forEach((b) => {
            b.addEventListener('click', () => selectNetTool(b.dataset.nettool));
        });
        document.getElementById('netlabMyIpBtn').addEventListener('click', () => {
            document.getElementById('netlabTargetInput').value = '';
            document.getElementById('netlabForm').requestSubmit();
        });
        document.getElementById('netlabForm').addEventListener('submit', async (ev) => {
            ev.preventDefault();
            const area = document.getElementById('netlabResultArea');
            Render.mount(area, Render.createStateBanner('loading', 'Menjalankan pemindaian jaringan...', 'Mengukur respons protokol secara langsung dari server.'));
            try {
                const res = await callApi({ action: state.netTool, target: document.getElementById('netlabTargetInput').value.trim() });
                Render.mount(area, res.ok ? Render.buildNetworkLabNode(state.netTool, res.data) : Render.createStateBanner('error', 'Diagnostik Gagal', res.data.message));
            } catch (err) {
                Render.mount(area, Render.createStateBanner('error', 'Kesalahan Jaringan', err.message));
            }
        });

        const renderKuotaChips = () => {
            Render.mount(
                document.getElementById('kuotaRecentChips'),
                state.kuotaRecent.map((n) => Render.el('button', { type: 'button', className: 'filter-chip mono-text', 'data-kuota-num': n, text: n }))
            );
        };
        renderKuotaChips();

        document.getElementById('kuotaForm').addEventListener('submit', async (ev) => {
            ev.preventDefault();
            const num = document.getElementById('kuotaNumberInput').value.trim();
            const area = document.getElementById('kuotaResultArea');
            Render.mount(area, Render.createStateBanner('loading', 'Memeriksa paket kartu...', 'Menghubungkan ke gateway operator XL / Axis.'));
            try {
                const res = await callApi({ action: 'cekkuota', username: num });
                if (!res.ok) {
                    Render.mount(area, Render.createStateBanner('error', 'Pemeriksaan Belum Berhasil', res.data.message));
                    return;
                }
                state.kuotaRecent = [num, ...state.kuotaRecent.filter((x) => x !== num)].slice(0, 5);
                writeStorage(kuotaKey, state.kuotaRecent);
                renderKuotaChips();
                Render.mount(area, Render.buildKuotaNode(res.data));
            } catch (err) {
                Render.mount(area, Render.createStateBanner('error', 'Waktu Tunggu Habis', err.message));
            }
        });
    }

    function bindUploaderAndMedia(ctx) {
        const { Render, callApi } = ctx;
        const fileInput = document.getElementById('uploaderFileInput');
        const dropzone = document.getElementById('uploaderDropzone');

        const showFileDigest = async () => {
            const file = fileInput.files?.[0];
            if (!file) return;
            const hashBuf = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
            const hex = Array.from(new Uint8Array(hashBuf), (b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
            document.getElementById('uploaderFileInfo').textContent = `${file.name} (${(file.size / 1024).toFixed(1)} KB) | SHA-256: ${hex}...`;
        };

        fileInput.addEventListener('change', showFileDigest);
        dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('drag-over'); });
        dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
        dropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropzone.classList.remove('drag-over');
            if (e.dataTransfer?.files?.length) {
                fileInput.files = e.dataTransfer.files;
                showFileDigest();
            }
        });

        document.getElementById('uploaderForm').addEventListener('submit', (ev) => {
            ev.preventDefault();
            const file = fileInput.files?.[0];
            const area = document.getElementById('uploaderResultArea');
            if (!file || file.size > 3 * 1024 * 1024) {
                Render.mount(area, Render.createStateBanner('error', 'Berkas tidak memenuhi syarat', 'Pilih berkas dengan ukuran maksimal 3 MB agar lolos batas fungsi serverless Vercel.'));
                return;
            }
            Render.mount(area, Render.createStateBanner('loading', 'Mengunggah ke 6 server awan...', 'Mohon tunggu hingga seluruh penyedia selesai merespons.'));
            const reader = new FileReader();
            reader.onload = async (loadEv) => {
                try {
                    const res = await callApi({ action: 'tourl', fileBase64: loadEv.target.result, fileName: file.name, mimeType: file.type });
                    Render.mount(area, res.ok ? Render.buildUploadNode(res.data) : Render.createStateBanner('error', 'Unggahan Gagal', res.data.message));
                } catch (err) {
                    Render.mount(area, Render.createStateBanner('error', 'Koneksi Terputus', err.message));
                }
            };
            reader.readAsDataURL(file);
        });

        document.getElementById('mediaModeSelect').addEventListener('change', (ev) => {
            const hints = {
                auto: 'Tempel tautan video TikTok atau YouTube...',
                yt_play: 'Ketik judul lagu atau nama penyanyi...',
                pinterest: 'Ketik kata kunci referensi visual...',
                ssweb_pc: 'Masukkan alamat situs (contoh: example.com)...',
                ssweb_hp: 'Masukkan alamat situs untuk tampilan seluler...',
                iqc: 'Tulis kalimat untuk dijadikan kutipan iPhone...'
            };
            document.getElementById('mediaQueryInput').placeholder = hints[ev.target.value] || 'Masukkan URL atau kata kunci...';
        });

        document.getElementById('mediaForm').addEventListener('submit', async (ev) => {
            ev.preventDefault();
            const rawMode = document.getElementById('mediaModeSelect').value;
            const query = document.getElementById('mediaQueryInput').value.trim();
            const area = document.getElementById('mediaResultArea');
            const action = rawMode === 'auto' ? (query.includes('youtu') ? 'youtube' : 'tiktok') : rawMode.startsWith('ssweb') ? 'ssweb' : rawMode;
            const device = rawMode === 'ssweb_hp' ? 'mobile' : 'desktop';
            Render.mount(area, Render.createStateBanner('loading', 'Memproses permintaan media...', 'Menyiapkan pratinjau hasil ekstraksi.'));
            try {
                const res = await callApi({ action, username: query, device });
                Render.mount(area, res.ok ? Render.buildMediaNode(action, res.data) : Render.createStateBanner('error', 'Pemrosesan Gagal', res.data.message));
            } catch (err) {
                Render.mount(area, Render.createStateBanner('error', 'Koneksi Gagal', err.message));
            }
        });
    }

    root.BarmodsUtilityForms = {
        bindNetworkAndKuota,
        bindUploaderAndMedia
    };
})(typeof globalThis !== 'undefined' ? globalThis : this);
