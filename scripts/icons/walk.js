/* Иконка «Выгуляй Луи»: кудрявая морда рыжего мини-пуделя в шлейке на фоне осенних листьев. */
'use strict';
const { renderPNG, smooth, hex, sdEllipse, roundedSquareAlpha, mix } = require('../lib/png');

const C = {
  bgTop: hex('#ffcf8a'), bgBottom: hex('#e0782f'),
  leaves: ['#f1c40f', '#e67e22', '#c0392b', '#d35400', '#f39c12'].map(hex),
  fur: hex('#9a4521'), furDark: hex('#7a3416'), furLight: hex('#b5602f'), ear: hex('#86391a'),
  muzzle: hex('#b3622f'), nose: hex('#6b3b33'), eye: hex('#1c100a'), white: [1, 1, 1],
  tongue: hex('#ff7b93'), harness: hex('#6b4226'), ring: hex('#cfd4d8')
};

function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// Кудряшки: голова, макушка, уши, тело
const r = rng(7);
const head = [{ x: 0.5, y: 0.5, r: 0.2 }];
for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; head.push({ x: 0.5 + Math.cos(a) * 0.2, y: 0.5 + Math.sin(a) * 0.19, r: 0.062 + r() * 0.012 }); }
for (let i = 0; i < 6; i++) head.push({ x: 0.4 + i * 0.04, y: 0.29 - Math.sin(i * 0.6) * 0.03, r: 0.06 });
const ears = [];
for (const s of [-1, 1]) for (let i = 0; i < 6; i++) ears.push({ x: 0.5 + s * (0.25 + Math.sin(i) * 0.012), y: 0.44 + i * 0.055, r: 0.072 - i * 0.003 });
const body = [{ x: 0.5, y: 1.02, r: 0.26 }];
for (let i = 0; i < 9; i++) body.push({ x: 0.26 + i * 0.06, y: 0.84 + Math.sin(i * 1.7) * 0.012, r: 0.055 });
const leaves = [];
const lr = rng(11);
for (let i = 0; i < 16; i++) leaves.push({ x: lr(), y: lr() * 0.95, a: lr() * Math.PI, s: 0.03 + lr() * 0.025, c: Math.floor(lr() * 5) });

const minCircles = (u, v, list) => list.reduce((m, q) => Math.min(m, Math.hypot(u - q.x, v - q.y) - q.r), Infinity);
const curlShade = (u, v, list) => {
  // Светлый блик в верхней части каждой кудряшки
  let best = 0;
  for (const q of list) {
    const d = Math.hypot(u - (q.x - q.r * 0.3), v - (q.y - q.r * 0.35));
    best = Math.max(best, 1 - d / (q.r * 0.8));
  }
  return Math.max(0, best);
};

function render(size, { maskable = false, padding = 0 } = {}) {
  const k = 1 - 2 * padding;
  return renderPNG(size, (u0, v0, aa0) => {
    const u = (u0 - padding) / k, v = (v0 - padding) / k, aa = aa0 / k;
    const px = [0, 0, 0];
    mix(px, C.bgTop, 1);
    mix(px, C.bgBottom, smooth(0, 1, v0));
    for (const l of leaves) {
      const d = sdEllipse(u0, v0, l.x, l.y, l.s, l.s * 0.45, l.a);
      mix(px, C.leaves[l.c], smooth(aa0, -aa0, d) * 0.85);
    }
    const fill = (d, col, a = 1) => mix(px, col, smooth(aa, -aa, d) * a);

    // Тело и шлейка
    const dBody = minCircles(u, v, body);
    fill(dBody - 0.008, C.furDark); fill(dBody, C.fur);
    fill(Math.max(dBody, Math.abs(v - 0.9) - 0.022), C.harness);
    fill(Math.hypot(u - 0.5, v - 0.9) - 0.03, C.harness);
    fill(Math.abs(Math.hypot(u - 0.5, v - 0.9) - 0.022) - 0.006, C.ring);
    // Уши
    const dEar = minCircles(u, v, ears);
    fill(dEar - 0.008, C.furDark); fill(dEar, C.ear);
    mix(px, C.fur, smooth(aa, -aa, dEar) * curlShade(u, v, ears) * 0.6);
    // Голова
    const dHead = minCircles(u, v, head);
    fill(dHead - 0.009, C.furDark); fill(dHead, C.fur);
    mix(px, C.furLight, smooth(aa, -aa, dHead) * curlShade(u, v, head.slice(1)) * 0.7);
    // Морда, нос, глаза
    fill(sdEllipse(u, v, 0.5, 0.62, 0.13, 0.1), C.muzzle);
    fill(Math.max(sdEllipse(u, v, 0.5, 0.69, 0.03, 0.042), 0.668 - v), C.tongue);
    fill(sdEllipse(u, v, 0.5, 0.575, 0.052, 0.038), C.nose);
    fill(sdEllipse(u, v, 0.487, 0.563, 0.016, 0.009), C.white, 0.45);
    for (const s of [-1, 1]) {
      fill(Math.hypot(u - (0.5 + s * 0.085), v - 0.485) - 0.03, C.eye);
      fill(Math.hypot(u - (0.5 + s * 0.085) - 0.01, v - 0.475) - 0.01, C.white);
      fill(sdEllipse(u, v, 0.5 + s * 0.085, 0.443, 0.045, 0.02, s * 0.2), C.fur);
    }
    const alpha = maskable ? 1 : roundedSquareAlpha(u0, v0, aa0, 0.2);
    return [px[0], px[1], px[2], alpha];
  });
}

module.exports = { render };
