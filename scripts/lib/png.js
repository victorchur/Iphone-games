/*
 * Общий код для генерации иконок без зависимостей:
 * PNG-кодировщик на zlib и функции расстояний (SDF) для рисования по пикселям.
 */
'use strict';
const zlib = require('zlib');

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


/** Альфа скруглённого квадрата (rad - радиус угла в долях стороны). */
function roundedSquareAlpha(u, v, aa, rad) {
  const qx = Math.abs(u - 0.5) - (0.5 - rad);
  const qy = Math.abs(v - 0.5) - (0.5 - rad);
  const d = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - rad;
  return smooth(aa, -aa, d);
}

/** Приближённое расстояние до эллипса с центром (cx, cy), радиусами rx, ry и поворотом rot. */
function sdEllipse(px, py, cx, cy, rx, ry, rot) {
  let x = px - cx, y = py - cy;
  if (rot) {
    const c = Math.cos(-rot), s = Math.sin(-rot);
    const nx = x * c - y * s;
    y = x * s + y * c;
    x = nx;
  }
  const k = Math.hypot(x / rx, y / ry);
  const g = Math.hypot(x / (rx * rx), y / (ry * ry)); // градиент k, умноженный на k
  if (g < 1e-9) return -Math.min(rx, ry);
  return (k - 1) * k / g;
}

/** Смешивает цвет [r,g,b] в пиксель px с покрытием a. */
function mix(px, col, a) {
  px[0] = px[0] * (1 - a) + col[0] * a;
  px[1] = px[1] * (1 - a) + col[1] * a;
  px[2] = px[2] * (1 - a) + col[2] * a;
}

/** Рендер: shade(u, v, aa) -> [r, g, b, alpha] в диапазоне 0..1. */
function renderPNG(size, shade) {
  const buf = Buffer.alloc(size * size * 4);
  const aa = 1 / size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const p = shade((x + 0.5) / size, (y + 0.5) / size, aa);
      const i = (y * size + x) * 4;
      buf[i] = Math.round(clamp01(p[0]) * 255);
      buf[i + 1] = Math.round(clamp01(p[1]) * 255);
      buf[i + 2] = Math.round(clamp01(p[2]) * 255);
      buf[i + 3] = Math.round(clamp01(p[3] === undefined ? 1 : p[3]) * 255);
    }
  }
  return encodePNG(size, size, buf);
}

module.exports = { encodePNG, crc32, clamp01, smooth, hex, sdSegment, sdPolygon, sdEllipse, roundedSquareAlpha, mix, renderPNG };
