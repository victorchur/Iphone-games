/*
 * Луи на прогулке - рендер на Canvas 2D, ввод, звук, эффекты и экраны.
 * Баланс и вся симуляция в logic.js (CONFIG, LEVELS, WORLD).
 */
(() => {
  'use strict';

  const G = window.LouisLogic;
  const CFG = G.CONFIG;
  const WORLD = G.WORLD;
  const LEVELS = G.LEVELS;

  /* ============ Внешний вид. Цвета Луи можно поменять под настоящего Луи ============ */
  const LOOKS = {
    louis:     { scale: 1.12, body: '#e7a960', belly: '#fff1dc', muzzle: '#fff1dc', ear: '#b9773b', far: '#c98f4f', ears: 'floppy', collar: '#e53935', tag: '#ffd43b' },
    'Рекс':    { scale: 1.55, body: '#c98a4a', belly: '#e3b57e', muzzle: '#3a2d25', ear: '#2f2620', far: '#a8713b', ears: 'pointy', saddle: '#2f2620' },
    'Барон':   { scale: 1.6,  body: '#2a2320', belly: '#a8632d', muzzle: '#a8632d', ear: '#1a1513', far: '#1c1715', ears: 'floppy' },
    'Гром':    { scale: 1.5,  body: '#7d8794', belly: '#f2f4f7', muzzle: '#f2f4f7', ear: '#5d6773', far: '#677180', ears: 'pointy', eye: '#3d8bfd' },
    'Бусинка': { scale: 0.78, body: '#f7f3ee', belly: '#ffffff', muzzle: '#ffffff', ear: '#e6dccf', far: '#e2d9cc', ears: 'floppy', bow: '#ff6b9e' },
    'Тоша':    { scale: 0.8,  body: '#f4f1ec', belly: '#ffffff', muzzle: '#ffffff', ear: '#2f2a26', far: '#d9d4cc', ears: 'pointy', saddle: '#2f2a26' },
    'Кнопка':  { scale: 0.8,  body: '#d9b98f', belly: '#ead3b0', muzzle: '#3b2e28', ear: '#3b2e28', far: '#c3a276', ears: 'floppy' },
    'Пиксель': { scale: 0.7,  body: '#a3a6ad', belly: '#e9e6e1', muzzle: '#e9e6e1', ear: '#8c8f96', far: '#8f9299', ears: 'pointy' },
    'Ричи':    { scale: 0.82, body: '#a0522d', belly: '#c47a4a', muzzle: '#7a3d20', ear: '#7a3d20', far: '#8a4524', ears: 'floppy' },
    'Зефирка': { scale: 0.8,  body: '#ffd6e0', belly: '#fff0f4', muzzle: '#fff0f4', ear: '#f7b7c8', far: '#f0c2cf', ears: 'floppy', bow: '#9775fa' },
    'Луна':    { scale: 0.8,  body: '#2b2b33', belly: '#4a4a55', muzzle: '#4a4a55', ear: '#1d1d23', far: '#222229', ears: 'pointy' },
    'Чапа':    { scale: 0.84, body: '#d9822b', belly: '#fff4e6', muzzle: '#fff4e6', ear: '#b86a1f', far: '#bd6f22', ears: 'pointy' }
  };

  const P = {
    outside: '#5b8f4f',
    grass: '#86c66f', grassDark: '#6fae5a', grassLight: '#a3d98a',
    asphalt: '#a7abb1', asphaltDark: '#979ba1', curb: '#dfe2e6',
    rubber: '#e9b96e', sand: '#f2dc9b', wood: '#a8744a', woodDark: '#7a5233',
    brick: '#d78e68', brickDark: '#b86f4f', glass: '#a9d3f0',
    canopy: ['#4f9a4a', '#5fae55', '#72c265'], trunk: '#7a5233',
    bush: ['#3f8a44', '#4f9d50', '#62b25f'],
    treat: '#ff9f43', toy: '#4dabf7'
  };

  const VISUAL = {
    DPR_MAX: 2,           // плотность пикселей canvas: x3 на iPhone не видно глазом, а нагрузка в 2.25 раза выше
    BG_DPR_MAX: 2,        // плотность пикселей фона
    BG_MAX_PIXELS: 12e6,  // защита от лимита размера canvas в iOS
    VIS_HEIGHT: 1700,     // высота нарисованного двора (с гаражами)
    CAMERA_LERP: 7,
    JOY_RADIUS: 58,
    MAX_PARTICLES: 260,
    MAX_DT: 0.05,
    NIGHT_RES: 0.5        // разрешение слоя темноты: он размытый, полного не нужно
  };
  const STORAGE_MUTE = 'louis-muted';
  const STORAGE_TUTORIAL = 'louis-tutorial-done';

  /* ------------------------------- DOM ------------------------------- */
  const $ = (id) => document.getElementById(id);
  const canvas = $('game');
  const ctx = canvas.getContext('2d', { alpha: false });
  const ui = {
    hud: $('hud'), moodFace: $('mood-face'), moodFill: $('mood-fill'), timer: $('timer'), score: $('score'),
    stamina: $('stamina-fill'), sniff: $('btn-sniff'), pause: $('btn-pause'), mute: $('btn-mute'), toast: $('toast'),
    menu: $('screen-menu'), levels: $('levels'), album: $('album'), totals: $('totals'),
    pauseScreen: $('screen-pause'), resume: $('btn-resume'), quit: $('btn-quit'),
    result: $('screen-result'), resultTitle: $('result-title'), resultStars: $('result-stars'),
    resultScore: $('result-score'), resultBest: $('result-best'), resultRows: $('result-rows'),
    again: $('btn-again'), next: $('btn-next'), toMenu: $('btn-menu')
  };

  const safeStorage = {
    getItem(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } },
    setItem(k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* ignore */ } }
  };

  /* ------------------------------ Состояние ------------------------------ */
  let W = 0, H = 0, dpr = 1, scale = 1, viewW = 440, viewH = 800;
  let bgCanvas = null, bgScale = 1;
  const overlay = document.createElement('canvas');
  const octx = overlay.getContext('2d');

  const app = {
    mode: 'menu',     // menu | playing | paused | ending | result
    walk: null,
    levelIndex: 0,
    progress: G.loadProgress(safeStorage),
    cam: { x: 280, y: 200 },
    time: 0,
    particles: [],
    bubbles: [],
    rings: [],
    lastResult: null,
    endTimer: 0,
    heartbeat: 0,
    ambient: 3,
    lowMoodHint: false,
    tutorial: safeStorage.getItem(STORAGE_TUTORIAL) !== '1',
    tutorialStep: 0,
    tutorialTimer: 0,
    demo: null
  };

  /* -------------------------------- Звук -------------------------------- */
  const audio = { ctx: null, master: null, noise: null, muted: safeStorage.getItem(STORAGE_MUTE) === '1' };

  function ensureAudio() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!audio.ctx) {
      audio.ctx = new AC();
      audio.master = audio.ctx.createGain();
      audio.master.gain.value = audio.muted ? 0 : 0.9;
      audio.master.connect(audio.ctx.destination);
      const len = Math.floor(audio.ctx.sampleRate * 0.6);
      audio.noise = audio.ctx.createBuffer(1, len, audio.ctx.sampleRate);
      const d = audio.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (audio.ctx.state === 'suspended') audio.ctx.resume().catch(() => {});
  }

  function tone({ type = 'sine', freq = 440, to = 0, dur = 0.1, gain = 0.1, delay = 0, filter = 0 }) {
    if (!audio.ctx || audio.muted) return;
    const c = audio.ctx, t0 = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let node = o;
    if (filter) {
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = filter;
      o.connect(f);
      node = f;
    }
    node.connect(g).connect(audio.master);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  function noise({ dur = 0.1, gain = 0.1, delay = 0, type = 'bandpass', freq = 1000, q = 1 }) {
    if (!audio.ctx || audio.muted) return;
    const c = audio.ctx, t0 = c.currentTime + delay;
    const src = c.createBufferSource();
    src.buffer = audio.noise;
    const f = c.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(audio.master);
    src.start(t0, Math.random() * 0.4);
    src.stop(t0 + dur + 0.05);
  }

  const sfx = {
    bark(big, delay = 0) {
      const f = big ? 230 : 640;
      for (let i = 0; i < 2; i++) {
        const d = delay + i * (big ? 0.2 : 0.14);
        tone({ type: 'sawtooth', freq: f, to: f * 0.6, dur: big ? 0.16 : 0.08, gain: big ? 0.2 : 0.09, delay: d, filter: big ? 900 : 2200 });
        noise({ dur: big ? 0.12 : 0.06, gain: big ? 0.12 : 0.05, delay: d, freq: big ? 500 : 1400, q: 2 });
      }
    },
    growl() {
      if (!audio.ctx || audio.muted) return;
      const c = audio.ctx, t0 = c.currentTime;
      const o = c.createOscillator(), lfo = c.createOscillator(), lg = c.createGain(), g = c.createGain(), f = c.createBiquadFilter();
      o.type = 'sawtooth'; o.frequency.value = 85;
      lfo.frequency.value = 22; lg.gain.value = 0.09;
      f.type = 'lowpass'; f.frequency.value = 420;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.12, t0 + 0.06);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.7);
      lfo.connect(lg).connect(g.gain);
      o.connect(f).connect(g).connect(audio.master);
      o.start(t0); lfo.start(t0);
      o.stop(t0 + 0.75); lfo.stop(t0 + 0.75);
    },
    chomp() {
      noise({ dur: 0.05, gain: 0.18, freq: 900, q: 1.5 });
      noise({ dur: 0.05, gain: 0.15, delay: 0.11, freq: 800, q: 1.5 });
      tone({ freq: 660, to: 990, dur: 0.12, gain: 0.07, delay: 0.2 });
    },
    squeak() {
      tone({ freq: 900, to: 1800, dur: 0.09, gain: 0.1 });
      tone({ freq: 1700, to: 1100, dur: 0.12, gain: 0.08, delay: 0.09 });
    },
    sniff() {
      for (let i = 0; i < 3; i++) noise({ dur: 0.05, gain: 0.12, delay: i * 0.1, type: 'highpass', freq: 2400 });
    },
    friend() {
      [660, 880, 1100, 1320].forEach((f, i) => tone({ freq: f, dur: 0.14, gain: 0.07, delay: i * 0.08 }));
    },
    whine() {
      tone({ type: 'triangle', freq: 1300, to: 650, dur: 0.45, gain: 0.08 });
    },
    heartbeat() {
      tone({ freq: 70, to: 45, dur: 0.12, gain: 0.22 });
      tone({ freq: 70, to: 45, dur: 0.12, gain: 0.16, delay: 0.16 });
    },
    chirp(night) {
      if (night) {
        for (let i = 0; i < 4; i++) tone({ freq: 4200, dur: 0.03, gain: 0.015, delay: i * 0.06 });
      } else {
        const base = 2400 + Math.random() * 900;
        for (let i = 0; i < 3; i++) tone({ freq: base, to: base * 1.3, dur: 0.07, gain: 0.02, delay: i * 0.11 });
      }
    },
    win() { [523, 659, 784, 1047].forEach((f, i) => tone({ type: 'triangle', freq: f, dur: 0.2, gain: 0.08, delay: i * 0.12 })); },
    sad() { [440, 392, 330, 262].forEach((f, i) => tone({ type: 'triangle', freq: f, dur: 0.28, gain: 0.07, delay: i * 0.2 })); },
    click() { tone({ type: 'triangle', freq: 520, to: 700, dur: 0.05, gain: 0.05 }); }
  };

  function setMuted(m) {
    audio.muted = m;
    safeStorage.setItem(STORAGE_MUTE, m ? '1' : '0');
    if (audio.master) audio.master.gain.value = m ? 0 : 0.9;
    ui.mute.classList.toggle('muted', m);
    ui.mute.setAttribute('aria-label', m ? 'Включить звук' : 'Выключить звук');
    ui.mute.setAttribute('aria-pressed', m ? 'true' : 'false');
  }

  function vibrate(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) { /* ignore */ } }

  /* ----------------------------- Утилиты рисования ----------------------------- */
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

  function rr(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }
  function addRR(p, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    p.moveTo(x + r, y);
    p.arcTo(x + w, y, x + w, y + h, r);
    p.arcTo(x + w, y + h, x, y + h, r);
    p.arcTo(x, y + h, x, y, r);
    p.arcTo(x, y, x + w, y, r);
    p.closePath();
  }
  function ellipse(c, x, y, rx, ry, rot = 0) {
    c.beginPath();
    c.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, Math.PI * 2);
  }
  function circle(c, x, y, r) { c.beginPath(); c.arc(x, y, Math.max(0.01, r), 0, Math.PI * 2); }

  /* ================================ Статичный двор ================================ */
  const PATHS = [
    { t: 'rect', x: 370, y: 205, w: 260, h: 95, r: 18 },
    { t: 'rect', x: 455, y: 290, w: 90, h: 330, r: 0 },
    { t: 'ring', x: 500, y: 850, r: 240, w: 70 },
    { t: 'rect', x: 455, y: 1080, w: 90, h: 500, r: 0 },
    { t: 'rect', x: 30, y: 1215, w: 940, h: 64, r: 28 },
    { t: 'rect', x: 8, y: 370, w: 242, h: 640, r: 16 },
    { t: 'rect', x: 545, y: 446, w: 330, h: 52, r: 20 },
    { t: 'rect', x: 0, y: 1548, w: 1000, h: 40, r: 0 }
  ];
  const FLOWER_BEDS = [
    { x: 230, y: 345, rx: 56, ry: 20 }, { x: 760, y: 1470, rx: 66, ry: 24 },
    { x: 840, y: 1180, rx: 50, ry: 18 }, { x: 160, y: 1050, rx: 44, ry: 16 }
  ];
  // Окна дома: часть светится вечером
  const WINDOWS = [];
  (function () {
    const rnd = mulberry32(11);
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 10; col++) {
        const x = 22 + col * 100, y = row === 0 ? 26 : 104;
        if (row === 1 && (col === 4 || col === 5)) continue; // место для двери
        WINDOWS.push({ x, y, w: 56, h: 52, lit: rnd() < 0.55 });
      }
    }
  })();

  function paintBackground() {
    const visH = VISUAL.VIS_HEIGHT;
    let s = scale * Math.min(dpr, VISUAL.BG_DPR_MAX);
    const maxS = Math.sqrt(VISUAL.BG_MAX_PIXELS / (WORLD.width * visH));
    s = Math.min(s, maxS);
    bgScale = s;
    if (!bgCanvas) bgCanvas = document.createElement('canvas');
    bgCanvas.width = Math.ceil(WORLD.width * s);
    bgCanvas.height = Math.ceil(visH * s);
    const c = bgCanvas.getContext('2d');
    c.setTransform(s, 0, 0, s, 0, 0);
    const rnd = mulberry32(2024);

    // Трава
    c.fillStyle = P.grass;
    c.fillRect(0, 0, WORLD.width, visH);
    for (let i = 0; i < 80; i++) {
      c.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,70,0,0.06)';
      ellipse(c, rnd() * 1000, 200 + rnd() * 1400, 40 + rnd() * 100, 25 + rnd() * 60, rnd() * 3);
      c.fill();
    }
    c.lineCap = 'round';
    c.lineWidth = 1.5;
    for (let i = 0; i < 2600; i++) {
      const x = rnd() * 1000, y = 205 + rnd() * 1380;
      c.strokeStyle = rnd() < 0.5 ? P.grassDark : P.grassLight;
      c.beginPath();
      c.moveTo(x, y); c.lineTo(x - 2 + rnd() * 1.5, y - 5 - rnd() * 3);
      c.moveTo(x + 2.5, y); c.lineTo(x + 3.5 + rnd() * 1.5, y - 4 - rnd() * 3);
      c.stroke();
    }
    const flowerColors = ['#ffffff', '#ffe066', '#ffa8c5', '#b197fc'];
    for (let i = 0; i < 180; i++) {
      c.fillStyle = flowerColors[Math.floor(rnd() * flowerColors.length)];
      circle(c, rnd() * 1000, 215 + rnd() * 1360, 1.6 + rnd());
      c.fill();
    }

    // Дорожки: сначала бордюр, потом асфальт
    const asphalt = new Path2D();
    for (const p of PATHS) {
      if (p.t === 'rect') {
        c.fillStyle = P.curb; rr(c, p.x - 4, p.y - 4, p.w + 8, p.h + 8, p.r + 4); c.fill();
        addRR(asphalt, p.x, p.y, p.w, p.h, p.r);
      } else {
        c.strokeStyle = P.curb; c.lineWidth = p.w + 8;
        c.beginPath(); c.arc(p.x, p.y, p.r, 0, Math.PI * 2); c.stroke();
        asphalt.moveTo(p.x + p.r + p.w / 2, p.y);
        asphalt.arc(p.x, p.y, p.r + p.w / 2, 0, Math.PI * 2, false);
        asphalt.moveTo(p.x + p.r - p.w / 2, p.y);
        asphalt.arc(p.x, p.y, p.r - p.w / 2, 0, Math.PI * 2, true);
      }
    }
    c.fillStyle = P.asphalt;
    c.fill(asphalt);
    c.save();
    c.clip(asphalt);
    for (let i = 0; i < 3500; i++) {
      c.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.08)';
      c.fillRect(rnd() * 1000, 200 + rnd() * 1400, 2, 2);
    }
    c.restore();

    // Разметка парковки
    c.strokeStyle = 'rgba(255,255,255,0.75)';
    c.lineWidth = 3;
    for (let y = 385; y < 1000; y += 105) {
      c.beginPath(); c.moveTo(4, y); c.lineTo(100, y); c.moveTo(140, y + 40); c.lineTo(240, y + 40); c.stroke();
    }

    // Детская площадка
    c.fillStyle = P.rubber;
    circle(c, 500, 850, 205); c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.25)'; c.lineWidth = 6;
    circle(c, 500, 850, 150); c.stroke();
    c.fillStyle = P.wood; rr(c, 432, 782, 136, 116, 10); c.fill();
    c.fillStyle = P.sand; rr(c, 442, 792, 116, 96, 6); c.fill();
    for (let i = 0; i < 120; i++) {
      c.fillStyle = 'rgba(160,120,60,0.18)';
      c.fillRect(444 + rnd() * 110, 794 + rnd() * 90, 2, 2);
    }
    c.fillStyle = '#e03131'; rr(c, 470, 820, 20, 14, 3); c.fill(); // ведёрко
    c.fillStyle = '#1c7ed6'; c.fillRect(505, 850, 26, 6);           // лопатка

    // Клумбы
    for (const b of FLOWER_BEDS) {
      c.fillStyle = '#c9a27a'; ellipse(c, b.x, b.y, b.rx + 5, b.ry + 5); c.fill();
      c.fillStyle = '#8b5a3c'; ellipse(c, b.x, b.y, b.rx, b.ry); c.fill();
      for (let i = 0; i < 26; i++) {
        const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd());
        c.fillStyle = ['#ff6b6b', '#ffd43b', '#f783ac', '#ffffff', '#ff922b'][i % 5];
        circle(c, b.x + Math.cos(a) * d * b.rx * 0.85, b.y + Math.sin(a) * d * b.ry * 0.8, 3); c.fill();
      }
    }

    // Тени деревьев
    for (const t of WORLD.trees) {
      c.fillStyle = 'rgba(20,60,20,0.22)';
      ellipse(c, t.x + 6, t.y + 2, 46, 17); c.fill();
    }

    // Предметы на земле
    for (const s2 of WORLD.solids) paintSolid(c, s2, rnd);

    paintBuilding(c);
    paintGarages(c);
  }

  function paintSolid(c, s, rnd) {
    if (s.kind === 'car') {
      c.fillStyle = 'rgba(0,0,0,0.2)'; rr(c, s.x + 4, s.y + 6, s.w, s.h, 16); c.fill();
      c.fillStyle = '#222'; // колёса
      c.fillRect(s.x - 3, s.y + 16, 6, 22); c.fillRect(s.x + s.w - 3, s.y + 16, 6, 22);
      c.fillRect(s.x - 3, s.y + s.h - 38, 6, 22); c.fillRect(s.x + s.w - 3, s.y + s.h - 38, 6, 22);
      c.fillStyle = s.color; rr(c, s.x, s.y, s.w, s.h, 16); c.fill();
      c.fillStyle = 'rgba(0,0,0,0.12)'; rr(c, s.x + 8, s.y + 34, s.w - 16, s.h - 58, 10); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.18)'; rr(c, s.x + 10, s.y + 44, s.w - 20, s.h - 78, 8); c.fill();
      c.fillStyle = P.glass;
      rr(c, s.x + 9, s.y + 20, s.w - 18, 18, 6); c.fill();
      rr(c, s.x + 10, s.y + s.h - 26, s.w - 20, 13, 5); c.fill();
      c.fillStyle = '#fff59d';
      rr(c, s.x + 6, s.y + 3, 14, 6, 3); c.fill(); rr(c, s.x + s.w - 20, s.y + 3, 14, 6, 3); c.fill();
      c.fillStyle = '#ff6b6b';
      rr(c, s.x + 6, s.y + s.h - 8, 12, 5, 2); c.fill(); rr(c, s.x + s.w - 18, s.y + s.h - 8, 12, 5, 2); c.fill();
    } else if (s.kind === 'bench') {
      c.fillStyle = 'rgba(0,0,0,0.18)'; c.fillRect(s.x + 3, s.y + 5, s.w, s.h);
      c.fillStyle = '#4a4a4a';
      c.fillRect(s.x + 8, s.y - 2, 6, s.h + 4); c.fillRect(s.x + s.w - 14, s.y - 2, 6, s.h + 4);
      c.fillStyle = P.wood;
      for (let i = 0; i < 3; i++) { rr(c, s.x, s.y + i * 7.5, s.w, 6, 2); c.fill(); }
      c.fillStyle = P.woodDark;
      for (let i = 0; i < 3; i++) c.fillRect(s.x, s.y + i * 7.5 + 5, s.w, 1);
    } else if (s.kind === 'bins') {
      c.fillStyle = 'rgba(0,0,0,0.2)'; c.fillRect(s.x + 4, s.y + 6, s.w, s.h);
      for (let i = 0; i < 3; i++) {
        const x = s.x + i * 33;
        c.fillStyle = '#2f7a4c'; rr(c, x, s.y, 30, s.h, 4); c.fill();
        c.fillStyle = '#25613c'; rr(c, x + 2, s.y + 2, 26, 14, 3); c.fill();
        c.fillStyle = 'rgba(255,255,255,0.15)'; c.fillRect(x + 4, s.y + 22, 22, 3);
      }
    } else if (s.kind === 'slide') {
      c.fillStyle = 'rgba(0,0,0,0.18)'; rr(c, s.x + 4, s.y + 6, s.w, s.h, 8); c.fill();
      c.fillStyle = '#868e96'; rr(c, s.x, s.y, s.w, 30, 4); c.fill();
      c.strokeStyle = '#dee2e6'; c.lineWidth = 2;
      for (let y = s.y + 6; y < s.y + 28; y += 6) { c.beginPath(); c.moveTo(s.x + 4, y); c.lineTo(s.x + s.w - 4, y); c.stroke(); }
      const g = c.createLinearGradient(0, s.y + 30, 0, s.y + s.h);
      g.addColorStop(0, '#ff6b6b'); g.addColorStop(1, '#ffa94d');
      c.fillStyle = g; rr(c, s.x + 3, s.y + 28, s.w - 6, s.h - 28, 10); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.35)'; c.fillRect(s.x + 9, s.y + 34, 4, s.h - 42);
    } else if (s.kind === 'swings') {
      c.fillStyle = 'rgba(0,0,0,0.15)'; c.fillRect(s.x + 4, s.y + 6, s.w, s.h);
      c.fillStyle = '#495057';
      circle(c, s.x + 6, s.y + 8, 7); c.fill(); circle(c, s.x + s.w - 6, s.y + 8, 7); c.fill();
      c.fillStyle = '#1c7ed6'; c.fillRect(s.x + 4, s.y + 5, s.w - 8, 6);
      c.strokeStyle = '#adb5bd'; c.lineWidth = 1.5;
      for (const sx of [s.x + 30, s.x + 72]) {
        c.beginPath(); c.moveTo(sx, s.y + 8); c.lineTo(sx, s.y + 30); c.moveTo(sx + 12, s.y + 8); c.lineTo(sx + 12, s.y + 30); c.stroke();
        c.fillStyle = '#fab005'; rr(c, sx - 3, s.y + 28, 18, 7, 2); c.fill();
      }
    }
  }

  function paintBuilding(c) {
    c.fillStyle = P.brick;
    c.fillRect(0, 0, 1000, 205);
    c.fillStyle = P.brickDark;
    for (let y = 16; y < 196; y += 9) {
      c.fillRect(0, y, 1000, 1);
      const off = (y / 9) % 2 ? 0 : 14;
      for (let x = off; x < 1000; x += 28) c.fillRect(x, y - 8, 1, 8);
    }
    c.fillStyle = '#8e5640'; c.fillRect(0, 0, 1000, 14);
    c.fillStyle = '#9c6b55'; c.fillRect(0, 190, 1000, 15);
    for (const w of WINDOWS) {
      c.fillStyle = '#f1f3f5'; c.fillRect(w.x - 4, w.y - 4, w.w + 8, w.h + 8);
      const g = c.createLinearGradient(0, w.y, 0, w.y + w.h);
      g.addColorStop(0, '#cfe8fb'); g.addColorStop(1, '#8fc1e8');
      c.fillStyle = g; c.fillRect(w.x, w.y, w.w, w.h);
      c.fillStyle = '#f1f3f5'; c.fillRect(w.x + w.w / 2 - 2, w.y, 4, w.h); c.fillRect(w.x, w.y + 18, w.w, 3);
      c.fillStyle = '#d0d4d8'; c.fillRect(w.x - 6, w.y + w.h + 4, w.w + 12, 5);
    }
    // Подъезд
    c.fillStyle = '#7d8a96'; c.fillRect(436, 98, 128, 12);
    c.fillStyle = 'rgba(0,0,0,0.2)'; c.fillRect(440, 110, 120, 6);
    c.fillStyle = '#5c3b27'; c.fillRect(462, 116, 76, 89);
    c.fillStyle = '#7a4e33'; c.fillRect(468, 122, 64, 83);
    c.strokeStyle = '#5c3b27'; c.lineWidth = 2;
    c.strokeRect(474, 130, 52, 30); c.strokeRect(474, 168, 52, 30);
    c.fillStyle = '#ffd43b'; circle(c, 524, 166, 3); c.fill();
    c.fillStyle = '#868e96'; c.fillRect(544, 150, 9, 14); // домофон
    c.fillStyle = '#1c7ed6'; rr(c, 486, 80, 28, 16, 3); c.fill();
    c.fillStyle = '#fff'; c.font = 'bold 12px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('1', 500, 88.5);
    c.fillStyle = '#fff3bf'; circle(c, 500, 106, 4); c.fill();
    // Крыльцо
    for (let i = 0; i < 3; i++) {
      c.fillStyle = i % 2 ? '#c4c8cc' : '#d3d7db';
      c.fillRect(444 - i * 6, 205 + i * 9, 112 + i * 12, 9);
    }
    // Водосточные трубы
    c.fillStyle = '#7d8a96';
    c.fillRect(8, 10, 6, 192); c.fillRect(986, 10, 6, 192);
  }

  function paintGarages(c) {
    const y0 = 1588;
    c.fillStyle = '#c3bcb2'; c.fillRect(0, y0, 1000, 80);
    c.fillStyle = '#6c757d'; c.fillRect(0, y0 + 80, 1000, 32);
    for (let i = 0; i < 10; i++) {
      const x = 10 + i * 100;
      c.fillStyle = ['#8f99a3', '#a5b4c3', '#9aa59b', '#b0a090'][i % 4];
      c.fillRect(x, y0 + 12, 80, 66);
      c.fillStyle = 'rgba(0,0,0,0.12)';
      for (let k = 0; k < 8; k++) c.fillRect(x + 4 + k * 10, y0 + 14, 2, 62);
      c.fillStyle = '#fff'; c.font = 'bold 11px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(String(i + 1), x + 40, y0 + 24);
    }
  }

  /* ================================ Собаки ================================ */
  function drawLeg(c, x, y, angle, color, len) {
    c.save();
    c.translate(x, y);
    c.rotate(angle);
    c.fillStyle = color;
    rr(c, -2.7, -1, 5.4, len, 2.6);
    c.fill();
    c.restore();
  }

  /**
   * Собака сбоку. (x, y) - точка между лапами на земле.
   * o: facing, phase, moving 0..1, expr (happy|scared|angry|neutral|alert), sniff, t
   */
  function drawDog(c, x, y, look, o) {
    const s = look.scale;
    c.save();
    c.translate(x, y);
    c.fillStyle = 'rgba(0,0,0,0.2)';
    ellipse(c, 0, 0, 17 * s, 4.5 * s);
    c.fill();
    c.scale(o.facing * s, s);

    const mv = o.moving;
    const bob = -Math.abs(Math.sin(o.phase)) * 1.8 * mv;
    const sw = Math.sin(o.phase) * 0.65 * mv;
    const expr = o.expr;
    const legLen = 13;

    // Дальние лапы
    drawLeg(c, 11, -12, -sw, look.far, legLen);
    drawLeg(c, -9, -12, sw, look.far, legLen);

    // Хвост
    let tailA;
    if (expr === 'scared') tailA = 0.9;
    else if (expr === 'angry' || expr === 'alert') tailA = -1.25;
    else tailA = -0.75 + Math.sin(o.t * (expr === 'happy' ? 22 : 9)) * (expr === 'happy' ? 0.55 : 0.3);
    c.save();
    c.translate(-15, -21 + bob);
    c.rotate(tailA);
    c.strokeStyle = look.body; c.lineWidth = 4.2; c.lineCap = 'round';
    c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(-8, -4, -11, -12); c.stroke();
    c.restore();

    // Тело
    c.fillStyle = look.body;
    ellipse(c, 0, -19 + bob, 17, 9.5); c.fill();
    c.fillStyle = look.belly;
    ellipse(c, 3, -14.5 + bob, 11, 4.5); c.fill();
    if (look.saddle) {
      c.fillStyle = look.saddle;
      ellipse(c, -3, -24.5 + bob, 12, 4.8); c.fill();
    }

    // Ближние лапы
    drawLeg(c, 9, -12, sw, look.body, legLen);
    drawLeg(c, -11, -12, -sw, look.body, legLen);

    // Голова
    const hx = o.sniff ? 20 : 16;
    const hy = (o.sniff ? -19 : -31) + bob + (o.sniff ? Math.sin(o.t * 18) * 0.8 : 0);
    if (look.ears === 'pointy') {
      c.fillStyle = look.ear;
      const back = expr === 'scared' ? 0.7 : 0;
      c.save(); c.translate(hx - 3, hy - 5); c.rotate(-0.25 - back);
      c.beginPath(); c.moveTo(-4, 2); c.lineTo(-1, -13); c.lineTo(5, 1); c.closePath(); c.fill();
      c.fillStyle = 'rgba(255,170,170,0.6)';
      c.beginPath(); c.moveTo(-2, 0); c.lineTo(-0.6, -8); c.lineTo(2.6, 0); c.closePath(); c.fill();
      c.restore();
    }
    c.fillStyle = look.body;
    circle(c, hx, hy, 10); c.fill();
    c.fillStyle = look.muzzle;
    ellipse(c, hx + 9, hy + 3, 7.5, 5.5); c.fill();
    c.fillStyle = '#2b1d16';
    ellipse(c, hx + 16, hy + 1.2, 2.8, 2.3); c.fill();

    // Пасть
    if (expr === 'angry') {
      c.fillStyle = '#5a1010';
      ellipse(c, hx + 10, hy + 8, 5, 2.6); c.fill();
      c.fillStyle = '#fff';
      c.fillRect(hx + 7, hy + 6, 1.6, 1.8); c.fillRect(hx + 11, hy + 6, 1.6, 1.8);
    } else if (expr === 'happy' || (mv > 0.6 && expr !== 'scared')) {
      c.fillStyle = '#ff7b93';
      ellipse(c, hx + 11, hy + 9, 2.4, 3.6); c.fill();
    }

    // Глаз
    const ex = hx + 3.5, ey = hy - 3;
    if (expr === 'scared') {
      c.fillStyle = '#fff'; circle(c, ex, ey, 3.1); c.fill();
      c.fillStyle = '#1d1410'; circle(c, ex + 0.8, ey, 1.6); c.fill();
    } else if (expr === 'happy' && Math.sin(o.t * 3) > 0.2) {
      c.strokeStyle = '#1d1410'; c.lineWidth = 1.6;
      c.beginPath(); c.arc(ex, ey + 1, 2.2, Math.PI * 1.1, Math.PI * 1.9); c.stroke();
    } else {
      c.fillStyle = look.eye || '#1d1410'; circle(c, ex, ey, 2.1); c.fill();
      c.fillStyle = '#fff'; circle(c, ex + 0.8, ey - 0.8, 0.75); c.fill();
    }
    if (expr === 'angry' || expr === 'alert') {
      c.strokeStyle = '#1d1410'; c.lineWidth = 1.8; c.lineCap = 'round';
      c.beginPath(); c.moveTo(ex - 3, ey - 5); c.lineTo(ex + 3, ey - 3.2); c.stroke();
    }

    // Висячее ухо
    if (look.ears === 'floppy') {
      c.fillStyle = look.ear;
      const flap = Math.sin(o.phase) * 0.15 * mv + (expr === 'scared' ? 0.6 : 0);
      ellipse(c, hx - 4, hy + 1, 4.2, 8.6, 0.35 + flap); c.fill();
    }

    // Ошейник и бантик
    if (look.collar) {
      c.strokeStyle = look.collar; c.lineWidth = 3.2; c.lineCap = 'round';
      c.beginPath(); c.moveTo(hx - 8, hy + 5); c.lineTo(hx - 2, hy + 9.5); c.stroke();
      c.fillStyle = look.tag; circle(c, hx - 2.5, hy + 12, 2.3); c.fill();
    }
    if (look.bow) {
      c.fillStyle = look.bow;
      c.beginPath(); c.moveTo(hx - 2, hy - 9); c.lineTo(hx - 8, hy - 13); c.lineTo(hx - 8, hy - 5); c.closePath(); c.fill();
      c.beginPath(); c.moveTo(hx - 2, hy - 9); c.lineTo(hx + 4, hy - 13); c.lineTo(hx + 4, hy - 5); c.closePath(); c.fill();
      circle(c, hx - 2, hy - 9, 1.8); c.fill();
    }
    c.restore();
  }

  /* ================================ Вещи ================================ */
  function drawItem(c, it, t) {
    const bob = Math.sin(t * 3 + it.id) * 1.6;
    c.save();
    c.translate(it.x, it.y);
    c.fillStyle = 'rgba(0,0,0,0.18)';
    ellipse(c, 0, 2, 10, 3); c.fill();
    c.translate(0, -6 + bob);
    switch (it.kind) {
      case 'bone':
        c.rotate(-0.4);
        c.fillStyle = '#f8f1e5'; c.strokeStyle = '#c9b9a3'; c.lineWidth = 1.2;
        rr(c, -8, -2.6, 16, 5.2, 2); c.fill(); c.stroke();
        for (const [bx, by] of [[-8, -2.6], [-8, 2.6], [8, -2.6], [8, 2.6]]) { circle(c, bx, by, 3.2); c.fill(); c.stroke(); }
        c.fillStyle = '#f8f1e5'; c.fillRect(-7, -2, 14, 4);
        break;
      case 'cookie':
        c.fillStyle = '#d99a5b'; circle(c, 0, 0, 8); c.fill();
        c.strokeStyle = '#b5773d'; c.lineWidth = 1.2; c.stroke();
        c.fillStyle = '#5c3a1e';
        for (const [cx, cy] of [[-3, -2], [3, -3], [1, 3], [-3, 3], [4, 1]]) { circle(c, cx, cy, 1.3); c.fill(); }
        break;
      case 'sausage':
        c.rotate(0.3);
        c.fillStyle = '#c8553d'; rr(c, -10, -3.8, 20, 7.6, 3.8); c.fill();
        c.fillStyle = 'rgba(255,255,255,0.35)'; rr(c, -7, -2.6, 12, 2, 1); c.fill();
        c.strokeStyle = '#8c2f1f'; c.lineWidth = 1.4;
        c.beginPath(); c.moveTo(-10, 0); c.lineTo(-12.5, -1.5); c.moveTo(10, 0); c.lineTo(12.5, 1.5); c.stroke();
        break;
      case 'ball':
        c.fillStyle = '#d4e157'; circle(c, 0, 0, 7.5); c.fill();
        c.strokeStyle = '#fff'; c.lineWidth = 1.5;
        c.beginPath(); c.arc(-7, 0, 6, -1, 1); c.stroke();
        c.beginPath(); c.arc(7, 0, 6, Math.PI - 1, Math.PI + 1); c.stroke();
        break;
      case 'stick':
        c.rotate(-0.25);
        c.strokeStyle = '#8b5a2b'; c.lineWidth = 3.6; c.lineCap = 'round';
        c.beginPath(); c.moveTo(-12, 1); c.lineTo(12, -1); c.moveTo(4, -0.5); c.lineTo(8, -6); c.stroke();
        c.strokeStyle = '#a9743f'; c.lineWidth = 1.2;
        c.beginPath(); c.moveTo(-9, 0); c.lineTo(9, -1.4); c.stroke();
        break;
      case 'squeaky':
        c.fillStyle = '#ffd43b'; ellipse(c, 0, 1, 8, 6); c.fill();
        circle(c, 5, -5, 4.4); c.fill();
        c.fillStyle = '#ff922b'; ellipse(c, 9.5, -4.4, 2.8, 1.5); c.fill();
        c.fillStyle = '#1d1410'; circle(c, 6, -6, 1); c.fill();
        c.fillStyle = '#fab005'; ellipse(c, -2, 1, 4, 2.4, -0.3); c.fill();
        break;
      default: break;
    }
    c.restore();
    // Блёстка
    const sp = (t * 1.3 + it.id * 0.37) % 2.2;
    if (sp < 0.5) {
      const a = Math.sin(sp / 0.5 * Math.PI);
      c.save();
      c.translate(it.x + 9, it.y - 16 + bob);
      c.rotate(t * 2);
      c.fillStyle = `rgba(255,255,255,${a})`;
      c.beginPath();
      c.moveTo(0, -5); c.lineTo(1.3, -1.3); c.lineTo(5, 0); c.lineTo(1.3, 1.3);
      c.lineTo(0, 5); c.lineTo(-1.3, 1.3); c.lineTo(-5, 0); c.lineTo(-1.3, -1.3); c.closePath(); c.fill();
      c.restore();
    }
  }

  /* ============================ Деревья, кусты, фонари ============================ */
  const TREE_SEEDS = WORLD.trees.map((t, i) => mulberry32(100 + i));
  const TREE_SHAPES = WORLD.trees.map((t, i) => {
    const rnd = TREE_SEEDS[i];
    const blobs = [];
    for (let k = 0; k < 6; k++) {
      const a = rnd() * Math.PI * 2, d = rnd() * 18;
      blobs.push({ x: Math.cos(a) * d, y: Math.sin(a) * d * 0.7, r: 22 + rnd() * 12, c: Math.floor(rnd() * 3) });
    }
    return blobs;
  });
  const BUSH_SHAPES = WORLD.bushes.map((b, i) => {
    const rnd = mulberry32(300 + i);
    const blobs = [];
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2 + rnd() * 0.5;
      blobs.push({ x: Math.cos(a) * b.r * 0.5, y: Math.sin(a) * b.r * 0.3 - b.r * 0.25, r: b.r * (0.45 + rnd() * 0.2), c: k % 3 });
    }
    blobs.push({ x: 0, y: -b.r * 0.45, r: b.r * 0.5, c: 2 });
    const berries = [];
    for (let k = 0; k < 5; k++) berries.push({ x: (rnd() - 0.5) * b.r * 1.2, y: -b.r * (0.2 + rnd() * 0.6) });
    return { blobs, berries };
  });

  function drawTree(c, t, i, time) {
    c.fillStyle = P.trunk;
    rr(c, t.x - 6, t.y - 34, 12, 36, 4); c.fill();
    c.fillStyle = 'rgba(0,0,0,0.15)'; c.fillRect(t.x + 1, t.y - 34, 5, 36);
    const sway = Math.sin(time * 0.8 + i) * 1.5;
    for (const b of TREE_SHAPES[i]) {
      c.fillStyle = P.canopy[b.c];
      circle(c, t.x + b.x + sway, t.y - 62 + b.y, b.r); c.fill();
    }
    c.fillStyle = 'rgba(255,255,255,0.12)';
    circle(c, t.x - 10 + sway, t.y - 78, 14); c.fill();
  }

  function drawBush(c, b, i, alpha) {
    const sh = BUSH_SHAPES[i];
    c.save();
    c.globalAlpha = alpha;
    c.fillStyle = 'rgba(20,60,20,0.25)';
    ellipse(c, b.x, b.y + b.r * 0.2, b.r * 1.05, b.r * 0.4); c.fill();
    for (const bl of sh.blobs) {
      c.fillStyle = P.bush[bl.c];
      circle(c, b.x + bl.x, b.y + bl.y + b.r * 0.25, bl.r); c.fill();
    }
    c.fillStyle = '#e03131';
    for (const be of sh.berries) { circle(c, b.x + be.x, b.y + be.y + b.r * 0.25, 2.2); c.fill(); }
    c.restore();
  }

  function drawLamp(c, l, night) {
    c.fillStyle = 'rgba(0,0,0,0.2)'; ellipse(c, l.x + 3, l.y + 1, 7, 3); c.fill();
    c.fillStyle = '#495057'; rr(c, l.x - 2.5, l.y - 74, 5, 76, 2); c.fill();
    c.fillStyle = '#343a40'; rr(c, l.x - 9, l.y - 82, 18, 9, 3); c.fill();
    c.fillStyle = night ? '#fff3bf' : '#e9ecef';
    rr(c, l.x - 7, l.y - 74, 14, 4, 2); c.fill();
  }

  /* ================================ Эффекты ================================ */
  function addParticle(p) {
    if (app.particles.length >= VISUAL.MAX_PARTICLES) app.particles.shift();
    app.particles.push(p);
  }

  function burst(x, y, kind, n, colors) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = kind === 'heart' ? 20 + Math.random() * 30 : 60 + Math.random() * 120;
      const ttl = kind === 'heart' ? 1.2 + Math.random() * 0.6 : 0.5 + Math.random() * 0.5;
      addParticle({
        kind, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - (kind === 'heart' ? 40 : 60),
        life: ttl, ttl, size: kind === 'heart' ? 5 + Math.random() * 3 : 2 + Math.random() * 3,
        color: colors[Math.floor(Math.random() * colors.length)], rot: Math.random() * 6
      });
    }
  }

  function dust(x, y) {
    addParticle({ kind: 'dust', x: x + (Math.random() - 0.5) * 10, y: y - 2, vx: (Math.random() - 0.5) * 20, vy: -10 - Math.random() * 10, life: 0.5, ttl: 0.5, size: 4 + Math.random() * 4, color: 'rgba(240,235,220,0.7)', rot: 0 });
  }

  function updateParticles(dt) {
    const ps = app.particles;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.life -= dt;
      if (p.life <= 0) { ps.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.kind === 'heart') { p.vx *= 1 - dt * 1.5; p.vy = p.vy * (1 - dt) - 12 * dt; }
      else if (p.kind === 'dust') { p.size += dt * 10; }
      else { p.vx *= 1 - dt * 3; p.vy = p.vy * (1 - dt * 3) + 240 * dt; }
      p.rot += dt * 3;
    }
    for (let i = app.rings.length - 1; i >= 0; i--) {
      app.rings[i].life -= dt;
      if (app.rings[i].life <= 0) app.rings.splice(i, 1);
    }
    for (let i = app.bubbles.length - 1; i >= 0; i--) {
      app.bubbles[i].life -= dt;
      if (app.bubbles[i].life <= 0) app.bubbles.splice(i, 1);
    }
  }

  function heartPath(c, x, y, s) {
    c.beginPath();
    c.moveTo(x, y + s * 0.35);
    c.bezierCurveTo(x - s, y - s * 0.4, x - s * 0.45, y - s * 1.1, x, y - s * 0.45);
    c.bezierCurveTo(x + s * 0.45, y - s * 1.1, x + s, y - s * 0.4, x, y + s * 0.35);
    c.closePath();
  }

  function drawParticles(c) {
    for (const p of app.particles) {
      const a = Math.max(0, p.life / p.ttl);
      c.globalAlpha = Math.min(1, a * 1.5);
      c.fillStyle = p.color;
      if (p.kind === 'heart') { heartPath(c, p.x, p.y, p.size); c.fill(); }
      else if (p.kind === 'dust') { circle(c, p.x, p.y, p.size); c.fill(); }
      else if (p.kind === 'star') {
        c.save(); c.translate(p.x, p.y); c.rotate(p.rot);
        c.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        c.restore();
      } else { c.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size); }
    }
    c.globalAlpha = 1;
  }

  function say(owner, text, ttl = 1.6) {
    app.bubbles = app.bubbles.filter((b) => b.owner !== owner);
    app.bubbles.push({ owner, text, life: ttl, ttl });
  }

  function drawBubbles(c) {
    c.font = '600 15px ui-rounded, system-ui, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (const b of app.bubbles) {
      const o = b.owner;
      const look = o === app.walk?.louis || o === app.demo?.louis ? LOOKS.louis : (LOOKS[o.name] || LOOKS.louis);
      const x = o.x, y = o.y - 52 * look.scale - 14;
      const a = Math.min(1, b.life / 0.25, (b.ttl - b.life) / 0.12 + 0.2);
      const w = c.measureText(b.text).width + 18;
      c.globalAlpha = a;
      c.fillStyle = 'rgba(0,0,0,0.15)'; rr(c, x - w / 2 + 2, y - 13 + 3, w, 26, 13); c.fill();
      c.fillStyle = '#fff'; rr(c, x - w / 2, y - 13, w, 26, 13); c.fill();
      c.beginPath(); c.moveTo(x - 5, y + 12); c.lineTo(x, y + 20); c.lineTo(x + 5, y + 12); c.closePath(); c.fill();
      c.fillStyle = '#2a2118';
      c.fillText(b.text, x, y + 1);
    }
    c.globalAlpha = 1;
  }

  /* ================================ Подсказки ================================ */
  let toastTimer = 0;
  function toast(text, kind = '', dur = 2.2) {
    ui.toast.textContent = text;
    ui.toast.className = 'toast show' + (kind ? ' ' + kind : '');
    toastTimer = dur;
  }
  function updateToast(dt) {
    if (toastTimer > 0) {
      toastTimer -= dt;
      if (toastTimer <= 0) ui.toast.classList.remove('show');
    }
  }

  const TUTORIAL = [
    'Веди пальцем по экрану - Луи пойдёт за ним',
    'Тяни дальше от точки касания - Луи побежит',
    'Жми «Нюх» - Луи учует спрятанные вкусняшки',
    'Маленькие собачки - друзья. Постой рядом с ними',
    'Большие собаки пугают. Беги к подъезду!'
  ];

  /* ================================ Камера и размеры ================================ */
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, VISUAL.DPR_MAX);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    overlay.width = Math.ceil(W * VISUAL.NIGHT_RES);
    overlay.height = Math.ceil(H * VISUAL.NIGHT_RES);
    scale = Math.min(W / CFG.VIEW_WIDTH, H / 620);
    viewW = W / scale;
    viewH = H / scale;
    paintBackground();
  }

  function cameraTarget(focus) {
    let x = focus.x - viewW / 2;
    let y = focus.y - viewH * 0.55;
    x = viewW >= WORLD.width ? (WORLD.width - viewW) / 2 : G.clamp(x, 0, WORLD.width - viewW);
    y = viewH >= VISUAL.VIS_HEIGHT ? (VISUAL.VIS_HEIGHT - viewH) / 2 : G.clamp(y, 0, VISUAL.VIS_HEIGHT - viewH);
    return { x, y };
  }

  function updateCamera(dt, focus, snap) {
    const t = cameraTarget(focus);
    const k = snap ? 1 : 1 - Math.exp(-dt * VISUAL.CAMERA_LERP);
    app.cam.x += (t.x - app.cam.x) * k;
    app.cam.y += (t.y - app.cam.y) * k;
  }

  function toScreen(wx, wy) {
    return { x: (wx - app.cam.x) * scale, y: (wy - app.cam.y) * scale };
  }

  /* ================================ Рендер ================================ */
  function dogExpr(dog, big) {
    if (big) {
      if (dog.state === 'chase') return 'angry';
      if (dog.state === 'alert') return 'alert';
      return 'neutral';
    }
    if (dog.state === 'happy' || dog.friend) return 'happy';
    return dog.state === 'greet' ? 'happy' : 'neutral';
  }

  function render(dt) {
    const s = app.walk || app.demo;
    const night = s && s.level.night;
    const t = app.time;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = P.outside;
    ctx.fillRect(0, 0, W, H);

    // Фон: только видимая часть
    if (bgCanvas) {
      let sx = app.cam.x, sy = app.cam.y, sw = viewW, sh = viewH, dx = 0, dy = 0;
      if (sx < 0) { dx = -sx; sw += sx; sx = 0; }
      if (sy < 0) { dy = -sy; sh += sy; sy = 0; }
      sw = Math.min(sw, WORLD.width - sx);
      sh = Math.min(sh, VISUAL.VIS_HEIGHT - sy);
      if (sw > 0 && sh > 0) {
        ctx.drawImage(bgCanvas, sx * bgScale, sy * bgScale, sw * bgScale, sh * bgScale, dx * scale, dy * scale, sw * scale, sh * scale);
      }
    }

    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, -app.cam.x * dpr * scale, -app.cam.y * dpr * scale);
    if (!s) return;
    const L = s.louis;
    const x0 = app.cam.x - 120, x1 = app.cam.x + viewW + 120, y0 = app.cam.y - 60, y1 = app.cam.y + viewH + 140;
    const visible = (x, y) => x > x0 && x < x1 && y > y0 && y < y1;

    // Зона у подъезда
    if (app.walk && (L.fear > 0.15 || s.timeUp || L.panic > 0)) {
      const pulse = 0.5 + Math.sin(t * 5) * 0.5;
      ctx.strokeStyle = `rgba(255,255,255,${0.35 + pulse * 0.3})`;
      ctx.lineWidth = 3;
      ctx.setLineDash([10, 8]);
      circle(ctx, WORLD.door.x, WORLD.door.y, CFG.SAFE_RADIUS);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Нюх: волна и следы запаха
    for (const r of app.rings) {
      const k = 1 - r.life / r.ttl;
      ctx.strokeStyle = `rgba(255,190,120,${(1 - k) * 0.8})`;
      ctx.lineWidth = 4;
      circle(ctx, r.x, r.y, 20 + k * CFG.SNIFF_REVEAL_RADIUS);
      ctx.stroke();
    }
    if (app.walk && L.sniff > 0) drawScentTrails(ctx, s, t);

    // Прогресс знакомства
    for (const d of s.smallDogs) {
      if (d.state === 'greet' && d.progress > 0) {
        const k = d.progress / CFG.FRIEND_SNIFF_TIME;
        const mx = (d.x + L.x) / 2, my = (d.y + L.y) / 2 - 46;
        ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 5;
        circle(ctx, mx, my, 12); ctx.stroke();
        ctx.strokeStyle = '#ff6b81';
        ctx.beginPath(); ctx.arc(mx, my, 12, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#ff6b81'; heartPath(ctx, mx, my + 2, 6); ctx.fill();
      }
    }

    // Объекты с сортировкой по глубине
    const list = [];
    WORLD.trees.forEach((tr, i) => { if (visible(tr.x, tr.y)) list.push({ y: tr.y, f: () => drawTree(ctx, tr, i, t) }); });
    WORLD.bushes.forEach((b, i) => {
      if (!visible(b.x, b.y)) return;
      const inside = G.dist(L.x, L.y, b.x, b.y) < b.r + 6;
      list.push({ y: b.y + b.r * 0.45, f: () => drawBush(ctx, b, i, inside ? 0.62 : 1) });
    });
    WORLD.lamps.forEach((l) => { if (visible(l.x, l.y)) list.push({ y: l.y, f: () => drawLamp(ctx, l, night) }); });
    for (const it of s.items) {
      if (it.revealed && visible(it.x, it.y)) list.push({ y: it.y, f: () => drawItem(ctx, it, t) });
    }
    for (const d of s.smallDogs) {
      if (!visible(d.x, d.y)) continue;
      list.push({ y: d.y, f: () => drawDog(ctx, d.x, d.y, LOOKS[d.name], { facing: d.facing, phase: d.phase, moving: Math.min(1, d.speed / 60), expr: dogExpr(d, false), sniff: d.state === 'greet' && d.progress > 0, t: t + d.home.x }) });
    }
    for (const d of s.bigDogs) {
      if (!visible(d.x, d.y)) continue;
      list.push({ y: d.y, f: () => {
        drawDog(ctx, d.x, d.y, LOOKS[d.name], { facing: d.facing, phase: d.phase, moving: Math.min(1, d.speed / 70), expr: dogExpr(d, true), sniff: false, t: t + d.home.y });
        if (d.state === 'alert' || d.state === 'chase') drawAlertMark(ctx, d, t);
      } });
    }
    const louisExpr = L.panic > 0 || L.fear > 0.55 ? 'scared' : (L.mood > 70 ? 'happy' : 'neutral');
    list.push({ y: L.y, f: () => drawDog(ctx, L.x, L.y, LOOKS.louis, { facing: L.facing, phase: L.phase, moving: Math.min(1, L.speed / 90), expr: louisExpr, sniff: L.sniff > 0, t }) });
    list.sort((a, b) => a.y - b.y);
    for (const e of list) e.f();

    drawParticles(ctx);
    drawBubbles(ctx);

    // Вечер: темнота с фонарями
    if (night) drawNight(s);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (app.walk) {
      if (L.fear > 0.05) {
        const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
        g.addColorStop(0, 'rgba(200,0,0,0)');
        g.addColorStop(1, `rgba(200,20,20,${L.fear * 0.45})`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }
      const chasing = s.bigDogs.some((d) => d.state === 'chase' || d.state === 'alert');
      if (s.timeUp || L.panic > 0 || chasing) drawDoorArrow(t);
      drawJoystick();
    }
  }

  function drawAlertMark(c, d, t) {
    const look = LOOKS[d.name];
    const x = d.x, y = d.y - 56 * look.scale - 10 + Math.sin(t * 12) * 2;
    c.fillStyle = '#e03131';
    circle(c, x, y, 11); c.fill();
    c.fillStyle = '#fff';
    c.font = 'bold 16px system-ui, sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('!', x, y + 1);
  }

  function drawScentTrails(c, s, t) {
    const L = s.louis;
    const k = Math.min(1, L.sniff / 0.6);
    const near = G.nearestItems(s, CFG.SNIFF_TRAILS).filter((n) => n.d < 900);
    near.forEach((n, idx) => {
      const it = n.item;
      const dx = it.x - L.x, dy = it.y - L.y;
      const len = Math.min(n.d, 240);
      const ux = dx / n.d, uy = dy / n.d;
      const color = it.group === 'treat' ? '255,159,67' : '77,171,247';
      for (let d = 18; d < len; d += 13) {
        const wave = Math.sin(d * 0.06 - t * 6 + idx) * 7;
        const px = L.x + ux * d - uy * wave;
        const py = L.y - 10 + uy * d + ux * wave;
        const a = k * (1 - d / (len + 30)) * 0.9;
        c.fillStyle = `rgba(${color},${a})`;
        circle(c, px, py, 3.2 - d / len * 1.5); c.fill();
      }
    });
  }

  function drawNight(s) {
    const L = s.louis;
    const o = octx;
    o.setTransform(1, 0, 0, 1, 0, 0);
    o.globalCompositeOperation = 'source-over';
    o.clearRect(0, 0, overlay.width, overlay.height);
    o.fillStyle = 'rgba(14,20,52,0.8)';
    o.fillRect(0, 0, overlay.width, overlay.height);
    o.globalCompositeOperation = 'destination-out';
    const k = scale * VISUAL.NIGHT_RES;
    const light = (wx, wy, r, strength = 1) => {
      const sx = (wx - app.cam.x) * k, sy = (wy - app.cam.y) * k, R = r * k;
      if (sx < -R || sy < -R || sx > overlay.width + R || sy > overlay.height + R) return;
      const g = o.createRadialGradient(sx, sy, 0, sx, sy, R);
      g.addColorStop(0, `rgba(0,0,0,${strength})`);
      g.addColorStop(0.5, `rgba(0,0,0,${strength * 0.75})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      o.fillStyle = g;
      o.fillRect(sx - R, sy - R, R * 2, R * 2);
    };
    for (const l of WORLD.lamps) light(l.x, l.y - 20, 165);
    light(WORLD.door.x, WORLD.door.y - 30, 160);
    for (const w of WINDOWS) if (w.lit) light(w.x + w.w / 2, w.y + w.h / 2, 46, 0.9);
    light(L.x, L.y - 15, 120, 0.85);
    for (const it of s.items) if (it.revealed) light(it.x, it.y, 26, 0.5);
    // Тёплый свет фонарей в том же слое
    o.globalCompositeOperation = 'source-over';
    for (const l of WORLD.lamps) {
      const sx = (l.x - app.cam.x) * k, sy = (l.y - 30 - app.cam.y) * k, R = 120 * k;
      if (sx < -R || sy < -R || sx > overlay.width + R || sy > overlay.height + R) continue;
      const g = o.createRadialGradient(sx, sy, 0, sx, sy, R);
      g.addColorStop(0, 'rgba(255,190,110,0.2)');
      g.addColorStop(1, 'rgba(255,190,110,0)');
      o.fillStyle = g;
      o.fillRect(sx - R, sy - R, R * 2, R * 2);
    }
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(overlay, 0, 0, overlay.width, overlay.height, 0, 0, overlay.width / VISUAL.NIGHT_RES, overlay.height / VISUAL.NIGHT_RES);
    ctx.restore();
  }

  function drawDoorArrow(t) {
    const p = toScreen(WORLD.door.x, WORLD.door.y);
    const m = 46;
    const top = 200; // ниже HUD и подсказок
    if (p.x > m && p.x < W - m && p.y > top && p.y < H - m) return;
    const cx = W / 2, cy = H / 2;
    let dx = p.x - cx, dy = p.y - cy;
    const kx = (W / 2 - m) / Math.abs(dx || 1e-6);
    const ky = dy < 0 ? (cy - top) / Math.abs(dy || 1e-6) : (H / 2 - m) / Math.abs(dy || 1e-6);
    const k = Math.min(kx, ky);
    const ax = cx + dx * k, ay = cy + dy * k;
    const ang = Math.atan2(dy, dx);
    const pulse = 1 + Math.sin(t * 8) * 0.08;
    ctx.save();
    ctx.translate(ax, ay);
    ctx.scale(pulse, pulse);
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    circle(ctx, 0, 0, 24); ctx.fill();
    ctx.fillStyle = '#7a4e33'; ctx.fillRect(-7, -10, 14, 18);
    ctx.fillStyle = '#ffd43b'; circle(ctx, 4, 0, 1.6); ctx.fill();
    ctx.rotate(ang);
    ctx.fillStyle = '#f08a24';
    ctx.beginPath(); ctx.moveTo(34, 0); ctx.lineTo(24, -9); ctx.lineTo(24, 9); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  /* ================================ Ввод ================================ */
  const joy = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
  const keys = new Set();

  function readInput() {
    let x = 0, y = 0, mag = 0, sprint = false;
    if (joy.id !== null) {
      x = joy.x - joy.ox; y = joy.y - joy.oy;
      mag = Math.min(1, Math.hypot(x, y) / VISUAL.JOY_RADIUS);
    }
    let kx = 0, ky = 0;
    if (keys.has('left')) kx -= 1;
    if (keys.has('right')) kx += 1;
    if (keys.has('up')) ky -= 1;
    if (keys.has('down')) ky += 1;
    if (kx || ky) {
      x = kx; y = ky;
      sprint = keys.has('sprint');
      mag = sprint ? 1 : 0.8;
    }
    return { x, y, mag, sprint };
  }

  function drawJoystick() {
    if (joy.id === null) return;
    const R = VISUAL.JOY_RADIUS;
    const dx = joy.x - joy.ox, dy = joy.y - joy.oy;
    const sprint = Math.hypot(dx, dy) / R >= CFG.SPRINT_DEFLECTION && app.walk && app.walk.louis.stamina > 0.05;
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    circle(ctx, joy.ox, joy.oy, R); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = sprint ? 'rgba(255,146,43,0.9)' : 'rgba(255,255,255,0.85)';
    circle(ctx, joy.x, joy.y, 24); ctx.fill();
  }

  canvas.addEventListener('pointerdown', (e) => {
    ensureAudio();
    if (app.mode !== 'playing' || joy.id !== null) return;
    joy.id = e.pointerId;
    joy.ox = joy.x = e.clientX;
    joy.oy = joy.y = e.clientY;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerId !== joy.id) return;
    joy.x = e.clientX; joy.y = e.clientY;
    const dx = joy.x - joy.ox, dy = joy.y - joy.oy, len = Math.hypot(dx, dy), R = VISUAL.JOY_RADIUS;
    if (len > R) { // плавающий джойстик: центр тянется за пальцем
      joy.ox = joy.x - dx / len * R;
      joy.oy = joy.y - dy / len * R;
    }
  });
  const releaseJoy = (e) => { if (e.pointerId === joy.id) joy.id = null; };
  canvas.addEventListener('pointerup', releaseJoy);
  canvas.addEventListener('pointercancel', releaseJoy);

  function doSniff() {
    if (app.mode !== 'playing' || !app.walk) return;
    if (G.trySniff(app.walk)) {
      const L = app.walk.louis;
      app.rings.push({ x: L.x, y: L.y, life: 0.9, ttl: 0.9 });
      say(L, 'Нюх-нюх...', 1.2);
      sfx.sniff();
    }
  }
  ui.sniff.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); ensureAudio(); doSniff(); });

  const KEYMAP = {
    ArrowLeft: 'left', a: 'left', A: 'left', 'ф': 'left', 'Ф': 'left',
    ArrowRight: 'right', d: 'right', D: 'right', 'в': 'right', 'В': 'right',
    ArrowUp: 'up', w: 'up', W: 'up', 'ц': 'up', 'Ц': 'up',
    ArrowDown: 'down', s: 'down', S: 'down', 'ы': 'down', 'Ы': 'down',
    Shift: 'sprint'
  };
  window.addEventListener('keydown', (e) => {
    const k = KEYMAP[e.key];
    if (k) { keys.add(k); e.preventDefault(); ensureAudio(); return; }
    if (e.key === ' ' || e.key === 'e' || e.key === 'E' || e.key === 'у') { e.preventDefault(); ensureAudio(); doSniff(); }
    else if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') { if (app.mode === 'playing') pauseGame(); else if (app.mode === 'paused') resumeGame(); }
    else if (e.key === 'm' || e.key === 'M') setMuted(!audio.muted);
  });
  window.addEventListener('keyup', (e) => { const k = KEYMAP[e.key]; if (k) keys.delete(k); });
  window.addEventListener('blur', () => { keys.clear(); joy.id = null; pauseGame(); });

  /* ================================ Поток игры ================================ */
  function show(el, on) { el.classList.toggle('hidden', !on); }

  function renderMenu() {
    const p = app.progress;
    ui.levels.innerHTML = '';
    const icons = ['🌅', '☀️', '🌙'];
    LEVELS.forEach((lv, i) => {
      const unlocked = G.isUnlocked(p, i);
      const rec = p.levels[lv.id] || { best: 0, stars: 0 };
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'level' + (unlocked ? '' : ' locked');
      b.innerHTML = `<span class="ico">${unlocked ? icons[i] : '🔒'}</span>
        <span class="info"><span class="name">${lv.name}</span><br><span class="note">${lv.note}</span></span>
        <span class="meta"><span class="stars">${'★'.repeat(rec.stars)}${'☆'.repeat(3 - rec.stars)}</span><br><span class="best">${rec.best ? 'рекорд ' + rec.best : Math.round(lv.duration / 60 * 10) / 10 + ' мин'}</span></span>`;
      if (unlocked) b.addEventListener('click', () => { ensureAudio(); sfx.click(); startWalk(i); });
      ui.levels.appendChild(b);
    });
    ui.album.innerHTML = '';
    G.allFriendNames().forEach((name) => {
      const known = p.friends.indexOf(name) >= 0;
      const ch = document.createElement('span');
      ch.className = 'chip' + (known ? '' : ' unknown');
      ch.textContent = known ? '🐾 ' + name : '???';
      ui.album.appendChild(ch);
    });
    const t = p.totals;
    ui.totals.textContent = t.walks
      ? `Прогулок: ${t.walks}. Найдено вкусняшек: ${t.treats}, игрушек: ${t.toys}.`
      : 'Первая прогулка ждёт!';
  }

  function makeDemo() {
    app.demo = G.createWalk(0);
    app.demo.bigDogs.forEach((d) => { d.cooldown = 1e9; });
  }

  function showMenu() {
    app.mode = 'menu';
    app.walk = null;
    makeDemo();
    app.particles.length = 0;
    app.bubbles.length = 0;
    joy.id = null;
    show(ui.hud, false); show(ui.sniff, false);
    show(ui.pauseScreen, false); show(ui.result, false);
    renderMenu();
    show(ui.menu, true);
  }

  function startWalk(i) {
    app.levelIndex = i;
    app.walk = G.createWalk(i);
    app.demo = null;
    app.mode = 'playing';
    app.particles.length = 0;
    app.bubbles.length = 0;
    app.rings.length = 0;
    app.heartbeat = 0;
    app.lowMoodHint = false;
    app.tutorialStep = 0;
    app.tutorialTimer = 0.6;
    joy.id = null;
    show(ui.menu, false); show(ui.result, false); show(ui.pauseScreen, false);
    show(ui.hud, true); show(ui.sniff, true);
    updateCamera(0, app.walk.louis, true);
    say(app.walk.louis, 'Гулять!', 1.8);
    sfx.bark(false);
    toast(`${LEVELS[i].name}: ${LEVELS[i].note}`, '', 2.6);
  }

  function pauseGame() {
    if (app.mode !== 'playing') return;
    app.mode = 'paused';
    joy.id = null;
    show(ui.pauseScreen, true);
  }

  function resumeGame() {
    if (app.mode !== 'paused') return;
    app.mode = 'playing';
    show(ui.pauseScreen, false);
    ensureAudio();
  }

  function endWalk(result) {
    app.mode = 'ending';
    app.endTimer = result.reason === 'home' ? 1.3 : 1.6;
    app.lastResult = result;
    joy.id = null;
    show(ui.sniff, false);
    const L = app.walk.louis;
    if (result.reason === 'home') {
      say(L, 'Я дома!', 2);
      burst(L.x, L.y - 30, 'heart', 10, ['#ff6b81', '#ff8fa3']);
      sfx.win();
    } else if (result.reason === 'sad') {
      say(L, 'Хочу домой...', 2);
      sfx.sad();
    }
    if (result.reason !== 'quit') {
      const r = G.recordWalk(app.progress, LEVELS[app.levelIndex].id, result);
      app.progress = r.progress;
      result.isBest = r.isBest;
      result.newFriends = r.newFriends;
      G.saveProgress(safeStorage, app.progress);
      if (app.tutorial) { app.tutorial = false; safeStorage.setItem(STORAGE_TUTORIAL, '1'); }
    }
  }

  function showResult() {
    const r = app.lastResult;
    app.mode = 'result';
    show(ui.hud, false);
    ui.resultTitle.textContent = r.reason === 'home' ? 'Луи дома!' : r.reason === 'sad' ? 'Луи загрустил' : 'Прогулка прервана';
    ui.resultStars.innerHTML = [0, 1, 2].map((i) => `<span class="${i < r.stars ? '' : 'off'}">★</span>`).join('');
    ui.resultScore.textContent = String(r.score);
    show(ui.resultBest, !!r.isBest && r.score > 0);
    const rows = [
      ['Вкусняшки', r.treats],
      ['Игрушки', r.toys],
      ['Друзья', r.friends.length ? r.friends.join(', ') : 'нет'],
      ['Испугался', r.scares ? r.scares + ' раз' : 'ни разу'],
      ['Настроение', '+' + r.moodBonus],
      ['Вернулся домой', r.homeBonus ? '+' + r.homeBonus : 'нет']
    ];
    if (r.newFriends && r.newFriends.length) rows.splice(3, 0, ['Новые в альбоме', r.newFriends.join(', ')]);
    ui.resultRows.innerHTML = rows.map(([a, b]) => `<li><span>${a}</span><span>${b}</span></li>`).join('');
    const nextIdx = app.levelIndex + 1;
    const hasNext = nextIdx < LEVELS.length && G.isUnlocked(app.progress, nextIdx);
    show(ui.next, hasNext);
    show(ui.result, true);
  }

  ui.pause.addEventListener('click', (e) => { e.stopPropagation(); ensureAudio(); pauseGame(); });
  ui.resume.addEventListener('click', () => { sfx.click(); resumeGame(); });
  ui.quit.addEventListener('click', () => {
    sfx.click();
    show(ui.pauseScreen, false);
    if (app.walk) { app.walk.over = true; endWalk(G.finishWalk(app.walk, 'quit')); app.endTimer = 0.01; }
  });
  ui.again.addEventListener('click', () => { ensureAudio(); sfx.click(); startWalk(app.levelIndex); });
  ui.next.addEventListener('click', () => { ensureAudio(); sfx.click(); startWalk(app.levelIndex + 1); });
  ui.toMenu.addEventListener('click', () => { sfx.click(); showMenu(); });
  ui.mute.addEventListener('click', (e) => { e.stopPropagation(); ensureAudio(); setMuted(!audio.muted); });

  /* ============================== Обработка событий ============================== */
  function handleEvents(events) {
    const s = app.walk, L = s.louis;
    for (const ev of events) {
      switch (ev.type) {
        case 'pickup': {
          const def = CFG.ITEMS[ev.kind];
          if (ev.group === 'treat') {
            burst(ev.x, ev.y - 6, 'crumb', 10, ['#d99a5b', '#f8f1e5', '#c8553d']);
            sfx.chomp();
            say(L, 'Ням!', 1.1);
          } else {
            burst(ev.x, ev.y - 6, 'star', 12, ['#ffd43b', '#74c0fc', '#ffffff']);
            sfx.squeak();
            say(L, 'Моё!', 1.1);
          }
          toast(`Нашёл ${def.name}! +${ev.score}`, 'good', 1.4);
          break;
        }
        case 'friend': {
          const d = s.smallDogs.find((x) => x.name === ev.name);
          burst(ev.x, ev.y - 30, 'heart', 12, ['#ff6b81', '#ff8fa3', '#ffc9d4']);
          sfx.friend();
          sfx.bark(false, 0.35);
          say(L, 'Привет!', 1.4);
          if (d) say(d, 'Гав!', 1.2);
          toast(`Новый друг: ${ev.name}! +${CFG.FRIEND_SCORE}`, 'good', 2);
          break;
        }
        case 'notice': {
          const d = s.bigDogs.find((x) => x.name === ev.name);
          sfx.growl();
          sfx.bark(true, 0.25);
          say(L, 'Ой...', 1.2);
          if (d) say(d, 'Р-р-р!', 1);
          vibrate(30);
          toast(`${ev.name} заметил Луи! Беги!`, 'danger', 1.8);
          break;
        }
        case 'chase':
          sfx.bark(true);
          toast(`${ev.name} гонится! К подъезду!`, 'danger', 1.8);
          break;
        case 'giveup':
          if (!G.inSafeZone(L.x, L.y)) toast(`Фух, ${ev.name} отстал`, '', 1.5);
          else toast('Здесь Луи в безопасности', 'good', 1.5);
          break;
        case 'catch':
          sfx.bark(true);
          sfx.whine();
          vibrate([60, 40, 110]);
          burst(L.x, L.y - 20, 'crumb', 14, ['#ffffff', '#adb5bd']);
          say(L, 'Ай-ай!', 1.4);
          toast('Луи испугался и бежит к подъезду', 'danger', 2.2);
          break;
        case 'timeup':
          say(L, 'Домой?', 1.6);
          toast('Прогулка заканчивается. Веди Луи к подъезду!', '', 3);
          break;
        case 'end':
          endWalk(s.result);
          break;
        default: break;
      }
    }
  }

  /* ================================ Цикл ================================ */
  function updateHud() {
    const s = app.walk;
    if (!s) return;
    const L = s.louis;
    const mood = Math.round(L.mood);
    ui.moodFill.style.width = mood + '%';
    ui.moodFill.classList.toggle('low', mood < 25);
    ui.moodFace.textContent = L.panic > 0 || L.fear > 0.55 ? '😨' : mood > 75 ? '😄' : mood > 50 ? '🙂' : mood > 25 ? '😐' : '😢';
    if (s.timeUp) {
      ui.timer.textContent = 'Домой!';
    } else {
      const sec = Math.ceil(s.time);
      ui.timer.textContent = Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
    }
    ui.timer.classList.toggle('urgent', s.timeUp || s.time < 15);
    ui.score.textContent = String(s.stats.score);
    ui.stamina.style.width = Math.round(L.stamina * 100) + '%';
    ui.stamina.classList.toggle('tired', L.stamina < CFG.STAMINA_MIN_TO_SPRINT);
    const cdTotal = CFG.SNIFF_DURATION + CFG.SNIFF_COOLDOWN;
    ui.sniff.style.setProperty('--cd', L.sniff > 0 ? 0 : (L.sniffCd / cdTotal).toFixed(3));
    ui.sniff.classList.toggle('cooldown', L.sniffCd > 0 && L.sniff <= 0);
    ui.sniff.classList.toggle('active', L.sniff > 0);
  }

  function update(dt) {
    app.time += dt;
    updateToast(dt);
    if (app.mode === 'playing') {
      const s = app.walk;
      const events = G.stepWalk(s, readInput(), dt);
      handleEvents(events);
      const L = s.louis;
      if ((L.sprinting || L.panic > 0) && L.speed > 100 && Math.random() < dt * 18) dust(L.x, L.y);

      // Сердцебиение во время погони
      if (s.bigDogs.some((d) => d.state === 'chase')) {
        app.heartbeat -= dt;
        if (app.heartbeat <= 0) { sfx.heartbeat(); app.heartbeat = 0.55; }
      } else app.heartbeat = 0;

      // Фоновые звуки двора
      app.ambient -= dt;
      if (app.ambient <= 0) { sfx.chirp(s.level.night); app.ambient = 3 + Math.random() * 5; }

      if (!app.lowMoodHint && L.mood < 25 && !s.over) {
        app.lowMoodHint = true;
        toast('Луи скучает. Найди вкусняшку или друга', '', 2.6);
      }

      // Обучение на первой прогулке
      if (app.tutorial && app.tutorialStep < TUTORIAL.length) {
        app.tutorialTimer -= dt;
        if (app.tutorialTimer <= 0 && toastTimer <= 0) {
          toast(TUTORIAL[app.tutorialStep++], '', 3);
          app.tutorialTimer = 3.6;
        }
      }
      updateCamera(dt, L, false);
      updateHud();
    } else if (app.mode === 'ending') {
      app.endTimer -= dt;
      updateCamera(dt, app.walk.louis, false);
      if (app.endTimer <= 0) showResult();
    } else if (app.mode === 'menu' && app.demo) {
      // В меню двор живёт: собаки гуляют, камера медленно плывёт
      const d = app.demo;
      for (const dog of d.smallDogs) G.stepSmallDog(dog, d, dt, Math.random);
      for (const dog of d.bigDogs) G.stepBigDog(dog, d, dt, Math.random);
      const k = app.time * 0.05;
      updateCamera(dt, { x: 500 + Math.sin(k) * 300, y: 700 + Math.sin(k * 0.7) * 450 }, false);
    }
    updateParticles(dt);
  }

  let last = performance.now();
  function frame(now) {
    let dt = (now - last) / 1000;
    last = now;
    if (dt < 0) dt = 0;
    if (dt > VISUAL.MAX_DT) dt = VISUAL.MAX_DT;
    update(dt);
    render(dt);
    requestAnimationFrame(frame);
  }

  /* ============================ Системные события ============================ */
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      pauseGame();
      if (audio.ctx && audio.ctx.state === 'running') audio.ctx.suspend().catch(() => {});
    } else {
      last = performance.now();
      if (audio.ctx && audio.ctx.state === 'suspended' && app.mode !== 'paused') audio.ctx.resume().catch(() => {});
    }
  });
  window.addEventListener('pagehide', pauseGame);
  document.addEventListener('touchmove', (e) => {
    if (!e.target.closest('.screen')) e.preventDefault(); // меню можно листать
  }, { passive: false });
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('dblclick', (e) => e.preventDefault());
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 120));

  // Отладка в браузере: ?debug=1 открывает доступ к состоянию
  if (/[?&]debug=1/.test(location.search)) window.__louis = { app, G, startWalk, showMenu };

  /* ================================ Запуск ================================ */
  setMuted(audio.muted);
  resize();
  showMenu();
  updateCamera(0, { x: 500, y: 600 }, true);
  requestAnimationFrame((t) => { last = t; frame(t); });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch((err) => console.warn('SW registration failed', err));
    });
  }
})();
