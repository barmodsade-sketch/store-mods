'use strict';

const fs = require('fs');
const path = require('path');
const { runValidation } = require('./validate');

const ROOT = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT, 'dist');

function copyRecursive(src, dest) {
    const stat = fs.statSync(src);
    if (stat.isDirectory()) {
        fs.mkdirSync(dest, { recursive: true });
        for (const entry of fs.readdirSync(src)) {
            copyRecursive(path.join(src, entry), path.join(dest, entry));
        }
        return;
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
}

function buildStaticBundle() {
    runValidation();
    fs.mkdirSync(DIST_DIR, { recursive: true });
    copyRecursive(path.join(ROOT, 'index.html'), path.join(DIST_DIR, 'index.html'));
    copyRecursive(path.join(ROOT, '404.html'), path.join(DIST_DIR, '404.html'));
    copyRecursive(path.join(ROOT, 'assets'), path.join(DIST_DIR, 'assets'));
    process.stdout.write(`Vercel static bundle ready at ${DIST_DIR}\n`);
}

if (require.main === module) {
    buildStaticBundle();
}

module.exports = {
    buildStaticBundle
};
