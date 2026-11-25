'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const OUTPUT_ZIP = path.resolve(PROJECT_ROOT, '..', 'barmods-tunnel-main.zip');
const PREFIX = 'barmods-tunnel-main';

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
        c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    CRC_TABLE[n] = c >>> 0;
}

function crc32(buf) {
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i += 1) {
        crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function collectFiles(dir, relBase = '') {
    const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    const list = [];
    for (const ent of entries) {
        if (ent.name === 'node_modules' || ent.name === '.git' || ent.name === 'dist' || ent.name === '.vercel') continue;
        const rel = relBase ? `${relBase}/${ent.name}` : ent.name;
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) {
            list.push(...collectFiles(full, rel));
        } else if (ent.isFile()) {
            list.push({ full, zipName: `${PREFIX}/${rel}` });
        }
    }
    return list;
}

function createZipArchive() {
    const files = collectFiles(PROJECT_ROOT);
    const localChunks = [];
    const centralChunks = [];
    let offset = 0;

    for (const item of files) {
        const raw = fs.readFileSync(item.full);
        const compressed = zlib.deflateRawSync(raw, { level: 9 });
        const useStore = compressed.length >= raw.length;
        const payload = useStore ? raw : compressed;
        const method = useStore ? 0 : 8;
        const sum = crc32(raw);
        const nameBuf = Buffer.from(item.zipName, 'utf8');

        const localHeader = Buffer.alloc(30);
        localHeader.writeUInt32LE(0x04034b50, 0);
        localHeader.writeUInt16LE(20, 4);
        localHeader.writeUInt16LE(0x0800, 6);
        localHeader.writeUInt16LE(method, 8);
        localHeader.writeUInt16LE(0, 10);
        localHeader.writeUInt16LE(0x5d7a, 12);
        localHeader.writeUInt32LE(sum, 14);
        localHeader.writeUInt32LE(payload.length, 18);
        localHeader.writeUInt32LE(raw.length, 22);
        localHeader.writeUInt16LE(nameBuf.length, 26);
        localHeader.writeUInt16LE(0, 28);

        localChunks.push(localHeader, nameBuf, payload);

        const centralHeader = Buffer.alloc(46);
        centralHeader.writeUInt32LE(0x02014b50, 0);
        centralHeader.writeUInt16LE(20, 4);
        centralHeader.writeUInt16LE(20, 6);
        centralHeader.writeUInt16LE(0x0800, 8);
        centralHeader.writeUInt16LE(method, 10);
        centralHeader.writeUInt16LE(0, 12);
        centralHeader.writeUInt16LE(0x5d7a, 14);
        centralHeader.writeUInt32LE(sum, 16);
        centralHeader.writeUInt32LE(payload.length, 20);
        centralHeader.writeUInt32LE(raw.length, 24);
        centralHeader.writeUInt16LE(nameBuf.length, 28);
        centralHeader.writeUInt16LE(0, 30);
        centralHeader.writeUInt16LE(0, 32);
        centralHeader.writeUInt16LE(0, 34);
        centralHeader.writeUInt16LE(0, 36);
        centralHeader.writeUInt32LE(0, 38);
        centralHeader.writeUInt32LE(offset, 42);

        centralChunks.push(centralHeader, nameBuf);
        offset += localHeader.length + nameBuf.length + payload.length;
    }

    const centralBuffer = Buffer.concat(centralChunks);
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(0, 4);
    eocd.writeUInt16LE(0, 6);
    eocd.writeUInt16LE(files.length, 8);
    eocd.writeUInt16LE(files.length, 10);
    eocd.writeUInt32LE(centralBuffer.length, 12);
    eocd.writeUInt32LE(offset, 16);
    eocd.writeUInt16LE(0, 20);

    const archive = Buffer.concat([...localChunks, centralBuffer, eocd]);
    fs.writeFileSync(OUTPUT_ZIP, archive);
    process.stdout.write(`Packed ${files.length} files into ${OUTPUT_ZIP} (${archive.length} bytes).\n`);
}

createZipArchive();
