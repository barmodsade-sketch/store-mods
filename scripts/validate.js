'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

const JS_FILES = [
    'server.js',
    'api/vpn.js',
    'lib/config.js',
    'lib/http.js',
    'lib/network-tools.js',
    'lib/cloud-kuota.js',
    'lib/media-vpn.js',
    'lib/services.js',
    'assets/qr.js',
    'assets/config-studio.js',
    'assets/renderers.js',
    'assets/catalog-vault.js',
    'assets/forms-utility.js',
    'assets/app.js',
    'scripts/build.js',
    'scripts/pack-zip.js'
];

const TEXT_AUDIT_FILES = [
    ...JS_FILES,
    'index.html',
    '404.html',
    'assets/styles.css',
    'README.md'
];

const EMOJI_PATTERN = /\p{Extended_Pictographic}/u;
const FORBIDDEN_DASH_PATTERN = /[\u2014\u2013]/;

function assertCondition(cond, msg, failures) {
    if (!cond) failures.push(msg);
}

function runValidation() {
    const failures = [];

    for (const rel of JS_FILES) {
        const full = path.join(ROOT, rel);
        if (!fs.existsSync(full)) {
            failures.push(`Missing JS file: ${rel}`);
            continue;
        }
        const src = fs.readFileSync(full, 'utf8');
        try {
            new vm.Script(src, { filename: rel });
        } catch (err) {
            failures.push(`Syntax error in ${rel}: ${err.message}`);
        }
    }

    for (const rel of TEXT_AUDIT_FILES) {
        const full = path.join(ROOT, rel);
        const content = fs.readFileSync(full, 'utf8');
        assertCondition(!EMOJI_PATTERN.test(content), `Emoji character detected in ${rel}`, failures);
        assertCondition(!FORBIDDEN_DASH_PATTERN.test(content), `Em-dash or en-dash detected in ${rel}`, failures);
    }

    for (const htmlFile of ['index.html', '404.html']) {
        const html = fs.readFileSync(path.join(ROOT, htmlFile), 'utf8');
        assertCondition(/<html[^>]+lang="id"/i.test(html), `${htmlFile}: missing <html lang="id">`, failures);
        assertCondition(html.includes('<meta name="generator" content="Build by konoha">'), `${htmlFile}: missing Konoha generator meta tag`, failures);
        assertCondition(/<footer[\s\S]*Build by konoha[\s\S]*<\/footer>/i.test(html), `${htmlFile}: missing 'Build by konoha' inside <footer>`, failures);
        assertCondition(!/user-scalable\s*=\s*no|maximum-scale\s*=\s*1(\.0)?\b/i.test(html), `${htmlFile}: viewport blocks user zoom`, failures);
    }

    const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const h1Count = (indexHtml.match(/<h1\b/gi) || []).length;
    assertCondition(h1Count === 1, `index.html: expected exactly 1 <h1>, found ${h1Count}`, failures);

    const labelForIds = new Set([...indexHtml.matchAll(/<label[^>]+for="([^"]+)"/gi)].map((m) => m[1]));
    const controlMatches = [...indexHtml.matchAll(/<(input|select|textarea)\b([^>]*)>/gi)];
    for (const match of controlMatches) {
        const attrs = match[2];
        const idMatch = attrs.match(/\bid="([^"]+)"/i);
        if (!idMatch) {
            failures.push(`index.html: form control <${match[1]}> missing id`);
            continue;
        }
        if (!labelForIds.has(idMatch[1])) {
            failures.push(`index.html: control #${idMatch[1]} missing matching <label for="${idMatch[1]}">`);
        }
    }

    const tabIds = [...indexHtml.matchAll(/data-tab="([^"]+)"/g)].map((m) => m[1]);
    for (const tabId of tabIds) {
        assertCondition(indexHtml.includes(`id="panel-${tabId}"`), `index.html: missing panel-${tabId} for nav tab ${tabId}`, failures);
    }

    if (failures.length > 0) {
        process.stderr.write(`Validation failed with ${failures.length} error(s):\n- ${failures.join('\n- ')}\n`);
        process.exit(1);
    }

    process.stdout.write(`Validation clean: ${JS_FILES.length} JS modules, HTML landmarks, WCAG semantics, zero emojis, zero em-dashes.\n`);
}

if (require.main === module) {
    runValidation();
}

module.exports = {
    runValidation
};
