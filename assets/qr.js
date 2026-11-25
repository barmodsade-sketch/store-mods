(function initQrModule(root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.BarmodsQR = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function createQrEncoder() {
    'use strict';

    const VERSION_TABLE = [
        null,
        { totalData: 19, ecPerBlock: 7, blocks: [1, 19, 0, 0], align: [] },
        { totalData: 34, ecPerBlock: 10, blocks: [1, 34, 0, 0], align: [6, 18] },
        { totalData: 55, ecPerBlock: 15, blocks: [1, 55, 0, 0], align: [6, 22] },
        { totalData: 80, ecPerBlock: 20, blocks: [1, 80, 0, 0], align: [6, 26] },
        { totalData: 108, ecPerBlock: 26, blocks: [1, 108, 0, 0], align: [6, 30] },
        { totalData: 136, ecPerBlock: 18, blocks: [2, 68, 0, 0], align: [6, 34] },
        { totalData: 156, ecPerBlock: 20, blocks: [2, 78, 0, 0], align: [6, 22, 38] },
        { totalData: 194, ecPerBlock: 24, blocks: [2, 97, 0, 0], align: [6, 24, 42] },
        { totalData: 232, ecPerBlock: 30, blocks: [2, 116, 0, 0], align: [6, 26, 46] },
        { totalData: 274, ecPerBlock: 18, blocks: [2, 68, 2, 69], align: [6, 28, 50] },
        { totalData: 324, ecPerBlock: 20, blocks: [4, 81, 0, 0], align: [6, 30, 54] },
        { totalData: 370, ecPerBlock: 24, blocks: [2, 92, 2, 93], align: [6, 32, 58] },
        { totalData: 428, ecPerBlock: 26, blocks: [4, 107, 0, 0], align: [6, 34, 62] },
        { totalData: 461, ecPerBlock: 30, blocks: [3, 115, 1, 116], align: [6, 26, 46, 66] }
    ];

    const GF_EXP = new Uint8Array(512);
    const GF_LOG = new Uint8Array(256);
    (function initGalois() {
        let x = 1;
        for (let i = 0; i < 255; i += 1) {
            GF_EXP[i] = x;
            GF_LOG[x] = i;
            x <<= 1;
            if (x & 0x100) x ^= 0x11d;
        }
        for (let i = 255; i < 512; i += 1) {
            GF_EXP[i] = GF_EXP[i - 255];
        }
    })();

    function gfMul(a, b) {
        if (a === 0 || b === 0) return 0;
        return GF_EXP[GF_LOG[a] + GF_LOG[b]];
    }

    function computeGeneratorPoly(degree) {
        let poly = [1];
        for (let i = 0; i < degree; i += 1) {
            const next = Array.from({ length: poly.length + 1 }, () => 0);
            const root = GF_EXP[i];
            for (let j = 0; j < poly.length; j += 1) {
                next[j] ^= poly[j];
                next[j + 1] ^= gfMul(poly[j], root);
            }
            poly = next;
        }
        return poly;
    }

    function computeReedSolomon(dataBytes, ecCount) {
        const gen = computeGeneratorPoly(ecCount);
        const rem = new Uint8Array(ecCount);
        for (let i = 0; i < dataBytes.length; i += 1) {
            const factor = dataBytes[i] ^ rem[0];
            rem.copyWithin(0, 1);
            rem[ecCount - 1] = 0;
            for (let j = 0; j < ecCount; j += 1) {
                rem[j] ^= gfMul(gen[j + 1], factor);
            }
        }
        return rem;
    }

    function utf8Bytes(text) {
        if (typeof TextEncoder !== 'undefined') {
            return Array.from(new TextEncoder().encode(text));
        }
        return Array.from(Buffer.from(text, 'utf8'));
    }

    function selectVersion(payloadLen) {
        for (let v = 1; v < VERSION_TABLE.length; v += 1) {
            const overhead = v <= 9 ? 2 : 3;
            if (payloadLen + overhead <= VERSION_TABLE[v].totalData) return v;
        }
        return -1;
    }

    function packDataCodewords(bytes, version) {
        const spec = VERSION_TABLE[version];
        const bits = [];
        const pushBits = (val, len) => {
            for (let i = len - 1; i >= 0; i -= 1) bits.push((val >>> i) & 1);
        };
        pushBits(0b0100, 4);
        pushBits(bytes.length, version <= 9 ? 8 : 16);
        for (const b of bytes) pushBits(b, 8);
        pushBits(0, Math.min(4, spec.totalData * 8 - bits.length));
        while (bits.length % 8 !== 0) bits.push(0);

        const codewords = [];
        for (let i = 0; i < bits.length; i += 8) {
            let byte = 0;
            for (let j = 0; j < 8; j += 1) byte = (byte << 1) | bits[i + j];
            codewords.push(byte);
        }
        const pads = [0xec, 0x11];
        let padIdx = 0;
        while (codewords.length < spec.totalData) {
            codewords.push(pads[padIdx % 2]);
            padIdx += 1;
        }
        return codewords;
    }

    function interleaveBlocks(bytes, version) {
        const spec = VERSION_TABLE[version];
        const codewords = packDataCodewords(bytes, version);
        const [g1Blocks, g1Len, g2Blocks, g2Len] = spec.blocks;
        const dataBlocks = [];
        const ecBlocks = [];
        let offset = 0;

        for (let i = 0; i < g1Blocks; i += 1) {
            const slice = codewords.slice(offset, offset + g1Len);
            offset += g1Len;
            dataBlocks.push(slice);
            ecBlocks.push(computeReedSolomon(slice, spec.ecPerBlock));
        }
        for (let i = 0; i < g2Blocks; i += 1) {
            const slice = codewords.slice(offset, offset + g2Len);
            offset += g2Len;
            dataBlocks.push(slice);
            ecBlocks.push(computeReedSolomon(slice, spec.ecPerBlock));
        }

        const interleaved = [];
        const maxLen = Math.max(g1Len, g2Len);
        for (let col = 0; col < maxLen; col += 1) {
            for (const blk of dataBlocks) if (col < blk.length) interleaved.push(blk[col]);
        }
        for (let col = 0; col < spec.ecPerBlock; col += 1) {
            for (const blk of ecBlocks) interleaved.push(blk[col]);
        }
        return interleaved;
    }

    function placeFinder(grid, reserved, row, col) {
        for (let r = -1; r <= 7; r += 1) {
            for (let c = -1; c <= 7; c += 1) {
                const rr = row + r;
                const cc = col + c;
                if (rr < 0 || cc < 0 || rr >= grid.length || cc >= grid.length) continue;
                const inOuter = r >= 0 && r <= 6 && c >= 0 && c <= 6;
                const onBorder = r === 0 || r === 6 || c === 0 || c === 6;
                const inCenter = r >= 2 && r <= 4 && c >= 2 && c <= 4;
                grid[rr][cc] = inOuter && (onBorder || inCenter) ? 1 : 0;
                reserved[rr][cc] = true;
            }
        }
    }

    function placeAlignment(grid, reserved, row, col) {
        for (let r = -2; r <= 2; r += 1) {
            for (let c = -2; c <= 2; c += 1) {
                if (reserved[row + r][col + c]) return;
            }
        }
        for (let r = -2; r <= 2; r += 1) {
            for (let c = -2; c <= 2; c += 1) {
                const onEdge = Math.abs(r) === 2 || Math.abs(c) === 2 || (r === 0 && c === 0);
                grid[row + r][col + c] = onEdge ? 1 : 0;
                reserved[row + r][col + c] = true;
            }
        }
    }

    function writeFormatAndVersion(grid, reserved, version) {
        const size = grid.length;
        const data = 0b01000;
        let rem = data << 10;
        for (let i = 14; i >= 10; i -= 1) if ((rem >>> i) & 1) rem ^= 0x537 << (i - 10);
        const fBits = ((data << 10) | rem) ^ 0x5412;
        const bit = (i) => (fBits >>> i) & 1;

        for (let i = 0; i <= 5; i += 1) grid[8][i] = bit(14 - i);
        grid[8][7] = bit(8);
        grid[8][8] = bit(7);
        grid[7][8] = bit(6);
        for (let i = 9; i < 15; i += 1) grid[14 - i][8] = bit(14 - i);
        for (let i = 0; i < 8; i += 1) grid[8][size - 1 - i] = bit(i);
        for (let i = 8; i < 15; i += 1) grid[size - 15 + i][8] = bit(i);
        grid[size - 8][8] = 1;

        if (version >= 7) {
            let vRem = version << 12;
            for (let i = 17; i >= 12; i -= 1) if ((vRem >>> i) & 1) vRem ^= 0x1f25 << (i - 12);
            const vBits = (version << 12) | vRem;
            for (let i = 0; i < 18; i += 1) {
                const val = (vBits >>> i) & 1;
                const r = Math.floor(i / 3);
                const c = size - 11 + (i % 3);
                grid[r][c] = val;
                grid[c][r] = val;
                reserved[r][c] = true;
                reserved[c][r] = true;
            }
        }
    }

    function reserveFixedPatterns(grid, reserved, version) {
        const size = grid.length;
        placeFinder(grid, reserved, 0, 0);
        placeFinder(grid, reserved, 0, size - 7);
        placeFinder(grid, reserved, size - 7, 0);
        for (const r of VERSION_TABLE[version].align) {
            for (const c of VERSION_TABLE[version].align) placeAlignment(grid, reserved, r, c);
        }
        for (let i = 8; i < size - 8; i += 1) {
            if (!reserved[6][i]) { grid[6][i] = i % 2 === 0 ? 1 : 0; reserved[6][i] = true; }
            if (!reserved[i][6]) { grid[i][6] = i % 2 === 0 ? 1 : 0; reserved[i][6] = true; }
        }
        for (let i = 0; i < 9; i += 1) { reserved[8][i] = true; reserved[i][8] = true; }
        for (let i = 0; i < 8; i += 1) { reserved[8][size - 1 - i] = true; reserved[size - 1 - i][8] = true; }
        reserved[size - 8][8] = true;
        writeFormatAndVersion(grid, reserved, version);
    }

    function buildMatrix(text) {
        const bytes = utf8Bytes(String(text || ''));
        if (!bytes.length) throw new Error('Teks QR kosong.');
        const version = selectVersion(bytes.length);
        if (version < 0) throw new Error('Teks melebihi kapasitas kode QR (maksimal 450 karakter).');

        const size = version * 4 + 17;
        const grid = Array.from({ length: size }, () => new Uint8Array(size));
        const reserved = Array.from({ length: size }, () => Array.from({ length: size }, () => false));
        reserveFixedPatterns(grid, reserved, version);

        const bitStream = [];
        for (const cw of interleaveBlocks(bytes, version)) {
            for (let b = 7; b >= 0; b -= 1) bitStream.push((cw >>> b) & 1);
        }

        let bitIdx = 0;
        let upward = true;
        for (let col = size - 1; col >= 1; col -= 2) {
            if (col === 6) col = 5;
            for (let step = 0; step < size; step += 1) {
                const row = upward ? size - 1 - step : step;
                for (let dx = 0; dx < 2; dx += 1) {
                    const cc = col - dx;
                    if (!reserved[row][cc]) {
                        const rawBit = bitIdx < bitStream.length ? bitStream[bitIdx] : 0;
                        bitIdx += 1;
                        grid[row][cc] = rawBit ^ ((row + cc) % 2 === 0 ? 1 : 0);
                    }
                }
            }
            upward = !upward;
        }
        writeFormatAndVersion(grid, reserved, version);
        return grid;
    }

    function computePathData(text, margin = 3) {
        const matrix = buildMatrix(text);
        const total = matrix.length + margin * 2;
        let pathD = '';
        for (let r = 0; r < matrix.length; r += 1) {
            for (let c = 0; c < matrix.length; c += 1) {
                if (matrix[r][c]) pathD += `M${c + margin},${r + margin}h1v1h-1z`;
            }
        }
        return { total, pathD };
    }

    function renderSvg(text, options = {}) {
        const { total, pathD } = computePathData(text, options.margin ?? 3);
        const dark = options.darkColor || '#071120';
        const light = options.lightColor || '#ffffff';
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="220" height="220" role="img" aria-label="Kode QR konfigurasi"><rect width="${total}" height="${total}" rx="2" fill="${light}"/><path d="${pathD}" fill="${dark}"/></svg>`;
    }

    function renderSvgElement(text, options = {}) {
        const { total, pathD } = computePathData(text, options.margin ?? 3);
        const ns = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(ns, 'svg');
        svg.setAttribute('viewBox', `0 0 ${total} ${total}`);
        svg.setAttribute('width', '220');
        svg.setAttribute('height', '220');
        svg.setAttribute('role', 'img');
        svg.setAttribute('aria-label', 'Kode QR konfigurasi');

        const rect = document.createElementNS(ns, 'rect');
        rect.setAttribute('width', String(total));
        rect.setAttribute('height', String(total));
        rect.setAttribute('rx', '2');
        rect.setAttribute('fill', options.lightColor || '#ffffff');

        const path = document.createElementNS(ns, 'path');
        path.setAttribute('d', pathD);
        path.setAttribute('fill', options.darkColor || '#071120');

        svg.append(rect, path);
        return svg;
    }

    return {
        buildMatrix,
        renderSvg,
        renderSvgElement
    };
});
