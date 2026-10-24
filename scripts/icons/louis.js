/* Иконка «Луи на прогулке»: морда рыжего пса с ошейником на фоне неба и травы. */
'use strict';
const { renderPNG, smooth, hex, sdEllipse, sdSegment, roundedSquareAlpha, mix } = require('../lib/png');

const C = {
  skyTop: hex('#9fd8ff'), skyBottom: hex('#d8f1ff'), grass: hex('#7cc46a'), grassDark: hex('#5fa653'),
  body: hex('#e7a960'), outline: hex('#a8692f'), ear: hex('#b9773b'), cream: hex('#fff1dc'),
  nose: hex('#2b1d16'), eye: hex('#1d1410'), white: [1, 1, 1], tongue: hex('#ff7b93'),
  collar: hex('#e53935'), tag: hex('#ffd43b'), cheek: hex('#ffb38a')
};

function render(size, { maskable = false, padding = 0 } = {}) {
  const k = 1 - 2 * padding;
  // Переводим координаты пикселя в координаты сцены (сцена сжата в safe zone)
  return renderPNG(size, (u0, v0, aa0) => {
    const u = (u0 - padding) / k, v = (v0 - padding) / k, aa = aa0 / k;
    const px = [0, 0, 0];
    // Фон: небо и трава
    const horizon = 0.74 + Math.sin(u * 7) * 0.015;
    const t = Math.min(1, Math.max(0, v0 / 0.75));
    mix(px, C.skyTop, 1);
    mix(px, C.skyBottom, t);
    mix(px, C.grass, smooth(horizon - 0.004, horizon + 0.004, v0));
    mix(px, C.grassDark, smooth(0.9, 1.0, v0) * 0.5);
    // Солнце
    const sun = Math.hypot(u0 - 0.82, v0 - 0.16);
    mix(px, hex('#fff3bf'), smooth(0.09 + aa0, 0.09 - aa0, sun) * 0.95);

    const fill = (d, col, a = 1) => mix(px, col, smooth(aa, -aa, d) * a);

    // Грудь и шея
    fill(sdEllipse(u, v, 0.5, 1.0, 0.27, 0.22), C.body);
    fill(sdEllipse(u, v, 0.5, 1.02, 0.12, 0.16), C.cream);
    // Ошейник
    fill(sdEllipse(u, v, 0.5, 0.765, 0.2, 0.05), C.collar);
    // Уши
    for (const s of [-1, 1]) {
      fill(sdEllipse(u, v, 0.5 + s * 0.235, 0.47, 0.105, 0.2, -s * 0.35) - 0.006, C.outline);
      fill(sdEllipse(u, v, 0.5 + s * 0.235, 0.47, 0.105, 0.2, -s * 0.35), C.ear);
    }
    // Голова
    fill(sdEllipse(u, v, 0.5, 0.5, 0.255, 0.235) - 0.007, C.outline);
    fill(sdEllipse(u, v, 0.5, 0.5, 0.255, 0.235), C.body);
    fill(sdEllipse(u, v, 0.5, 0.38, 0.045, 0.11), C.cream, 0.9);
    // Щёчки
    for (const s of [-1, 1]) fill(sdEllipse(u, v, 0.5 + s * 0.15, 0.6, 0.04, 0.025), C.cheek, 0.55);
    // Морда
    fill(sdEllipse(u, v, 0.5, 0.62, 0.15, 0.11), C.cream);
    // Язык (под ртом)
    fill(Math.max(sdEllipse(u, v, 0.5, 0.69, 0.036, 0.05), 0.664 - v), C.tongue);
    // Нос
    fill(sdEllipse(u, v, 0.5, 0.57, 0.058, 0.04), C.nose);
    fill(sdEllipse(u, v, 0.485, 0.558, 0.018, 0.01), C.white, 0.6);
    // Рот
    const mouth = Math.min(
      sdSegment(u, v, 0.5, 0.6, 0.5, 0.645),
      sdSegment(u, v, 0.5, 0.645, 0.462, 0.664),
      sdSegment(u, v, 0.5, 0.645, 0.538, 0.664)
    ) - 0.007;
    fill(mouth, C.nose);
    // Глаза
    for (const s of [-1, 1]) {
      fill(Math.hypot(u - (0.5 + s * 0.088), v - 0.475) - 0.033, C.eye);
      fill(Math.hypot(u - (0.5 + s * 0.088) - 0.011, v - 0.464) - 0.011, C.white);
    }
    // Жетон
    fill(Math.hypot(u - 0.5, v - 0.815) - 0.04, C.tag);
    fill(Math.hypot(u - 0.5, v - 0.815) - 0.016, hex('#e0a800'), 0.6);

    const alpha = maskable ? 1 : roundedSquareAlpha(u0, v0, aa0, 0.2);
    return [px[0], px[1], px[2], alpha];
  });
}

module.exports = { render };
