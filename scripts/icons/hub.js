/* Иконка меню «Мини-игры»: геймпад на неоново-оранжевом градиенте. */
'use strict';
const { renderPNG, smooth, hex, sdEllipse, roundedSquareAlpha, mix } = require('../lib/png');

function sdRoundRect(u, v, x0, y0, x1, y1, r) {
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const qx = Math.abs(u - cx) - ((x1 - x0) / 2 - r);
  const qy = Math.abs(v - cy) - ((y1 - y0) / 2 - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

function render(size, { maskable = false, padding = 0 } = {}) {
  const k = 1 - 2 * padding;
  return renderPNG(size, (u0, v0, aa0) => {
    const u = (u0 - padding) / k, v = (v0 - padding) / k, aa = aa0 / k;
    const px = [0, 0, 0];
    const t = (u0 + v0) / 2;
    mix(px, hex('#ff2bd6'), 1);
    mix(px, hex('#7a2cff'), smooth(0, 0.55, t));
    mix(px, hex('#f08a24'), smooth(0.55, 1, t));
    mix(px, [0, 0, 0], 0.18 * Math.hypot(u0 - 0.5, v0 - 0.5));
    const fill = (d, col, a = 1) => mix(px, col, smooth(aa, -aa, d) * a);

    const pad = Math.min(
      sdRoundRect(u, v, 0.2, 0.36, 0.8, 0.64, 0.12),
      Math.hypot(u - 0.3, v - 0.62) - 0.13,
      Math.hypot(u - 0.7, v - 0.62) - 0.13
    );
    fill(pad - 0.012, [0, 0, 0], 0.18);
    fill(pad, [1, 1, 1]);
    const ink = hex('#2a2140');
    fill(Math.min(sdRoundRect(u, v, 0.26, 0.485, 0.4, 0.535, 0.01), sdRoundRect(u, v, 0.305, 0.44, 0.355, 0.58, 0.01)), ink);
    fill(Math.hypot(u - 0.66, v - 0.45) - 0.03, hex('#00c8e0'));
    fill(Math.hypot(u - 0.72, v - 0.51) - 0.03, hex('#ff2bd6'));
    fill(Math.hypot(u - 0.6, v - 0.51) - 0.03, hex('#ffd43b'));
    fill(Math.hypot(u - 0.66, v - 0.57) - 0.03, hex('#40c057'));
    fill(sdEllipse(u, v, 0.5, 0.43, 0.035, 0.012), ink, 0.5);

    const alpha = maskable ? 1 : roundedSquareAlpha(u0, v0, aa0, 0.2);
    return [px[0], px[1], px[2], alpha];
  });
}

module.exports = { render };
