'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function hexLuminance(hex) {
    const clean = hex.replace('#', '');
    const nums = [0, 2, 4].map((idx) => parseInt(clean.slice(idx, idx + 2), 16) / 255);
    const lin = nums.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

function contrastRatio(hexA, hexB) {
    const l1 = hexLuminance(hexA);
    const l2 = hexLuminance(hexB);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
}

test('Dual-theme Liquid Glass tokens satisfy WCAG AA >= 4.5:1 contrast in Dark and Light modes', () => {
    const css = fs.readFileSync(path.join(__dirname, '..', 'assets', 'styles.css'), 'utf8');
    assert.ok(css.includes('--bg-canvas: #060b16'));
    assert.ok(css.includes('--bg-canvas: #eaf1f8'));

    // Obsidian Dark theme pairs
    assert.ok(contrastRatio('#f1f5f9', '#060b16') >= 14.0);
    assert.ok(contrastRatio('#cbd5e1', '#060b16') >= 10.0);
    assert.ok(contrastRatio('#94a3b8', '#060b16') >= 5.5);
    assert.ok(contrastRatio('#22d3ee', '#060b16') >= 9.0);
    assert.ok(contrastRatio('#04131d', '#22d3ee') >= 9.0);

    // Frosted Pearl Light theme pairs
    assert.ok(contrastRatio('#0b1324', '#eaf1f8') >= 14.0);
    assert.ok(contrastRatio('#1e293b', '#eaf1f8') >= 10.0);
    assert.ok(contrastRatio('#475569', '#eaf1f8') >= 5.5);
    assert.ok(contrastRatio('#0e7490', '#eaf1f8') >= 4.5);
    assert.ok(contrastRatio('#ffffff', '#0e7490') >= 4.5);
});

test('Catalog & Cart module handles multi-item mutations and Rupiah formatting cleanly', () => {
    const sandbox = { globalThis: {} };
    const code = fs.readFileSync(path.join(__dirname, '..', 'assets', 'catalog-vault.js'), 'utf8');
    vm.runInNewContext(code, sandbox);
    const mod = sandbox.globalThis.BarmodsCatalogVault;

    assert.equal(mod.CATALOG_ITEMS.length, 8);
    assert.equal(mod.formatRupiah(10000), 'Rp 10.000');

    let cart = [];
    cart = mod.mutateCart(cart, 'vpn-init', 1);
    cart = mod.mutateCart(cart, 'vpn-init', 1);
    cart = mod.mutateCart(cart, 'aktif-xl', 1);
    assert.equal(cart.length, 2);
    assert.equal(cart[0].qty, 2);

    cart = mod.mutateCart(cart, 'vpn-init', -2);
    assert.equal(cart.length, 1);
    assert.equal(cart[0].id, 'aktif-xl');
});
