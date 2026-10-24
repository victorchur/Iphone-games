#!/usr/bin/env node
/*
 * Генерация PNG-иконок для PWA без внешних зависимостей.
 * Рисует неоновую сцену (полосы, корабль, монета) по пикселям и кодирует PNG
 * средствами zlib. Запуск: npm run icons
 */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT_DIR = path.join(__dirname, '..', 'public', 'icons');

/* ------------------------------ PNG encoder ------------------------------ */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePNG(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // фильтр None
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // глубина
  ihdr[9] = 6;  // RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/* ------------------------------- рисование ------------------------------- */
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (edge0, edge1, x) => {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};
const hex = (h) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
const C = {
  bgTop: hex('#1a0638'),
  bg: hex('#07000f'),
  cyan: hex('#00f0ff'),
  magenta: hex('#ff2bd6'),
  gold: hex('#ffd43b'),
  white: [1, 1, 1]
};

function sdSegment(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay;
  const wx = px - ax, wy = py - ay;
  const t = clamp01((wx * vx + wy * vy) / (vx * vx + vy * vy));
  const dx = wx - vx * t, dy = wy - vy * t;
  return Math.sqrt(dx * dx + dy * dy);
}

function sdPolygon(px, py, pts) {
  let d = Infinity;
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[j];
    d = Math.min(d, sdSegment(px, py, ax, ay, bx, by));
    if ((ay > py) !== (by > py) && px < ((bx - ax) * (py - ay)) / (by - ay) + ax) inside = !inside;
  }
  return inside ? -d : d;
}

/** Рисует иконку размером size. maskable=true - без скруглённых углов. */
function render(size, { maskable = false, padding = 0 } = {}) {
  const buf = Buffer.alloc(size * size * 4);
  const px = (v) => v * size; // нормализованные координаты (0..1) в пиксели
  const aa = 1.0 / size;      // ширина сглаживания
  const inset = padding;      // для maskable сцена чуть меньше (safe zone 80%)
  const map = (u) => inset + u * (1 - 2 * inset);

  // Сцена
  const ship = [
    [map(0.5), map(0.56)],
    [map(0.64), map(0.80)],
    [map(0.5), map(0.74)],
    [map(0.36), map(0.80)]
  ];
  const coin = { x: map(0.5), y: map(0.30), r: 0.085 * (1 - 2 * inset) };
  const lanes = [map(1 / 3), map(2 / 3)];
  const laneTop = map(0.06), laneBot = map(0.94);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      const v = (y + 0.5) / size;

      // Фон: вертикальный градиент + виньетка
      let r, g, b;
      const t = v;
      r = C.bgTop[0] * (1 - t) + C.bg[0] * t;
      g = C.bgTop[1] * (1 - t) + C.bg[1] * t;
      b = C.bgTop[2] * (1 - t) + C.bg[2] * t;
      const vig = 1 - 0.35 * Math.hypot(u - 0.5, v - 0.5) * 1.4;
      r *= vig; g *= vig; b *= vig;

      // Горизонтальная сетка
      const gy = (v * 10) % 1;
      const gridLine = smooth(0.08, 0.0, Math.min(gy, 1 - gy) * 10 * 0.5);
      r += 0.30 * gridLine * 0.2; g += 0.10 * gridLine * 0.2; b += 0.60 * gridLine * 0.2;

      // Линии полос с cyan свечением
      for (const lx of lanes) {
        if (v < laneTop || v > laneBot) continue;
        const d = Math.abs(u - lx);
        const core = smooth(0.006 + aa, 0.0, d);
        const glow = Math.exp(-d / 0.035) * 0.55;
        const k = Math.min(1, core + glow);
        r += C.cyan[0] * k * 0.9; g += C.cyan[1] * k * 0.9; b += C.cyan[2] * k * 0.9;
      }

      // Корабль: magenta ореол + cyan/белый корпус
      const ds = sdPolygon(u, v, ship);
      const shipGlow = Math.exp(-Math.max(0, ds) / 0.06) * 0.85;
      r += C.magenta[0] * shipGlow * 0.5; g += C.magenta[1] * shipGlow * 0.5; b += C.magenta[2] * shipGlow * 0.5;
      const shipFill = smooth(aa, -aa, ds);
      if (shipFill > 0) {
        const grad = clamp01((v - ship[0][1]) / (ship[1][1] - ship[0][1]));
        const fr = C.white[0] * (1 - grad) + C.cyan[0] * grad;
        const fg = C.white[1] * (1 - grad) + C.cyan[1] * grad;
        const fb = C.white[2] * (1 - grad) + C.cyan[2] * grad;
        r = r * (1 - shipFill) + fr * shipFill;
        g = g * (1 - shipFill) + fg * shipFill;
        b = b * (1 - shipFill) + fb * shipFill;
      }
      const shipEdge = smooth(0.012, 0.0, Math.abs(ds)) * 0.6;
      r += shipEdge; g += shipEdge; b += shipEdge;

      // Монета
      const dc = Math.hypot(u - coin.x, v - coin.y) - coin.r;
      const coinGlow = Math.exp(-Math.max(0, dc) / 0.05) * 0.8;
      r += C.gold[0] * coinGlow * 0.6; g += C.gold[1] * coinGlow * 0.6; b += C.gold[2] * coinGlow * 0.6;
      const coinFill = smooth(aa, -aa, dc);
      if (coinFill > 0) {
        const hl = clamp01(1 - Math.hypot(u - (coin.x - coin.r * 0.35), v - (coin.y - coin.r * 0.35)) / (coin.r * 1.4));
        let cr = C.gold[0] * (1 - hl) + 1.0 * hl;
        let cg = C.gold[1] * (1 - hl) + 0.98 * hl;
        let cb = C.gold[2] * (1 - hl) + 0.85 * hl;
        const ring = smooth(0.012, 0.0, Math.abs(Math.hypot(u - coin.x, v - coin.y) - coin.r * 0.6));
        cr = cr * (1 - ring * 0.7) + 0.45 * ring * 0.7;
        cg = cg * (1 - ring * 0.7) + 0.25 * ring * 0.7;
        cb = cb * (1 - ring * 0.7) + 0.0 * ring * 0.7;
        r = r * (1 - coinFill) + cr * coinFill;
        g = g * (1 - coinFill) + cg * coinFill;
        b = b * (1 - coinFill) + cb * coinFill;
      }

      // Скруглённые углы для обычной иконки
      let alpha = 1;
      if (!maskable) {
        const rad = 0.2;
        const qx = Math.abs(u - 0.5) - (0.5 - rad);
        const qy = Math.abs(v - 0.5) - (0.5 - rad);
        const dCorner = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - rad;
        alpha = smooth(aa, -aa, dCorner);
      }

      const i = (y * size + x) * 4;
      buf[i] = Math.round(clamp01(r) * 255);
      buf[i + 1] = Math.round(clamp01(g) * 255);
      buf[i + 2] = Math.round(clamp01(b) * 255);
      buf[i + 3] = Math.round(alpha * 255);
    }
  }
  return encodePNG(size, size, buf);
}

const targets = [
  { file: 'icon-192.png', size: 192 },
  { file: 'icon-512.png', size: 512 },
  { file: 'icon-512-maskable.png', size: 512, maskable: true, padding: 0.1 },
  { file: 'apple-touch-icon.png', size: 180, maskable: true } // iOS сам скругляет
];

fs.mkdirSync(OUT_DIR, { recursive: true });
for (const t of targets) {
  const png = render(t.size, { maskable: !!t.maskable, padding: t.padding || 0 });
  fs.writeFileSync(path.join(OUT_DIR, t.file), png);
  console.log(`icons/${t.file}  ${t.size}x${t.size}  ${png.length} bytes`);
}
