#!/usr/bin/env node
/*
 * Генерация PNG-иконок для всех PWA без внешних зависимостей.
 * Каждая сцена рисуется по пикселям (scripts/icons/*.js) и кодируется в PNG через zlib.
 * Запуск: npm run icons
 */
'use strict';
const fs = require('fs');
const path = require('path');

const PUBLIC = path.join(__dirname, '..', 'public');

const SETS = [
  { scene: require('./icons/neon'), dir: 'neon-runner/icons', prefix: 'icon' },
  { scene: require('./icons/louis'), dir: 'louis/icons', prefix: 'icon' },
  { scene: require('./icons/walk'), dir: 'louis-walk/icons', prefix: 'icon' },
  { scene: require('./icons/hub'), dir: 'icons', prefix: 'hub' }
];

for (const set of SETS) {
  const outDir = path.join(PUBLIC, set.dir);
  fs.mkdirSync(outDir, { recursive: true });
  const targets = [
    { file: `${set.prefix}-192.png`, size: 192 },
    { file: `${set.prefix}-512.png`, size: 512 },
    { file: `${set.prefix}-512-maskable.png`, size: 512, maskable: true, padding: 0.1 },
    { file: set.prefix === 'icon' ? 'apple-touch-icon.png' : `${set.prefix}-apple-touch-icon.png`, size: 180, maskable: true } // iOS сам скругляет
  ];
  for (const t of targets) {
    const png = set.scene.render(t.size, { maskable: !!t.maskable, padding: t.padding || 0 });
    fs.writeFileSync(path.join(outDir, t.file), png);
    console.log(`${set.dir}/${t.file}  ${t.size}x${t.size}  ${png.length} bytes`);
  }
}
