/*
 * Выгуляй Луи - процедурная графика: Луи, люди, собаки, звери, деревья, предметы.
 * Все функции рисуют в экранных координатах вокруг точки (0, 0) на земле.
 * Цвета Луи и хозяев можно поменять в LOOKS.
 */
(function (root) {
  'use strict';

  /* ======================= Внешний вид героев ======================= */
  const LOUIS = {
    // Мини-пудель ред браун: по фото тёмно-рыжая кудрявая шерсть и коричневый нос
    base: '#9a4521', dark: '#86391a', light: '#ab5428', glow: '#c06a3a',
    nose: '#6b3b33', eye: '#1c100a', harness: '#6b4226', harnessDark: '#4e2f1a', ring: '#cfd4d8'
  };

  const PEOPLE = {
    // Двое с фото: человек в розовой футболке и человек в длинном сером пальто
    pink:  { skin: '#efc4a4', hair: '#2b221d', hairStyle: 'short', top: '#f2c9d1', pants: '#38496b', shoes: '#eeeeee', height: 1 },
    coat:  { skin: '#f3cdb1', hair: '#d7b27a', hairStyle: 'long', top: '#ffffff', coat: '#5a5e65', pants: '#222326', shoes: '#8f8f8f', height: 0.97 },
    // Соседи
    jacketBlue:  { skin: '#e8b996', hair: '#5a3b26', hairStyle: 'short', top: '#2f6fb0', pants: '#333', shoes: '#222', height: 1 },
    jacketGreen: { skin: '#f0c9a8', hair: '#a0522d', hairStyle: 'bun', top: '#4f7d4b', pants: '#2d2d2d', shoes: '#5a3b26', height: 0.95 },
    coatBeige:   { skin: '#d9a77f', hair: '#1f1a17', hairStyle: 'short', top: '#ddd', coat: '#c8ad86', pants: '#3c3c3c', shoes: '#3c2a1e', height: 1.02 },
    hoodieRed:   { skin: '#f2cfb5', hair: '#e0c07c', hairStyle: 'cap', cap: '#222', top: '#b83b3b', pants: '#2d3e50', shoes: '#fff', height: 0.98 },
    parkaYellow: { skin: '#c98e6b', hair: '#111', hairStyle: 'long', top: '#e9b949', pants: '#2b2b2b', shoes: '#111', height: 0.96 },
    coatPlum:    { skin: '#f5d6c0', hair: '#9b9b9b', hairStyle: 'short', top: '#eee', coat: '#6c3b5c', pants: '#2a2a2a', shoes: '#333', height: 0.98 },
    grandma:     { skin: '#f1cdb6', hair: '#cfcfcf', hairStyle: 'scarf', scarf: '#8e44ad', top: '#7f6a5a', coat: '#7f6a5a', pants: '#4a3f37', shoes: '#2b2b2b', height: 0.9, glasses: true },
    kidA:        { skin: '#f3d0b5', hair: '#6b4226', hairStyle: 'hat', hat: '#e74c3c', top: '#3498db', pants: '#2c3e50', shoes: '#f1c40f', height: 0.62 },
    kidB:        { skin: '#e9be9c', hair: '#d4a256', hairStyle: 'hat', hat: '#9b59b6', top: '#f39c12', pants: '#34495e', shoes: '#e74c3c', height: 0.58 },
    janitor:     { skin: '#e2b28e', hair: '#444', hairStyle: 'cap', cap: '#2c3e50', top: '#34495e', vest: '#ff7f11', pants: '#2c3e50', shoes: '#1b1b1b', height: 1 }
  };

  const DOGS = {
    shepherd:   { scale: 1.45, body: '#c98a4a', belly: '#e3b57e', muzzle: '#3a2d25', ear: '#2f2620', far: '#a8713b', ears: 'pointy', saddle: '#2f2620' },
    rottweiler: { scale: 1.5,  body: '#2a2320', belly: '#a8632d', muzzle: '#a8632d', ear: '#1a1513', far: '#1c1715', ears: 'floppy' },
    husky:      { scale: 1.4,  body: '#7d8794', belly: '#f2f4f7', muzzle: '#f2f4f7', ear: '#5d6773', far: '#677180', ears: 'pointy', eye: '#3d8bfd' },
    labrador:   { scale: 1.4,  body: '#e6c27a', belly: '#f3dca8', muzzle: '#f0d493', ear: '#c9a35b', far: '#cfa964', ears: 'floppy' },
    doberman:   { scale: 1.45, body: '#1f1a18', belly: '#9c5a2b', muzzle: '#9c5a2b', ear: '#151110', far: '#171312', ears: 'pointy' },
    bichon:     { scale: 0.75, body: '#f7f3ee', belly: '#ffffff', muzzle: '#ffffff', ear: '#e6dccf', far: '#e2d9cc', ears: 'floppy', curly: true },
    terrier:    { scale: 0.78, body: '#f4f1ec', belly: '#ffffff', muzzle: '#ffffff', ear: '#2f2a26', far: '#d9d4cc', ears: 'pointy', saddle: '#2f2a26' },
    pug:        { scale: 0.78, body: '#d9b98f', belly: '#ead3b0', muzzle: '#3b2e28', ear: '#3b2e28', far: '#c3a276', ears: 'floppy' },
    chihuahua:  { scale: 0.66, body: '#c9a27a', belly: '#efe1cf', muzzle: '#efe1cf', ear: '#b38b63', far: '#b08a62', ears: 'pointy' },
    dachshund:  { scale: 0.8,  body: '#a0522d', belly: '#c47a4a', muzzle: '#7a3d20', ear: '#7a3d20', far: '#8a4524', ears: 'floppy', long: true },
    pinkpoodle: { scale: 0.78, body: '#f2d6c9', belly: '#fbeee8', muzzle: '#fbeee8', ear: '#e9c3b3', far: '#e5c6b8', ears: 'floppy', curly: true, bow: '#ff6b9e' },
    spitz:      { scale: 0.78, body: '#2b2b33', belly: '#4a4a55', muzzle: '#4a4a55', ear: '#1d1d23', far: '#222229', ears: 'pointy', fluffy: true },
    corgi:      { scale: 0.82, body: '#d9822b', belly: '#fff4e6', muzzle: '#fff4e6', ear: '#b86a1f', far: '#bd6f22', ears: 'pointy', long: true }
  };

  const TREES = {
    maple:    { trunk: '#5b3a29', leaves: ['#d35400', '#e67e22', '#c0392b', '#f39c12', '#b03a2e'] },
    birch:    { trunk: '#efeae2', marks: '#2b2b2b', leaves: ['#f1c40f', '#f7dc6f', '#d4ac0d', '#a9b33a'] },
    chestnut: { trunk: '#4e342e', leaves: ['#b9770e', '#ca6f1e', '#a04000', '#8e9b2d'] },
    linden:   { trunk: '#5d4037', leaves: ['#f4d03f', '#e9b000', '#c9a227', '#9fb83a'] }
  };
  const BUSH_COLORS = ['#7d8c2b', '#9a7d1e', '#a5512b', '#6b8e23', '#b38b1d'];
  const LEAF_COLORS = ['#e67e22', '#f1c40f', '#d35400', '#c0392b', '#b7950b', '#a0522d', '#e5a50a'];

  /* ======================= утилиты ======================= */
  function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function circle(c, x, y, r) { c.beginPath(); c.arc(x, y, Math.max(0.01, r), 0, Math.PI * 2); }
  function ellipse(c, x, y, rx, ry, rot = 0) { c.beginPath(); c.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, Math.PI * 2); }
  function rr(c, x, y, w, h, r) {
    r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }
  function shadow(c, rx, ry, a = 0.22) { c.fillStyle = `rgba(30,20,10,${a})`; ellipse(c, 0, 0, rx, ry); c.fill(); }
  function leafShape(c, x, y, s, rot, color) {
    c.save(); c.translate(x, y); c.rotate(rot);
    c.fillStyle = color;
    c.beginPath(); c.moveTo(-s, 0); c.quadraticCurveTo(0, -s * 0.7, s, 0); c.quadraticCurveTo(0, s * 0.7, -s, 0); c.fill();
    c.restore();
  }

  // Заранее разложенные кудряшки, чтобы шерсть не мерцала
  function makeCurls(seed, n) {
    const rnd = mulberry32(seed), out = [];
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd());
      out.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, r: 0.55 + rnd() * 0.45, k: rnd() });
    }
    return out;
  }
  const CURLS = { body: makeCurls(11, 34), head: makeCurls(12, 22), ear: makeCurls(13, 10), tail: makeCurls(14, 7), muzzle: makeCurls(15, 8), leg: makeCurls(16, 4) };

  /** Кудрявое пятно: эллипс и кудряшки поверх. */
  function curly(c, cx, cy, rx, ry, curls, cr, palette) {
    c.fillStyle = palette[0];
    ellipse(c, cx, cy, rx, ry); c.fill();
    for (const q of curls) {
      c.fillStyle = q.k < 0.33 ? palette[1] : q.k < 0.75 ? palette[0] : palette[2];
      circle(c, cx + q.x * rx * 0.92, cy + q.y * ry * 0.92, cr * q.r); c.fill();
    }
  }

  /* ======================= Луи ======================= */
  const LEASH_POINT = { x: 1, y: -26 };

  /** Мягкий кудрявый силуэт: контур, основа и кудряшки близких оттенков. */
  function fluff(c, cx, cy, rx, ry, curls, cr, tones, outline) {
    if (outline) { c.fillStyle = outline; ellipse(c, cx, cy, rx + 0.9, ry + 0.9); c.fill(); }
    c.fillStyle = tones[0];
    ellipse(c, cx, cy, rx, ry); c.fill();
    for (const q of curls) {
      c.fillStyle = q.k < 0.5 ? tones[1] : tones[2];
      circle(c, cx + q.x * rx * 0.85, cy + q.y * ry * 0.85, cr * q.r); c.fill();
    }
    // Кудряшки по краю делают силуэт пушистым
    c.fillStyle = tones[0];
    const n = Math.max(6, Math.round((rx + ry) * 0.7));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      circle(c, cx + Math.cos(a) * rx * 0.96, cy + Math.sin(a) * ry * 0.96, cr * 0.85); c.fill();
    }
  }

  /**
   * Луи сбоку, смотрит вправо (facing -1 отражает).
   * o: { facing, phase, moving 0..1, t, pose, expr, carry, jump }
   * pose: stand | walk | run | sniff | pee | squat
   * Возвращает точку крепления поводка на шлейке в экранных координатах.
   */
  function louis(c, o) {
    if (o.pose === 'lie') return louisLying(c, o);
    const C = LOUIS;
    const fur = [C.base, C.dark, C.light];       // основа, тень кудряшек, блик кудряшек
    const furEar = [C.dark, '#6a2c10', C.base];
    const furFace = [C.light, C.base, C.glow];
    const mv = o.moving || 0;
    const run = o.pose === 'run';
    const jumpH = o.jump > 0 ? Math.sin(Math.min(1, (0.5 - o.jump) / 0.5) * Math.PI) * 16 : 0;
    c.save();
    shadow(c, 14 - jumpH * 0.3, 4);
    c.translate(0, -jumpH);
    c.scale(o.facing, 1);
    const bob = -Math.abs(Math.sin(o.phase)) * (run ? 2.4 : 1.3) * mv;
    const amp = (run ? 0.85 : 0.5) * mv;
    const sw = Math.sin(o.phase) * amp;
    const squat = o.pose === 'squat';
    const sniff = o.pose === 'sniff';
    const pee = o.pose === 'pee';
    const outline = 'rgba(70,25,8,0.55)';

    const leg = (x, y, ang, color, len = 13) => {
      c.save(); c.translate(x, y); c.rotate(ang);
      c.fillStyle = color;
      rr(c, -2.7, -1, 5.4, len, 2.7); c.fill();
      ellipse(c, 0.6, len - 1.4, 3.4, 2.2); c.fill();
      c.restore();
    };

    c.save();
    if (squat) { c.translate(0, 2); c.rotate(-0.2); }
    // Дальние лапы
    leg(8, -11 + bob, -sw, C.dark);
    leg(-8, -11 + bob, sw, C.dark, squat ? 9 : 13);

    // Хвост торчит вверх кудрявым помпоном
    let tailA = -0.35 + Math.sin(o.t * (o.expr === 'happy' ? 20 : 8)) * (o.expr === 'happy' ? 0.35 : 0.14);
    if (o.expr === 'scared') tailA = 1.2;
    if (squat) tailA = -0.8;
    c.save();
    c.translate(-11, -22 + bob);
    c.rotate(tailA);
    c.strokeStyle = C.base; c.lineWidth = 3.4; c.lineCap = 'round';
    c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(-3, -6, -2, -10); c.stroke();
    fluff(c, -2, -13, 4.3, 4.3, CURLS.tail, 1.7, fur, outline);
    c.restore();

    // Тело
    fluff(c, 0, -18 + bob, 13.5, 8.2, CURLS.body, 2, fur, outline);

    // Коричневая шлейка
    c.strokeStyle = C.harness; c.lineWidth = 2.4; c.lineCap = 'round';
    c.beginPath(); c.moveTo(7.5, -25.5 + bob); c.quadraticCurveTo(11, -18 + bob, 8.5, -11.5 + bob); c.stroke();
    c.beginPath(); c.moveTo(-1.5, -26 + bob); c.quadraticCurveTo(0.5, -18 + bob, -1.5, -10.5 + bob); c.stroke();
    c.fillStyle = C.harnessDark;
    rr(c, -3.5, -28 + bob, 12, 3.6, 1.6); c.fill();
    c.strokeStyle = '#9aa1a6'; c.lineWidth = 1.1;
    c.beginPath(); c.arc(LEASH_POINT.x, LEASH_POINT.y - 1.6 + bob, 1.4, Math.PI, Math.PI * 2); c.stroke();

    // Ближние лапы
    leg(6, -11 + bob, sw, C.base);
    if (pee) {
      c.save(); c.translate(-8, -15 + bob); c.rotate(-1.15);
      c.fillStyle = C.base; rr(c, -2.7, -1, 5.4, 12, 2.7); c.fill();
      c.restore();
    } else leg(-9, -11 + bob, -sw, C.base, squat ? 9 : 13);
    c.restore();

    // Голова: круглая и пушистая
    const hx = sniff ? 17 : 13;
    const hy = (sniff ? -18 : -31) + bob + (sniff ? Math.sin(o.t * 16) * 0.7 : 0);
    const earBack = o.expr === 'scared' ? 0.6 : run ? 0.4 * mv : 0;
    fluff(c, hx, hy, 9.8, 9.4, CURLS.head, 2.1, fur, outline);
    c.fillStyle = C.light;
    for (let i = 0; i < 5; i++) { circle(c, hx - 5.5 + i * 2.6, hy - 8.4 - Math.sin(i * 1.3) * 1.2, 2.4); c.fill(); }
    // Мордочка светлее, нос коричневый, как на фото
    fluff(c, hx + 8, hy + 3, 6.2, 4.8, CURLS.muzzle, 1.6, furFace, null);
    c.fillStyle = C.nose;
    ellipse(c, hx + 13.2, hy + 1.8, 2.5, 2.1); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.3)';
    circle(c, hx + 12.6, hy + 1.1, 0.8); c.fill();
    if (o.carry) carryItem(c, o.carry, hx + 11, hy + 7.4);
    else if (o.expr === 'happy' || (run && mv > 0.5)) {
      c.fillStyle = '#ff7b93';
      ellipse(c, hx + 9.4, hy + 8.2, 2, 3); c.fill();
    }
    // Глаз чуть прикрыт чёлкой
    const ex = hx + 4.2, ey = hy - 1.2;
    if (o.expr === 'scared') {
      c.fillStyle = '#fff'; circle(c, ex, ey, 2.6); c.fill();
      c.fillStyle = C.eye; circle(c, ex + 0.5, ey, 1.5); c.fill();
    } else {
      c.fillStyle = C.eye; circle(c, ex, ey, 1.9); c.fill();
      c.fillStyle = '#fff'; circle(c, ex + 0.7, ey - 0.7, 0.65); c.fill();
    }
    c.fillStyle = C.base;
    circle(c, ex - 1, ey - 3.3, 2); c.fill();
    circle(c, ex + 1.6, ey - 3.5, 1.8); c.fill();
    // Длинное кудрявое ухо висит сбоку головы
    c.save(); c.translate(hx - 4.5, hy - 1); c.rotate(0.08 + earBack + Math.sin(o.phase) * 0.1 * mv);
    fluff(c, 0, 6.5, 3.9, 7.6, CURLS.ear, 1.7, furEar, outline);
    c.restore();
    c.restore();
    return { x: LEASH_POINT.x * o.facing, y: LEASH_POINT.y + bob - jumpH };
  }

  /** Луи лежит: спит довольный или грустит. */
  function louisLying(c, o) {
    const C = LOUIS, fur = [C.base, C.dark, C.light], outline = 'rgba(70,25,8,0.55)';
    const breathe = Math.sin(o.t * 2) * 0.6;
    c.save();
    shadow(c, 18, 4);
    c.scale(o.facing, 1);
    fluff(c, -14, -6, 4, 4, CURLS.tail, 1.6, fur, outline);
    fluff(c, 0, -8 + breathe * 0.3, 15, 7 + breathe, CURLS.body, 2, fur, outline);
    c.fillStyle = C.base; ellipse(c, 10, -2.5, 6, 2.6); c.fill(); ellipse(c, -6, -2.5, 6, 2.6); c.fill();
    c.strokeStyle = C.harness; c.lineWidth = 2.2;
    c.beginPath(); c.moveTo(3, -14); c.quadraticCurveTo(6, -8, 4, -2); c.stroke();
    const hx = 14, hy = -11;
    fluff(c, hx, hy, 8.6, 8, CURLS.head, 1.9, fur, outline);
    fluff(c, hx + 7, hy + 3, 5.4, 4, CURLS.muzzle, 1.5, [C.light, C.base, C.glow], null);
    c.fillStyle = C.nose; ellipse(c, hx + 11.5, hy + 2, 2.2, 1.8); c.fill();
    c.strokeStyle = C.eye; c.lineWidth = 1.2; c.lineCap = 'round';
    c.beginPath();
    if (o.expr === 'sad') { c.moveTo(hx + 2, hy - 0.4); c.lineTo(hx + 6, hy + 0.8); }
    else c.arc(hx + 4, hy - 1, 1.8, 0.1, Math.PI - 0.1);
    c.stroke();
    c.save(); c.translate(hx - 4, hy); c.rotate(0.35);
    fluff(c, 0, 5, 3.6, 6.8, CURLS.ear, 1.6, [C.dark, '#6a2c10', C.base], outline);
    c.restore();
    c.restore();
    return { x: 0, y: -12 };
  }

  /** Вещь в зубах. */
  function carryItem(c, kind, x, y) {
    c.save(); c.translate(x, y);
    if (kind === 'ball') { c.fillStyle = '#d4e157'; circle(c, 0, 0, 4.2); c.fill(); c.strokeStyle = '#fff'; c.lineWidth = 1; c.beginPath(); c.arc(-4, 0, 3.5, -1, 1); c.stroke(); }
    else { c.rotate(0.1); c.strokeStyle = '#8b5a2b'; c.lineWidth = 2.6; c.lineCap = 'round'; c.beginPath(); c.moveTo(-9, 0); c.lineTo(9, -1); c.stroke(); }
    c.restore();
  }

  /* ======================= Чужие собаки ======================= */
  function dog(c, lookKey, o) {
    const look = DOGS[lookKey];
    const s = look.scale;
    c.save();
    shadow(c, 16 * s, 4.2 * s, 0.2);
    c.scale(o.facing * s, s);
    const mv = o.moving || 0;
    const bob = -Math.abs(Math.sin(o.phase)) * 1.8 * mv;
    const sw = Math.sin(o.phase) * 0.6 * mv;
    const len = look.long ? 1.35 : 1;
    const legL = look.long ? 8 : 13;
    const leg = (x, ang, color) => { c.save(); c.translate(x, -legL + 1 + bob); c.rotate(ang); c.fillStyle = color; rr(c, -2.6, -1, 5.2, legL, 2.5); c.fill(); c.restore(); };
    leg(10 * len, -sw, look.far); leg(-10 * len, sw, look.far);
    // Хвост
    let tail = -0.8 + Math.sin(o.t * (o.wag ? 22 : 7)) * (o.wag ? 0.55 : 0.2);
    if (o.angry) tail = -1.3;
    c.save(); c.translate(-15 * len, -legL - 7 + bob); c.rotate(tail);
    c.strokeStyle = look.body; c.lineWidth = 4; c.lineCap = 'round';
    c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(-8, -4, -10, -11); c.stroke();
    c.restore();
    const by = -legL - 6 + bob;
    c.fillStyle = look.body;
    ellipse(c, 0, by, 16 * len, look.fluffy ? 10.5 : 9); c.fill();
    if (look.curly) { c.fillStyle = look.belly; for (let i = 0; i < 9; i++) { circle(c, -12 * len + i * 3 * len, by - 7 + Math.sin(i) * 1.5, 2.6); c.fill(); } }
    c.fillStyle = look.belly; ellipse(c, 3, by + 4.5, 11 * len, 4); c.fill();
    if (look.saddle) { c.fillStyle = look.saddle; ellipse(c, -3, by - 5, 11 * len, 4.4); c.fill(); }
    if (o.hackles) {
      c.strokeStyle = '#1b1b1b'; c.lineWidth = 1.4;
      c.beginPath();
      for (let i = 0; i < 6; i++) { const x = -9 * len + i * 3.4 * len; c.moveTo(x, by - 8); c.lineTo(x + 1.6, by - 12.5); c.lineTo(x + 3.2, by - 8); }
      c.stroke();
    }
    leg(8 * len, sw, look.body); leg(-11 * len, -sw, look.body);
    const hx = 15 * len, hy = by - 11 + (o.sniff ? 9 : 0);
    if (look.ears === 'pointy') {
      c.fillStyle = look.ear;
      c.beginPath(); c.moveTo(hx - 7, hy - 4); c.lineTo(hx - 3, hy - 16); c.lineTo(hx + 2, hy - 6); c.closePath(); c.fill();
    }
    c.fillStyle = look.body; circle(c, hx, hy, 9.5); c.fill();
    if (look.curly) { c.fillStyle = look.belly; for (let i = 0; i < 5; i++) { circle(c, hx - 6 + i * 3, hy - 8, 2.5); c.fill(); } }
    c.fillStyle = look.muzzle; ellipse(c, hx + 8.5, hy + 3, 7, 5.2); c.fill();
    c.fillStyle = '#231a15'; ellipse(c, hx + 15, hy + 1.4, 2.6, 2.1); c.fill();
    if (o.angry) {
      c.fillStyle = '#5a1010'; ellipse(c, hx + 9.5, hy + 8, 4.8, 2.4); c.fill();
      c.fillStyle = '#fff'; c.fillRect(hx + 6.6, hy + 6, 1.5, 1.8); c.fillRect(hx + 10.6, hy + 6, 1.5, 1.8);
    } else if (o.wag) { c.fillStyle = '#ff7b93'; ellipse(c, hx + 10, hy + 8.6, 2.2, 3.3); c.fill(); }
    c.fillStyle = look.eye || '#1d1410'; circle(c, hx + 3.4, hy - 3, 2); c.fill();
    c.fillStyle = '#fff'; circle(c, hx + 4.1, hy - 3.7, 0.7); c.fill();
    if (o.angry) { c.strokeStyle = '#1d1410'; c.lineWidth = 1.7; c.lineCap = 'round'; c.beginPath(); c.moveTo(hx, hy - 8); c.lineTo(hx + 6, hy - 5.8); c.stroke(); }
    if (look.ears === 'floppy') { c.fillStyle = look.ear; ellipse(c, hx - 4, hy + 1.5, 4.2, 8.4, 0.35); c.fill(); }
    if (look.bow) { c.fillStyle = look.bow; c.beginPath(); c.moveTo(hx - 2, hy - 9); c.lineTo(hx - 8, hy - 13); c.lineTo(hx - 8, hy - 5); c.closePath(); c.fill(); c.beginPath(); c.moveTo(hx - 2, hy - 9); c.lineTo(hx + 4, hy - 13); c.lineTo(hx + 4, hy - 5); c.closePath(); c.fill(); }
    c.restore();
    return { x: 0, y: (-legL - 12) * s };
  }

  /* ======================= Люди ======================= */
  /**
   * Человек сбоку, смотрит вправо. o: { facing, phase, moving, t, pose, holding }
   * pose: walk | stand | sit | sweep | throw | bend | call
   * Возвращает точку руки (для поводка) в экранных координатах.
   */
  function person(c, lookKey, o) {
    const L = PEOPLE[lookKey];
    const h = L.height;
    c.save();
    shadow(c, 12 * h, 3.6 * h, 0.2);
    c.scale(o.facing * h, h);
    const mv = o.moving || 0;
    const sw = Math.sin(o.phase) * 0.55 * mv;
    const bob = -Math.abs(Math.sin(o.phase)) * 1.5 * mv;
    const sit = o.pose === 'sit';
    const bend = o.pose === 'bend' ? 0.55 : 0;
    const legLen = 26;
    // Ноги
    const legDraw = (ang, color) => {
      c.save(); c.translate(0, -legLen + bob); c.rotate(ang);
      c.fillStyle = color; rr(c, -3.2, 0, 6.4, legLen, 3); c.fill();
      c.fillStyle = L.shoes; rr(c, -3.5, legLen - 3, 9, 4.2, 2); c.fill();
      c.restore();
    };
    if (sit) {
      c.fillStyle = L.pants;
      rr(c, -4, -24, 18, 7, 3); c.fill();
      rr(c, 10, -24, 6.4, 22, 3); c.fill();
      c.fillStyle = L.shoes; rr(c, 10, -4, 9, 4, 2); c.fill();
    } else {
      legDraw(-sw, L.pants);
      legDraw(sw, L.pants);
    }
    const hipY = sit ? -22 : -legLen + bob;
    c.save();
    c.translate(0, hipY);
    c.rotate(bend);
    // Пальто или куртка
    if (L.coat) {
      c.fillStyle = L.coat;
      c.beginPath();
      c.moveTo(-7, -26); c.lineTo(7, -26);
      c.lineTo(sit ? 12 : 9, sit ? 4 : 20 - (lookKey === 'coat' ? -2 : 6));
      c.lineTo(sit ? -9 : -9, sit ? 4 : 20 - (lookKey === 'coat' ? -2 : 6));
      c.closePath(); c.fill();
      c.fillStyle = 'rgba(0,0,0,0.12)'; c.fillRect(0.5, -24, 1.2, sit ? 26 : 40);
      c.fillStyle = L.top; c.beginPath(); c.moveTo(-3, -26); c.lineTo(3, -26); c.lineTo(0, -19); c.closePath(); c.fill();
    } else {
      c.fillStyle = L.top; rr(c, -7.5, -27, 15, 30, 5); c.fill();
    }
    if (L.vest) { c.fillStyle = L.vest; rr(c, -7, -25, 14, 20, 3); c.fill(); c.fillStyle = '#e8e8e8'; c.fillRect(-7, -14, 14, 2.4); }
    // Дальняя рука
    const armSw = o.pose === 'walk' ? -sw * 0.8 : 0;
    c.save(); c.translate(-2, -24); c.rotate(armSw + 0.15);
    c.fillStyle = L.coat || L.top; rr(c, -2.6, 0, 5.2, 20, 2.6); c.fill();
    c.fillStyle = L.skin; circle(c, 0, 21, 2.6); c.fill();
    c.restore();
    // Голова
    const hy = -34;
    if (L.hairStyle === 'long') { c.fillStyle = L.hair; rr(c, -8.5, hy - 7, 12, 22, 5); c.fill(); }
    c.fillStyle = L.skin; circle(c, 0, hy, 7.2); c.fill();
    c.fillStyle = L.hair;
    if (L.hairStyle === 'short') { c.beginPath(); c.arc(-0.5, hy - 1.5, 7.4, Math.PI * 0.95, Math.PI * 2.05); c.fill(); rr(c, -7.6, hy - 3, 4, 6, 2); c.fill(); }
    else if (L.hairStyle === 'long') { c.beginPath(); c.arc(0, hy - 1, 7.6, Math.PI * 0.9, Math.PI * 2.1); c.fill(); rr(c, -8, hy - 3, 5, 14, 2.5); c.fill(); }
    else if (L.hairStyle === 'bun') { c.beginPath(); c.arc(0, hy - 1, 7.4, Math.PI * 0.95, Math.PI * 2.05); c.fill(); circle(c, -5, hy - 7, 3.6); c.fill(); }
    else if (L.hairStyle === 'cap') { c.fillStyle = L.cap; c.beginPath(); c.arc(0, hy - 2, 7.6, Math.PI, Math.PI * 2); c.fill(); rr(c, 2, hy - 3.4, 9, 2.6, 1.2); c.fill(); }
    else if (L.hairStyle === 'hat') { c.fillStyle = L.hat; c.beginPath(); c.arc(0, hy - 2, 7.6, Math.PI, Math.PI * 2); c.fill(); circle(c, 0, hy - 10, 2.6); c.fill(); }
    else if (L.hairStyle === 'scarf') { c.fillStyle = L.scarf; c.beginPath(); c.arc(0, hy - 1, 8.2, Math.PI * 0.85, Math.PI * 2.15); c.fill(); c.beginPath(); c.moveTo(-6, hy + 4); c.lineTo(-10, hy + 11); c.lineTo(-3, hy + 7); c.fill(); }
    c.fillStyle = '#2b1d16'; circle(c, 3.6, hy - 0.8, 1); c.fill();
    if (L.glasses) { c.strokeStyle = '#333'; c.lineWidth = 0.9; circle(c, 3.8, hy - 0.8, 2.2); c.stroke(); }
    c.strokeStyle = 'rgba(120,60,50,0.7)'; c.lineWidth = 1; c.beginPath(); c.arc(4, hy + 2.6, 1.8, 0.2, Math.PI * 0.8); c.stroke();
    // Ближняя рука держит рулетку, метлу или тянется вперёд
    c.save(); c.translate(1, -24);
    let ang = 0.55;
    if (o.pose === 'throw') ang = -2.2 + Math.min(1, (o.t * 6) % 1) * 2.6;
    else if (o.pose === 'call') ang = -1.2;
    else if (o.pose === 'sweep') ang = 0.9 + Math.sin(o.t * 6) * 0.35;
    else if (o.pose === 'walk' && !o.holding) ang = sw * 0.8;
    else if (sit) ang = 1.0;
    c.rotate(ang);
    c.fillStyle = L.coat || L.top; rr(c, -2.6, 0, 5.2, 19, 2.6); c.fill();
    c.fillStyle = L.skin; circle(c, 0, 20, 2.6); c.fill();
    if (o.holding === 'leash') { c.fillStyle = '#d94f2b'; rr(c, -3, 18, 6, 8, 2); c.fill(); c.fillStyle = '#222'; c.fillRect(-1, 18, 2, 3); }
    if (o.holding === 'broom') {
      c.strokeStyle = '#a77b4a'; c.lineWidth = 2; c.beginPath(); c.moveTo(0, 6); c.lineTo(0, 40); c.stroke();
      c.fillStyle = '#c9a15a'; c.beginPath(); c.moveTo(-6, 40); c.lineTo(6, 40); c.lineTo(9, 50); c.lineTo(-9, 50); c.closePath(); c.fill();
    }
    if (o.holding === 'bag') { c.fillStyle = '#3cb371'; ellipse(c, 0, 25, 4, 5); c.fill(); }
    c.restore();
    c.restore();
    c.restore();
    // Точка руки: плечо (1, -24) в системе бёдер, рука длиной 21 повёрнута на ang, корпус наклонён на bend
    const ax = 1 - 21 * Math.sin(ang), ay = -24 + 21 * Math.cos(ang);
    const cb = Math.cos(bend), sb = Math.sin(bend);
    const px = ax * cb - ay * sb, py = ax * sb + ay * cb;
    return { x: px * o.facing * h, y: (hipY + py) * h };
  }

  /* ======================= Звери ======================= */
  function pigeon(c, o) {
    c.save();
    if (!o.flying) { shadow(c, 5, 1.6, 0.18); }
    c.translate(0, o.flying ? -o.z : 0);
    c.scale(o.facing, 1);
    c.fillStyle = '#8e9aa6'; ellipse(c, 0, -5, 6, 4); c.fill();
    c.fillStyle = '#6b7783'; ellipse(c, -4, -5, 4, 2.4, -0.3); c.fill();
    c.fillStyle = '#7d8a96'; circle(c, 5, -8.5 + (o.flying ? 0 : Math.sin(o.t * 6 + o.ph) * 1.2), 2.8); c.fill();
    c.fillStyle = '#5fa58c'; ellipse(c, 3.6, -6.4, 1.6, 1.2); c.fill();
    c.fillStyle = '#e67e22'; c.beginPath(); c.moveTo(7.5, -8.6); c.lineTo(9.5, -8); c.lineTo(7.5, -7.6); c.fill();
    if (o.flying) {
      const f = Math.sin(o.t * 34 + o.ph) * 7;
      c.fillStyle = '#9aa6b2';
      c.beginPath(); c.moveTo(-2, -6); c.lineTo(-8, -11 - f); c.lineTo(3, -7); c.fill();
      c.fillStyle = '#7d8a96';
      c.beginPath(); c.moveTo(0, -5); c.lineTo(4, -10 + f); c.lineTo(5, -6); c.fill();
    } else {
      c.strokeStyle = '#d35400'; c.lineWidth = 1; c.beginPath(); c.moveTo(-0.5, -1.4); c.lineTo(-0.5, 0); c.moveTo(1.5, -1.4); c.lineTo(1.5, 0); c.stroke();
    }
    c.restore();
  }

  function cat(c, color, o) {
    const fur = color === 'ginger' ? ['#e08a3c', '#c56b22', '#f3b77a'] : ['#7f8c8d', '#5e6b6c', '#bdc3c7'];
    c.save();
    shadow(c, 8, 2.4, 0.18);
    c.translate(0, -(o.z || 0));
    c.scale(o.facing, 1);
    if (o.pose === 'sit') {
      c.fillStyle = fur[0]; ellipse(c, 0, -8, 6, 8); c.fill();
      c.strokeStyle = fur[0]; c.lineWidth = 2.6; c.lineCap = 'round'; c.beginPath(); c.moveTo(-4, -2); c.quadraticCurveTo(-12, -2 + Math.sin(o.t * 2) * 2, -9, -12); c.stroke();
      c.fillStyle = fur[0]; circle(c, 2, -18, 5); c.fill();
    } else {
      const sw = Math.sin(o.phase) * 0.7;
      c.fillStyle = fur[1];
      c.save(); c.translate(5, -6); c.rotate(sw); c.fillRect(-1.3, 0, 2.6, 6); c.restore();
      c.save(); c.translate(-5, -6); c.rotate(-sw); c.fillRect(-1.3, 0, 2.6, 6); c.restore();
      c.fillStyle = fur[0]; ellipse(c, 0, -9, 9, 4.4); c.fill();
      c.strokeStyle = fur[0]; c.lineWidth = 2.6; c.lineCap = 'round'; c.beginPath(); c.moveTo(-8, -10); c.quadraticCurveTo(-14, -16, -12, -20); c.stroke();
      c.fillStyle = fur[0]; circle(c, 9, -13, 4.6); c.fill();
    }
    const hx = o.pose === 'sit' ? 2 : 9, hy = o.pose === 'sit' ? -18 : -13;
    c.fillStyle = fur[0];
    c.beginPath(); c.moveTo(hx - 4, hy - 2); c.lineTo(hx - 3, hy - 8); c.lineTo(hx, hy - 4); c.fill();
    c.beginPath(); c.moveTo(hx + 1, hy - 4); c.lineTo(hx + 3.5, hy - 8); c.lineTo(hx + 4.5, hy - 2); c.fill();
    c.fillStyle = '#2ecc71'; circle(c, hx + 2.2, hy - 0.6, 1); c.fill();
    c.restore();
  }

  /** Утка на воде: o.t - время, o.ph - фаза покачивания, o.fast - удирает. */
  function duck(c, o) {
    const bob = Math.sin(o.t * 2.2 + o.ph) * 0.8;
    c.save();
    c.strokeStyle = 'rgba(255,255,255,0.45)'; c.lineWidth = 1;
    const k = (o.t * (o.fast ? 2.4 : 0.8) + o.ph) % 1;
    ellipse(c, 0, 0, 7 + k * 8, 2.6 + k * 3); c.globalAlpha = 1 - k; c.stroke(); c.globalAlpha = 1;
    c.translate(0, bob);
    c.scale(o.facing, 1);
    c.fillStyle = o.drake ? '#8d6e63' : '#a1887f'; ellipse(c, 0, -3, 7, 3.6); c.fill();
    c.fillStyle = o.drake ? '#5d4037' : '#795548'; ellipse(c, -3, -3.6, 3.6, 2, -0.2); c.fill();
    c.fillStyle = '#efe9e0'; c.fillRect(-7.5, -4, 2, 1.4);
    c.fillStyle = o.drake ? '#1b7a4b' : '#8d6e63'; circle(c, 5, -7.4, 2.6); c.fill();
    if (o.drake) { c.fillStyle = '#fff'; c.fillRect(3.6, -5.4, 2.8, 0.8); }
    c.fillStyle = '#f4b400'; c.beginPath(); c.moveTo(7, -7.6); c.lineTo(10, -7); c.lineTo(7, -6.4); c.fill();
    c.fillStyle = '#111'; circle(c, 5.8, -8, 0.6); c.fill();
    c.restore();
  }

  /** Фонтан на площади: круглая чаша радиуса r, струи бьют вверх. */
  function fountain(c, r, t, night) {
    const rx = r, ry = r * 0.5, H = 12;
    c.save();
    c.fillStyle = 'rgba(30,20,10,0.2)'; ellipse(c, 4, 3, rx + 4, ry + 3); c.fill();
    c.fillStyle = '#9e958a';
    c.beginPath(); c.ellipse(0, 0, rx, ry, 0, 0, Math.PI); c.lineTo(-rx, -H); c.ellipse(0, -H, rx, ry, 0, Math.PI, 0, true); c.closePath(); c.fill();
    c.fillStyle = '#c9c0b4'; ellipse(c, 0, -H, rx, ry); c.fill();
    c.fillStyle = night ? '#2d5f8a' : '#5aa9d6'; ellipse(c, 0, -H + 1, rx - 6, ry - 3); c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.4)'; c.lineWidth = 1;
    for (let i = 0; i < 3; i++) { const k = (t * 0.5 + i / 3) % 1; c.globalAlpha = 1 - k; ellipse(c, 0, -H + 1, 6 + k * (rx - 14), 3 + k * (ry - 6)); c.stroke(); }
    c.globalAlpha = 1;
    c.fillStyle = '#b5ab9f'; c.fillRect(-3, -H - 26, 6, 26);
    c.fillStyle = '#c9c0b4'; ellipse(c, 0, -H - 26, 11, 4.4); c.fill();
    c.fillStyle = night ? '#3d78a8' : '#7cc2ea'; ellipse(c, 0, -H - 26.5, 8, 3); c.fill();
    c.strokeStyle = night ? 'rgba(190,225,255,0.7)' : 'rgba(225,245,255,0.9)'; c.lineWidth = 1.4; c.lineCap = 'round';
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + t * 0.3, ex = Math.cos(a) * 15, ey = Math.sin(a) * 6;
      const top = -H - 44 - Math.sin(t * 7 + i) * 2;
      c.beginPath(); c.moveTo(0, -H - 28); c.quadraticCurveTo(ex * 0.5, top, ex, -H - 26 + ey + 6); c.stroke();
    }
    c.restore();
  }

  /** Мяч на спортплощадке: футбольный, с тенью и высотой z. */
  function football(c, z, spin) {
    c.save();
    c.fillStyle = 'rgba(30,20,10,0.22)'; ellipse(c, 0, 0, 6, 2.2); c.fill();
    c.translate(0, -5 - (z || 0));
    c.fillStyle = '#fafafa'; circle(c, 0, 0, 5.2); c.fill();
    c.strokeStyle = '#999'; c.lineWidth = 0.6; c.stroke();
    c.fillStyle = '#222';
    for (let i = 0; i < 3; i++) { const a = spin + i * 2.1; circle(c, Math.cos(a) * 2.6, Math.sin(a) * 2.6, 1.3); c.fill(); }
    circle(c, 0, 0, 1.2); c.fill();
    c.restore();
  }

  /* ======================= Растения и предметы ======================= */
  const TREE_SHAPES = new Map();
  function treeShape(seed) {
    if (TREE_SHAPES.has(seed)) return TREE_SHAPES.get(seed);
    const rnd = mulberry32(seed), blobs = [];
    for (let i = 0; i < 9; i++) {
      const a = rnd() * Math.PI * 2, d = rnd() * 20;
      blobs.push({ x: Math.cos(a) * d * 1.2, y: Math.sin(a) * d * 0.8, r: 14 + rnd() * 10, c: Math.floor(rnd() * 5) });
    }
    blobs.sort((a, b) => a.y - b.y);
    TREE_SHAPES.set(seed, blobs);
    return blobs;
  }
  function tree(c, type, o) {
    const T = TREES[type];
    const sway = Math.sin(o.t * 0.9 + o.seed) * (o.wind ? 3 : 1.2);
    c.save();
    shadow(c, 30, 10, 0.18);
    c.fillStyle = T.trunk;
    c.beginPath(); c.moveTo(-5, 0); c.lineTo(-3, -46); c.lineTo(3, -46); c.lineTo(5, 0); c.closePath(); c.fill();
    if (T.marks) { c.fillStyle = T.marks; for (let i = 0; i < 5; i++) c.fillRect(-4 + (i % 2) * 3, -8 - i * 8, 3, 1.4); }
    c.strokeStyle = T.trunk; c.lineWidth = 2.4;
    c.beginPath(); c.moveTo(0, -36); c.lineTo(-12, -54); c.moveTo(1, -40); c.lineTo(12, -58); c.stroke();
    for (const b of treeShape(o.seed)) {
      c.fillStyle = T.leaves[b.c % T.leaves.length];
      circle(c, b.x + sway, -72 + b.y, b.r); c.fill();
    }
    c.fillStyle = 'rgba(255,240,200,0.14)';
    circle(c, -10 + sway, -86, 12); c.fill();
    c.restore();
  }
  function bush(c, r, seed, alpha) {
    const rnd = mulberry32(seed);
    c.save();
    c.globalAlpha = alpha;
    shadow(c, r * 1.1, r * 0.4, 0.2);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + rnd() * 0.4;
      c.fillStyle = BUSH_COLORS[Math.floor(rnd() * BUSH_COLORS.length)];
      circle(c, Math.cos(a) * r * 0.55, -r * 0.45 + Math.sin(a) * r * 0.25, r * (0.42 + rnd() * 0.18)); c.fill();
    }
    c.fillStyle = BUSH_COLORS[Math.floor(rnd() * BUSH_COLORS.length)];
    circle(c, 0, -r * 0.75, r * 0.45); c.fill();
    c.restore();
  }
  function lamp(c, on, evening) {
    shadow(c, 6, 2.4, 0.2);
    c.fillStyle = '#3d4a4f'; rr(c, -2, -78, 4, 78, 2); c.fill();
    c.fillStyle = '#2c3538'; rr(c, -8, -86, 16, 8, 3); c.fill();
    c.fillStyle = on && evening ? '#fff1b8' : '#d9dee0'; rr(c, -6, -79, 12, 3, 1.5); c.fill();
  }
  function pumpkin(c, r) {
    shadow(c, r * 1.1, r * 0.4, 0.2);
    c.fillStyle = '#e67e22'; ellipse(c, 0, -r * 0.8, r * 1.15, r * 0.85); c.fill();
    c.strokeStyle = '#c0651a'; c.lineWidth = 1.2;
    for (const k of [-0.5, 0, 0.5]) { c.beginPath(); c.ellipse(k * r, -r * 0.8, r * 0.35, r * 0.82, 0, 0, Math.PI * 2); c.stroke(); }
    c.fillStyle = '#5d6d2b'; c.fillRect(-1.2, -r * 1.9, 2.4, r * 0.5);
  }
  function leafPile(c, size, seed, t) {
    if (size < 0.05) return;
    const rnd = mulberry32(seed);
    const R = 36 * (0.55 + size * 0.45), H = 30 * size;
    c.save();
    // Тень и тёмный край, чтобы куча читалась на газоне с листьями
    c.fillStyle = 'rgba(40,20,5,0.32)'; ellipse(c, 3, 2, R * 1.12, R * 0.44); c.fill();
    const g = c.createLinearGradient(0, -H - 4, 0, R * 0.3);
    g.addColorStop(0, '#f6a531'); g.addColorStop(0.55, '#d8641c'); g.addColorStop(1, '#8f3a12');
    c.fillStyle = g;
    c.beginPath();
    c.ellipse(0, 0, R, R * 0.4, 0, 0, Math.PI);
    c.bezierCurveTo(-R * 0.95, -H * 0.55, -R * 0.45, -H * 1.05, 0, -H);
    c.bezierCurveTo(R * 0.45, -H * 1.05, R * 0.95, -H * 0.55, R, 0);
    c.fill();
    c.strokeStyle = 'rgba(90,35,10,0.7)'; c.lineWidth = 1.4; c.stroke();
    for (let i = 0; i < 120; i++) {
      const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd());
      const x = Math.cos(a) * d * R * 0.95, y = Math.sin(a) * d * R * 0.38;
      const z = (1 - d * d) * H;
      leafShape(c, x, y - z, 3.6 + rnd() * 1.6, rnd() * 6, LEAF_COLORS[Math.floor(rnd() * LEAF_COLORS.length)]);
    }
    // Солнечный блик и пара листиков, что шевелятся сверху
    c.fillStyle = 'rgba(255,236,170,0.35)'; ellipse(c, -R * 0.25, -H * 0.75, R * 0.35, H * 0.18 + 1, -0.3); c.fill();
    const wob = Math.sin((t || 0) * 2.4 + seed) * 1.5;
    leafShape(c, -4 + wob, -H - 3, 4.4, 0.6 + wob * 0.2, '#f1c40f');
    leafShape(c, 6 - wob, -H - 1, 4, 2.2 - wob * 0.2, '#c0392b');
    c.restore();
  }

  function item(c, kind, t, id, z) {
    const bob = kind === 'ball' || kind === 'stick' ? 0 : Math.sin(t * 3 + id) * 1;
    c.save();
    shadow(c, 7, 2.2, 0.18);
    c.translate(0, -3 - (z || 0) + bob);
    switch (kind) {
      case 'cookie':
        c.fillStyle = '#d99a5b'; circle(c, 0, 0, 5.5); c.fill();
        c.fillStyle = '#5c3a1e'; for (const [x, y] of [[-2, -1], [2, -2], [1, 2], [-2, 2]]) { circle(c, x, y, 0.9); c.fill(); }
        break;
      case 'biscuit':
        c.rotate(-0.3); c.fillStyle = '#e8c48f';
        rr(c, -5, -1.8, 10, 3.6, 1.5); c.fill();
        for (const [x, y] of [[-5, -1.8], [-5, 1.8], [5, -1.8], [5, 1.8]]) { circle(c, x, y, 2.2); c.fill(); }
        break;
      case 'sausage':
        c.rotate(0.3); c.fillStyle = '#c8553d'; rr(c, -7, -2.7, 14, 5.4, 2.7); c.fill();
        c.fillStyle = 'rgba(255,255,255,0.35)'; rr(c, -5, -1.8, 8, 1.4, 0.7); c.fill();
        break;
      case 'ball':
        c.fillStyle = '#d4e157'; circle(c, 0, 0, 5); c.fill();
        c.strokeStyle = '#fff'; c.lineWidth = 1.2; c.beginPath(); c.arc(-5, 0, 4.4, -1, 1); c.stroke(); c.beginPath(); c.arc(5, 0, 4.4, Math.PI - 1, Math.PI + 1); c.stroke();
        break;
      case 'stick':
        c.rotate(-0.2); c.strokeStyle = '#8b5a2b'; c.lineWidth = 3; c.lineCap = 'round';
        c.beginPath(); c.moveTo(-11, 1); c.lineTo(11, -1); c.moveTo(3, -0.5); c.lineTo(7, -5); c.stroke();
        break;
      case 'chestnut':
        c.fillStyle = '#6e2c00'; ellipse(c, 0, 0, 4.6, 4); c.fill();
        c.fillStyle = '#d5b48a'; ellipse(c, 0, 2.2, 3.4, 1.4); c.fill();
        c.fillStyle = 'rgba(255,255,255,0.35)'; circle(c, -1.4, -1.6, 1); c.fill();
        break;
      case 'chickenbone':
        c.rotate(0.5); c.strokeStyle = '#d7ccc8'; c.lineWidth = 2.2; c.lineCap = 'round';
        c.beginPath(); c.moveTo(-6, 0); c.lineTo(5, 0); c.stroke();
        c.fillStyle = '#efebe9'; circle(c, 6, -1.2, 2); c.fill(); circle(c, 6, 1.2, 2); c.fill();
        c.fillStyle = '#a1887f'; ellipse(c, -6, 0, 3.4, 2.8); c.fill();
        break;
      case 'wrapper':
        c.fillStyle = '#f4f4f4'; c.beginPath(); c.moveTo(-6, -2); c.lineTo(-1, -5); c.lineTo(6, -3); c.lineTo(4, 3); c.lineTo(-3, 4); c.closePath(); c.fill();
        c.strokeStyle = '#c9c9c9'; c.lineWidth = 0.8; c.stroke();
        c.fillStyle = '#e74c3c'; c.fillRect(-2, -2, 4, 2);
        break;
      case 'mushroom':
        c.fillStyle = '#f5f0e6'; rr(c, -1.6, -5, 3.2, 6, 1.4); c.fill();
        c.fillStyle = '#d63031'; c.beginPath(); c.arc(0, -4.5, 5.5, Math.PI, Math.PI * 2); c.fill();
        c.fillStyle = '#fff'; circle(c, -2.4, -6.4, 0.9); c.fill(); circle(c, 1.6, -7.6, 0.9); c.fill(); circle(c, 2.6, -5.4, 0.8); c.fill();
        break;
      default: break;
    }
    c.restore();
  }

  function poopPile(c) {
    c.fillStyle = '#5d3a1a';
    ellipse(c, 0, -1.6, 4, 2.4); c.fill();
    ellipse(c, 0.4, -3.6, 2.8, 1.8); c.fill();
    ellipse(c, 0.8, -5.2, 1.6, 1.2); c.fill();
  }

  /* ======================= Мысль над головой ======================= */
  function thought(c, icon, t) {
    const y = Math.sin(t * 3) * 1.5;
    c.save();
    c.translate(0, y);
    c.fillStyle = 'rgba(255,255,255,0.95)';
    circle(c, -10, 14, 2.2); c.fill();
    circle(c, -6, 9, 3.2); c.fill();
    c.beginPath();
    c.ellipse(4, -2, 16, 12, 0, 0, Math.PI * 2);
    c.fill();
    c.translate(4, -2);
    thoughtIcon(c, icon);
    c.restore();
  }
  function thoughtIcon(c, icon) {
    switch (icon) {
      case 'tree':
        c.fillStyle = '#6d4c41'; c.fillRect(-1.5, 0, 3, 8);
        c.fillStyle = '#e67e22'; circle(c, 0, -3, 6); c.fill(); c.fillStyle = '#f1c40f'; circle(c, -3, -1, 3.4); c.fill();
        break;
      case 'grass':
        c.strokeStyle = '#7cb342'; c.lineWidth = 2; c.lineCap = 'round';
        c.beginPath(); for (let i = -2; i <= 2; i++) { c.moveTo(i * 3, 7); c.lineTo(i * 3 + (i % 2) * 2, -3 + Math.abs(i)); } c.stroke();
        break;
      case 'ball': item(c, 'ball', 0, 0, -3); break;
      case 'heart':
        c.fillStyle = '#ff6b81';
        c.beginPath(); c.moveTo(0, 6); c.bezierCurveTo(-9, -1, -5, -9, 0, -3); c.bezierCurveTo(5, -9, 9, -1, 0, 6); c.fill();
        break;
      case 'home':
        c.fillStyle = '#7a4e33'; c.fillRect(-5, -2, 10, 9);
        c.fillStyle = '#c0392b'; c.beginPath(); c.moveTo(-8, -1); c.lineTo(0, -9); c.lineTo(8, -1); c.closePath(); c.fill();
        break;
      case 'give':
        c.fillStyle = '#efc4a4'; circle(c, 0, 0, 5); c.fill(); c.fillStyle = '#d4e157'; circle(c, 3, -3, 3); c.fill();
        break;
      default: item(c, icon, 0, 0, -3);
    }
  }

  /* ======================= Изометрическая коробка ======================= */
  /** P(x, y, z) -> {x, y} на экране. Видны грани +x (правая) и +y (левая) и крыша. */
  function isoBox(c, P, x, y, w, h, z0, z1, top, left, right) {
    const q = (pts, color) => { c.fillStyle = color; c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y))); c.closePath(); c.fill(); };
    q([P(x, y + h, z0), P(x + w, y + h, z0), P(x + w, y + h, z1), P(x, y + h, z1)], left);
    q([P(x + w, y, z0), P(x + w, y + h, z0), P(x + w, y + h, z1), P(x + w, y, z1)], right);
    q([P(x, y, z1), P(x + w, y, z1), P(x + w, y + h, z1), P(x, y + h, z1)], top);
  }

  /* ======================= Дом после прогулки ======================= */
  /** Комната с последствиями прогулки. res.done: { pee, poop, energy, happy } - true, если сделано. */
  function homeScene(c, w, h, res, t) {
    const done = res.done;
    // Стена и пол
    c.fillStyle = '#f3e7da'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#e7d8c6'; c.fillRect(0, h * 0.62, w, h * 0.38);
    c.strokeStyle = 'rgba(150,110,70,0.25)'; c.lineWidth = 1;
    for (let x = -40; x < w + 40; x += 34) { c.beginPath(); c.moveTo(x, h * 0.62); c.lineTo(x - 30, h); c.stroke(); }
    // Окно и рыжая штора, как дома на фото
    c.fillStyle = '#cfe4f2'; c.fillRect(w * 0.08, h * 0.1, w * 0.22, h * 0.36);
    c.fillStyle = '#ffffff'; c.fillRect(w * 0.08 + w * 0.105, h * 0.1, 3, h * 0.36);
    c.fillStyle = '#c9541f'; c.fillRect(w * 0.27, h * 0.05, w * 0.07, h * 0.58);
    c.fillStyle = '#ececec'; c.fillRect(w * 0.04, h * 0.05, w * 0.05, h * 0.58);
    // Розовый коврик
    c.fillStyle = '#f2d3d6'; ellipse(c, w * 0.52, h * 0.84, w * 0.2, h * 0.08); c.fill();
    // Оранжевое кресло
    const sx = w * 0.74, sy = h * 0.62;
    c.fillStyle = '#e8732c'; rr(c, sx, sy - h * 0.2, w * 0.22, h * 0.24, 10); c.fill();
    c.fillStyle = '#f08a3e'; rr(c, sx + 6, sy - h * 0.06, w * 0.22 - 12, h * 0.1, 8); c.fill();
    c.fillStyle = '#8a5a3b'; c.fillRect(sx + 8, sy + h * 0.04, 4, 8); c.fillRect(sx + w * 0.22 - 12, sy + h * 0.04, 4, 8);

    const all = done.pee && done.poop && done.energy && done.happy;
    // Луи
    c.save();
    if (all) {
      c.translate(sx + w * 0.11, sy - h * 0.05);
      c.scale(1.3, 1.3);
      louis(c, { facing: -1, phase: 0, moving: 0, t, pose: 'lie', expr: 'happy' });
      c.restore();
      c.fillStyle = '#7f8c8d'; c.font = 'bold 14px system-ui, sans-serif'; c.fillText('z', sx + w * 0.16, sy - h * 0.2 - Math.sin(t * 2) * 3); c.fillText('Z', sx + w * 0.19, sy - h * 0.28 - Math.sin(t * 2 + 1) * 3);
    } else if (!done.happy) {
      c.translate(sx + w * 0.11, sy - h * 0.05);
      c.scale(1.3, 1.3);
      louis(c, { facing: -1, phase: 0, moving: 0, t, pose: 'lie', expr: 'sad' });
      c.restore();
      c.fillStyle = '#95a5a6'; ellipse(c, sx + w * 0.11, sy - h * 0.33, 16, 7); c.fill(); ellipse(c, sx + w * 0.08, sy - h * 0.31, 10, 6); c.fill();
      c.strokeStyle = '#74b9ff'; c.lineWidth = 1.4;
      for (let i = 0; i < 4; i++) { const yy = (t * 40 + i * 9) % 22; c.beginPath(); c.moveTo(sx + w * 0.06 + i * 6, sy - h * 0.29 + yy); c.lineTo(sx + w * 0.06 + i * 6 - 1, sy - h * 0.29 + yy + 4); c.stroke(); }
    } else {
      const zoom = !done.energy;
      c.translate(w * 0.5 + (zoom ? Math.sin(t * 5) * w * 0.12 : 0), h * 0.8);
      louis(c, { facing: zoom && Math.cos(t * 5) < 0 ? -1 : 1, phase: t * 14, moving: zoom ? 1 : 0, t, pose: zoom ? 'run' : 'stand', expr: 'happy' });
      c.restore();
    }
    // Последствия
    if (!done.pee) { c.fillStyle = 'rgba(241,196,15,0.55)'; ellipse(c, w * 0.18, h * 0.9, 26, 7); c.fill(); }
    if (!done.poop) { c.save(); c.translate(w * 0.5, h * 0.86); c.scale(2.2, 2.2); poopPile(c); c.restore(); }
    if (!done.energy) {
      c.fillStyle = '#9b59b6'; rr(c, w * 0.3, h * 0.88, 26, 9, 4); c.fill();
      c.fillStyle = '#ecf0f1'; for (let i = 0; i < 5; i++) { circle(c, w * 0.3 + 30 + i * 5, h * 0.9 + (i % 2) * 4, 2); c.fill(); }
      c.fillStyle = '#9b59b6'; rr(c, w * 0.36, h * 0.95, 22, 8, 4); c.fill();
    }
  }

  root.WalkArt = { LOUIS, PEOPLE, DOGS, TREES, LEAF_COLORS, BUSH_COLORS, mulberry32, circle, ellipse, rr, leafShape,
    louis, dog, person, pigeon, cat, duck, fountain, football, tree, bush, lamp, pumpkin, leafPile, item, poopPile, thought, isoBox, homeScene };
})(typeof self !== 'undefined' ? self : this);
