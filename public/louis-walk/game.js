/*
 * Выгуляй Луи - изометрический рендер двора, ввод, звук, эффекты и экраны.
 * Баланс и симуляция в logic.js, рисунки героев в art.js.
 */
(() => {
  'use strict';

  const G = window.WalkLogic;
  const A = window.WalkArt;
  const CFG = G.CONFIG;
  const WORLD = G.WORLD;
  const ISO = G.ISO;

  /* ============================ Визуальные настройки ============================ */
  const VISUAL = {
    VIEW_WIDTH: 360,      // сколько экранных единиц двора видно по ширине
    DPR_MAX: 2,
    BG_DPR_MAX: 2,
    TILE: 256,            // тайл земли в экранных единицах
    TILE_CACHE: 40,       // сколько тайлов держим в памяти
    TILES_PER_FRAME: 2,   // сколько новых тайлов рисуем за кадр
    OVERVIEW_SCALE: 0.4,  // обзорная картинка района
    MINIMAP_W: 132,
    LEAVES: 14000,        // опавших листьев на земле
    NIGHT_RES: 0.5,
    CAMERA_LERP: 6,
    JOY_RADIUS: 58,
    MAX_PARTICLES: 320,
    MAX_DT: 0.05,
    FLOOR_H: 42,
    WISH_EVERY: 7,
    WISH_SHOW: 2.4,
    MAX_BUBBLES: 3,       // реплик на экране одновременно
    MAX_NPC_BUBBLES: 2,   // из них от прохожих, собак и детей
    TOAST_GAP: 0.35       // пауза между подсказками
  };
  const COLORS = {
    street: '#5d5a55', curb: '#8a857d', lawn: '#7f8f3c', lawnDark: '#6f7f33', lawnLight: '#93a24a',
    tile: '#a49b98', tileDark: '#958c89', tileLight: '#b3aaa6', sidewalk: '#8f8c88',
    rubber: '#3f7d6e', sand: '#e9d39a', wallA: '#e6d3bf', wallB: '#d2bea9', wallShade: '#c9b39d',
    roof: '#7b8487', roofEdge: '#5f676a', window: '#9fc4dc', windowFrame: '#f4efe8', windowLit: '#ffd27f',
    door: '#6b4630', homeDoor: '#7a3e1d', canopy: '#7d8a96', fence: '#2f4f3a',
    road: '#55524e', asphalt: '#6a6763', dirt: '#b08a5a', court: '#c0563b', gravel: '#cdbb96',
    water: '#4b93b3', waterDeep: '#356f86', shore: '#b7a98d'
  };
  const STORAGE_MUTE = 'louis-walk-muted';
  const STORAGE_TUTORIAL = 'louis-walk-tutorial';

  /* ================================== DOM ================================== */
  const $ = (id) => document.getElementById(id);
  const canvas = $('game');
  const ctx = canvas.getContext('2d', { alpha: false });
  const ui = {
    hud: $('hud'), timer: $('timer'), pause: $('btn-pause'), mute: $('btn-mute'),
    meters: { pee: $('m-pee'), poop: $('m-poop'), energy: $('m-energy'), happy: $('m-happy') },
    sniff: $('btn-sniff'), fu: $('btn-fu'), toast: $('toast'),
    menu: $('screen-menu'), start: $('btn-start'), stats: $('stats'), album: $('album'),
    pauseScreen: $('screen-pause'), resume: $('btn-resume'), quit: $('btn-quit'),
    result: $('screen-result'), resultTitle: $('result-title'), resultStars: $('result-stars'), resultScore: $('result-score'),
    resultBest: $('result-best'), resultRows: $('result-rows'), homeCanvas: $('home-canvas'), again: $('btn-again'), toMenu: $('btn-menu')
  };
  const safeStorage = {
    getItem(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } },
    setItem(k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* ignore */ } }
  };

  /* ================================ Состояние ================================ */
  let W = 0, H = 0, dpr = 1, scale = 1, viewW = 360, viewH = 700;
  const safe = { left: 0, bottom: 0 };
  const overlay = document.createElement('canvas');
  const octx = overlay.getContext('2d');

  const app = {
    mode: 'menu', walk: null, demo: null, progress: G.loadProgress(safeStorage),
    cam: { x: -180, y: 80 }, time: 0, particles: [], bubbles: [], rings: [],
    wishT: 3, wishShow: 0, wish: null, heartbeat: 0, ambient: 3, leafT: 0,
    tutorial: safeStorage.getItem(STORAGE_TUTORIAL) !== '1', tutorialStep: 0, tutorialTimer: 0,
    lastResult: null, endTimer: 0, homeT: 0, fuFlash: 0, toastTimer: 0, toastPrio: 0, toastNext: null, toastGap: 0
  };

  /* ================================== Звук ================================== */
  const audio = { ctx: null, master: null, noise: null, muted: safeStorage.getItem(STORAGE_MUTE) === '1' };
  function ensureAudio() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!audio.ctx) {
      audio.ctx = new AC();
      audio.master = audio.ctx.createGain();
      audio.master.gain.value = audio.muted ? 0 : 0.9;
      audio.master.connect(audio.ctx.destination);
      const len = Math.floor(audio.ctx.sampleRate * 1.2);
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
    if (filter) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filter; o.connect(f); node = f; }
    node.connect(g).connect(audio.master);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }
  function noise({ dur = 0.1, gain = 0.1, delay = 0, type = 'bandpass', freq = 1000, q = 1 }) {
    if (!audio.ctx || audio.muted) return;
    const c = audio.ctx, t0 = c.currentTime + delay;
    const src = c.createBufferSource(); src.buffer = audio.noise;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(audio.master);
    src.start(t0, Math.random() * 0.5); src.stop(t0 + dur + 0.05);
  }
  const sfx = {
    bark(big, delay = 0) {
      const f = big ? 230 : 680;
      for (let i = 0; i < 2; i++) {
        const d = delay + i * (big ? 0.2 : 0.13);
        tone({ type: 'sawtooth', freq: f, to: f * 0.62, dur: big ? 0.16 : 0.07, gain: big ? 0.18 : 0.08, delay: d, filter: big ? 900 : 2400 });
        noise({ dur: big ? 0.12 : 0.05, gain: big ? 0.11 : 0.05, delay: d, freq: big ? 500 : 1500, q: 2 });
      }
    },
    yap() { for (let i = 0; i < 3; i++) tone({ type: 'square', freq: 1100, to: 800, dur: 0.05, gain: 0.05, delay: i * 0.09, filter: 3000 }); },
    growl() {
      if (!audio.ctx || audio.muted) return;
      const c = audio.ctx, t0 = c.currentTime;
      const o = c.createOscillator(), lfo = c.createOscillator(), lg = c.createGain(), g = c.createGain(), f = c.createBiquadFilter();
      o.type = 'sawtooth'; o.frequency.value = 85; lfo.frequency.value = 22; lg.gain.value = 0.08;
      f.type = 'lowpass'; f.frequency.value = 420;
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.11, t0 + 0.06); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.7);
      lfo.connect(lg).connect(g.gain); o.connect(f).connect(g).connect(audio.master);
      o.start(t0); lfo.start(t0); o.stop(t0 + 0.75); lfo.stop(t0 + 0.75);
    },
    chomp() { noise({ dur: 0.05, gain: 0.16, freq: 900, q: 1.5 }); noise({ dur: 0.05, gain: 0.13, delay: 0.11, freq: 800, q: 1.5 }); tone({ freq: 660, to: 990, dur: 0.12, gain: 0.06, delay: 0.2 }); },
    squeak() { tone({ freq: 900, to: 1800, dur: 0.09, gain: 0.09 }); tone({ freq: 1700, to: 1100, dur: 0.12, gain: 0.07, delay: 0.09 }); },
    sniff() { for (let i = 0; i < 3; i++) noise({ dur: 0.05, gain: 0.11, delay: i * 0.1, type: 'highpass', freq: 2400 }); },
    friend() { [660, 880, 1100, 1320].forEach((f, i) => tone({ freq: f, dur: 0.14, gain: 0.06, delay: i * 0.08 })); },
    whine() { tone({ type: 'triangle', freq: 1300, to: 650, dur: 0.45, gain: 0.08 }); },
    heartbeat() { tone({ freq: 70, to: 45, dur: 0.12, gain: 0.2 }); tone({ freq: 70, to: 45, dur: 0.12, gain: 0.14, delay: 0.16 }); },
    fu() { tone({ type: 'square', freq: 520, to: 380, dur: 0.16, gain: 0.07, filter: 1800 }); },
    pee() { noise({ dur: 1.2, gain: 0.05, type: 'bandpass', freq: 2600, q: 3 }); },
    leaves() { noise({ dur: 0.35, gain: 0.16, type: 'bandpass', freq: 3200, q: 0.8 }); noise({ dur: 0.25, gain: 0.1, delay: 0.1, type: 'highpass', freq: 4000 }); },
    flutter() { for (let i = 0; i < 6; i++) noise({ dur: 0.04, gain: 0.07, delay: i * 0.05, freq: 1800, q: 2 }); },
    meow() { tone({ type: 'triangle', freq: 700, to: 1100, dur: 0.18, gain: 0.05 }); tone({ type: 'triangle', freq: 1100, to: 600, dur: 0.25, gain: 0.05, delay: 0.17 }); },
    splash() { noise({ dur: 0.25, gain: 0.14, type: 'lowpass', freq: 1200 }); },
    quack() { for (let i = 0; i < 2; i++) tone({ type: 'sawtooth', freq: 520, to: 360, dur: 0.11, gain: 0.05, delay: i * 0.16, filter: 1400 }); },
    ding() { tone({ freq: 1320, dur: 0.18, gain: 0.05 }); tone({ freq: 990, dur: 0.25, gain: 0.04, delay: 0.12 }); },
    hop() { tone({ type: 'triangle', freq: 420, to: 840, dur: 0.12, gain: 0.06 }); },
    kick() { noise({ dur: 0.06, gain: 0.16, type: 'lowpass', freq: 700 }); tone({ freq: 160, to: 90, dur: 0.08, gain: 0.1 }); },
    throw() { noise({ dur: 0.2, gain: 0.06, type: 'bandpass', freq: 600, q: 0.7 }); },
    wind() { noise({ dur: 1.4, gain: 0.08, type: 'bandpass', freq: 500, q: 0.4 }); },
    chirp(night) {
      if (night) for (let i = 0; i < 4; i++) tone({ freq: 4200, dur: 0.03, gain: 0.012, delay: i * 0.06 });
      else { const b = 2400 + Math.random() * 900; for (let i = 0; i < 3; i++) tone({ freq: b, to: b * 1.3, dur: 0.07, gain: 0.016, delay: i * 0.11 }); }
    },
    done() { [523, 659, 784, 1047].forEach((f, i) => tone({ type: 'triangle', freq: f, dur: 0.2, gain: 0.07, delay: i * 0.12 })); },
    sad() { [440, 392, 330, 262].forEach((f, i) => tone({ type: 'triangle', freq: f, dur: 0.28, gain: 0.06, delay: i * 0.2 })); },
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

  /* ============================== Проекция ============================== */
  const P = (x, y, z = 0) => ({ x: (x - y) * ISO.X, y: (x + y) * ISO.Y - z });
  const depth = (x, y) => x + y;

  /* ============================== Фон: земля и дома тайлами ============================== */
  // Район большой, одним холстом его не нарисовать. Земля рисуется тайлами по мере надобности,
  // а пока тайл не готов, на его месте грубая обзорная картинка. Она же основа мини-карты.
  const S = WORLD.size;
  const BOUNDS = { x0: -S * ISO.X - 80, x1: S * ISO.X + 80, y0: -270, y1: 2 * S * ISO.Y + 90 };
  const TILE = VISUAL.TILE;
  const COLS = Math.ceil((BOUNDS.x1 - BOUNDS.x0) / TILE), ROWS = Math.ceil((BOUNDS.y1 - BOUNDS.y0) / TILE);
  const tiles = new Map();
  const tilePool = [];
  let groundKey = '', frameNo = 0;
  let overview = null, ovSc = 1, minimapBase = null;
  let windows = [], litWindows = [];

  function hash2(x, y) {
    let h = Math.imul(x | 0, 374761393) ^ Math.imul((y | 0) + 1013, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  const tileIndex = (sx, sy) => ({ ix: Math.floor((sx - BOUNDS.x0) / TILE), iy: Math.floor((sy - BOUNDS.y0) / TILE) });

  // Пятна на газоне и опавшие листья раскладываются один раз, листья сразу по тайлам
  const GROUND = (() => {
    const rnd = A.mulberry32(77);
    const blobs = [], leaves = new Map();
    for (let i = 0; i < 520; i++) blobs.push({ x: rnd() * S, y: rnd() * S, rx: 30 + rnd() * 90, ry: 20 + rnd() * 70, rot: rnd() * 3, light: rnd() < 0.5 });
    const inBuilding = (x, y) => WORLD.buildings.some((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
    for (let i = 0; i < VISUAL.LEAVES; i++) {
      let x, y;
      if (rnd() < 0.55) {
        const t = WORLD.trees[Math.floor(rnd() * WORLD.trees.length)];
        const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * 120;
        x = t.x + Math.cos(a) * d; y = t.y + Math.sin(a) * d;
      } else { x = rnd() * S; y = rnd() * S; }
      const size = 2.2 + rnd() * 1.8, rot = rnd() * 6, color = A.LEAF_COLORS[Math.floor(rnd() * A.LEAF_COLORS.length)], keep = rnd();
      if (x < 2 || y < 2 || x > S - 2 || y > S - 2 || inBuilding(x, y) || G.inWater(x, y)) continue;
      if (!G.isLawn(x, y) && keep < 0.85) continue;
      const p = P(x, y), ti = tileIndex(p.x, p.y), key = ti.ix * 1024 + ti.iy;
      if (!leaves.has(key)) leaves.set(key, []);
      leaves.get(key).push({ x: p.x, y: p.y, size, rot, color });
    }
    return { blobs, leaves };
  })();

  // Дома и шлагбаумы между ними: перед ними никто не ходит, рисуем их в фон от дальних к ближним
  const BACKDROP = WORLD.buildings.map((b, i) => ({ b, i, height: b.height }))
    .concat(WORLD.solids.filter((q) => q.kind === 'barrier').map((b) => ({ b, i: -1, height: 34 })))
    .sort((a, c) => a.b.x + a.b.y - (c.b.x + c.b.y));
  const PATH_ORDER = ['dirt', 'sidewalk', 'asphalt', 'road', 'tile', 'gravel', 'rubber', 'court'];
  const BUILDING_STYLE = [
    { left: COLORS.wallB, right: COLORS.wallA, plinthL: '#a99582', plinthR: '#b8a48f', roof: COLORS.roof },
    { left: COLORS.wallB, right: COLORS.wallA, plinthL: '#a99582', plinthR: '#b8a48f', roof: COLORS.roof },
    { left: '#b9674c', right: '#c97a5d', plinthL: '#8e4c39', plinthR: '#9c5741', roof: '#6d6463' },
    { left: '#d8c88f', right: '#e8daa4', plinthL: '#b3a273', plinthR: '#c2b07f', roof: '#77807f' }
  ];

  /** Окна всех домов: рамка, стекло и горит ли вечером. */
  function buildWindows(evening) {
    windows = []; litWindows = [];
    const F = VISUAL.FLOOR_H;
    WORLD.buildings.forEach((b, bi) => {
      const x0 = b.x, x1 = b.x + b.w, y0 = b.y, y1 = b.y + b.h;
      const floors = Math.floor((b.height - 56) / F) + 1;
      const front = b.face;
      const skip = (along, f, onFront) => f === 0 && onFront && b.doors.some((d) => Math.abs(d.at - along) < (d.shop ? 110 : 34));
      const addRow = (fixed, a0, a1, isY, onFront) => {
        for (let f = 0; f < floors; f++) {
          for (let a = a0 + 30; a < a1 - 40; a += 52) {
            if (skip(a + 14, f, onFront)) continue;
            const z0 = 22 + f * F, z1 = z0 + 24;
            const pt = isY ? (u, z) => P(u, fixed, z) : (u, z) => P(fixed, u, z);
            const lit = evening && hash2(bi * 977 + f * 31, a) < 0.5;
            const w = { frame: [pt(a - 2, z0 - 2), pt(a + 30, z0 - 2), pt(a + 30, z1 + 2), pt(a - 2, z1 + 2)],
              glass: [pt(a, z0), pt(a + 28, z0), pt(a + 28, z1), pt(a, z1)], lit, bi };
            const xs = w.frame.map((p) => p.x), ys = w.frame.map((p) => p.y);
            w.box = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
            windows.push(w);
            if (lit) litWindows.push({ x: (w.box.x0 + w.box.x1) / 2, y: (w.box.y0 + w.box.y1) / 2 });
          }
        }
      };
      addRow(y1, x0, x1, true, front === 'y');
      addRow(x1, y0, y1, false, front === 'x');
    });
    // Витрина магазина и окно ларька светятся вечером
    const shop = WORLD.buildings[2], sd = shop.doors.find((d) => d.shop);
    if (evening) {
      const p = P(sd.at, shop.y + shop.h, 26); litWindows.push(p, { x: p.x - 40, y: p.y - 20 }, { x: p.x + 40, y: p.y + 20 });
      const k = WORLD.kiosk, kp = P(k.x + k.w / 2, k.y + k.h, 34); litWindows.push(kp);
    }
  }

  function worldBox(r, pad) {
    const pts = [[r.x0, r.y0], [r.x1, r.y0], [r.x0, r.y1], [r.x1, r.y1]].map(([sx, sy]) => ({ x: (sx / ISO.X + sy / ISO.Y) / 2, y: (sy / ISO.Y - sx / ISO.X) / 2 }));
    return { x0: Math.min(...pts.map((p) => p.x)) - pad, x1: Math.max(...pts.map((p) => p.x)) + pad,
      y0: Math.min(...pts.map((p) => p.y)) - pad, y1: Math.max(...pts.map((p) => p.y)) + pad };
  }
  const hitRect = (wb, x, y, w, h) => x < wb.x1 && x + w > wb.x0 && y < wb.y1 && y + h > wb.y0;

  /** Рисует землю и дома в прямоугольнике экрана r. sc - пикселей на единицу, lite - без мелких деталей. */
  function paintGround(c, r, sc, lite) {
    const ox = -r.x0 * sc, oy = -r.y0 * sc;
    const screenT = () => c.setTransform(sc, 0, 0, sc, ox, oy);
    const worldT = () => c.setTransform(ISO.X * sc, ISO.Y * sc, -ISO.X * sc, ISO.Y * sc, ox, oy);
    const wb = worldBox(r, 60);
    screenT();
    c.fillStyle = COLORS.street; c.fillRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0);
    worldT();
    c.fillStyle = COLORS.curb; c.fillRect(-40, -40, S + 110, S + 110);
    c.fillStyle = '#6e6a62'; c.fillRect(-40, -40, S + 80, S + 80);
    c.fillStyle = COLORS.lawn; c.fillRect(0, 0, S, S);
    if (!lite) {
      for (const b of GROUND.blobs) {
        if (b.x + 120 < wb.x0 || b.x - 120 > wb.x1 || b.y + 120 < wb.y0 || b.y - 120 > wb.y1) continue;
        c.fillStyle = b.light ? 'rgba(255,240,180,0.07)' : 'rgba(40,60,10,0.08)';
        c.beginPath(); c.ellipse(b.x, b.y, b.rx, b.ry, b.rot, 0, Math.PI * 2); c.fill();
      }
    }
    for (const kind of PATH_ORDER) for (const p of WORLD.paths) if (p.kind === kind && hitRect(wb, p.x, p.y, p.w, p.h)) paintPath(c, p, wb, lite);
    paintZebras(c, wb);
    paintAreas(c, wb, lite);
    screenT();
    if (!lite) {
      const a = tileIndex(r.x0, r.y0), b = tileIndex(r.x1 - 1, r.y1 - 1);
      for (let ix = a.ix - 1; ix <= b.ix + 1; ix++) for (let iy = a.iy - 1; iy <= b.iy + 1; iy++) {
        const list = GROUND.leaves.get(ix * 1024 + iy);
        if (!list) continue;
        for (const l of list) if (l.x > r.x0 - 6 && l.x < r.x1 + 6 && l.y > r.y0 - 6 && l.y < r.y1 + 6) A.leafShape(c, l.x, l.y, l.size, l.rot, l.color);
      }
    }
    c.fillStyle = 'rgba(30,40,10,0.18)';
    for (const t of WORLD.trees) {
      const p = P(t.x, t.y);
      if (p.x < r.x0 - 60 || p.x > r.x1 + 60 || p.y < r.y0 - 30 || p.y > r.y1 + 30) continue;
      c.beginPath(); c.ellipse(p.x + 8, p.y + 2, 42, 18, 0, 0, Math.PI * 2); c.fill();
    }
    // Дальние первыми: торец дома слева прячется за домом у подъезда
    for (const { b, i, height } of BACKDROP) {
      const top = P(b.x, b.y, height), left = P(b.x, b.y + b.h), right = P(b.x + b.w, b.y), bottom = P(b.x + b.w, b.y + b.h);
      if (left.x > r.x1 || right.x < r.x0 || top.y > r.y1 || bottom.y < r.y0) continue;
      if (i < 0) drawSolid(c, b, false); else paintBuilding(c, b, i, r);
    }
  }

  function paintPath(c, p, wb, lite) {
    const STYLE = {
      sidewalk: { base: COLORS.sidewalk, cells: true }, tile: { base: COLORS.tile, cells: true },
      road: { base: COLORS.road }, asphalt: { base: COLORS.asphalt }, rubber: { base: COLORS.rubber },
      dirt: { base: COLORS.dirt }, court: { base: COLORS.court }, gravel: { base: COLORS.gravel }
    }[p.kind];
    c.fillStyle = STYLE.base;
    c.fillRect(p.x, p.y, p.w, p.h);
    const x0 = Math.max(p.x, wb.x0), x1 = Math.min(p.x + p.w, wb.x1), y0 = Math.max(p.y, wb.y0), y1 = Math.min(p.y + p.h, wb.y1);
    if (lite) return;
    if (STYLE.cells) {
      // Плитка, как на фото двора: кирпичики вразбежку
      const tw = 22, th = 11;
      for (let ty = p.y + Math.floor((y0 - p.y) / th) * th; ty < y1; ty += th) {
        const row = Math.round((ty - p.y) / th), off = row % 2 ? tw / 2 : 0;
        for (let tx = p.x - off + Math.floor((x0 - p.x + off) / tw) * tw; tx < x1; tx += tw) {
          const v = hash2(Math.round(tx * 2), Math.round(ty * 2));
          if (v >= 0.3 && v <= 0.8) continue;
          const cx0 = Math.max(p.x, tx), cx1 = Math.min(p.x + p.w, tx + tw), cy1 = Math.min(p.y + p.h, ty + th);
          c.fillStyle = v < 0.3 ? (p.kind === 'tile' ? COLORS.tileDark : '#84817c') : (p.kind === 'tile' ? COLORS.tileLight : '#9a9792');
          c.fillRect(cx0 + 0.6, ty + 0.6, cx1 - cx0 - 1.2, cy1 - ty - 1.2);
        }
      }
    } else if (p.kind === 'road') {
      // Разметка: прерывистая по оси, у перекрёстка нет
      c.fillStyle = 'rgba(240,236,220,0.75)';
      const along = p.w > p.h;
      const len = along ? p.w : p.h;
      for (let a = 0; a < len; a += 56) {
        const u = (along ? p.x : p.y) + a;
        if (u > 1270 && u < 1430) continue;
        if (along) c.fillRect(u, p.y + p.h / 2 - 1.5, 30, 3); else c.fillRect(p.x + p.w / 2 - 1.5, u, 3, 30);
      }
      c.fillStyle = 'rgba(0,0,0,0.12)';
      if (along) { c.fillRect(p.x, p.y, p.w, 3); c.fillRect(p.x, p.y + p.h - 3, p.w, 3); } else { c.fillRect(p.x, p.y, 3, p.h); c.fillRect(p.x + p.w - 3, p.y, 3, p.h); }
    } else if (p.kind === 'asphalt') {
      c.fillStyle = 'rgba(255,255,255,0.5)';
      for (const g of WORLD.solids) if (g.kind === 'garages') for (let x = g.x; x <= g.x + g.w; x += 80) c.fillRect(x - 1, p.y, 2, 40);
      c.fillStyle = 'rgba(20,20,20,0.18)';
      for (let i = 0; i < 9; i++) { c.beginPath(); c.ellipse(260 + i * 110 + hash2(i, 3) * 40, p.y + 20 + hash2(i, 7) * 40, 9, 6, 0, 0, Math.PI * 2); c.fill(); }
    } else if (p.kind === 'rubber') {
      c.fillStyle = 'rgba(255,255,255,0.08)';
      for (let i = 0; i < 8; i++) c.fillRect(p.x + 20 + i * 42, p.y + 10, 16, p.h - 20);
    } else if (p.kind === 'dirt' || p.kind === 'gravel') {
      // Крошка: детерминированные точки по сетке
      const step = p.kind === 'dirt' ? 14 : 9;
      for (let y = y0 - ((y0 - p.y) % step); y < y1; y += step) for (let x = x0 - ((x0 - p.x) % step); x < x1; x += step) {
        const v = hash2(Math.round(x), Math.round(y));
        if (v < 0.55) continue;
        c.fillStyle = v > 0.8 ? 'rgba(255,255,255,0.18)' : 'rgba(60,40,20,0.16)';
        c.fillRect(x + hash2(Math.round(y), 5) * step, y + hash2(Math.round(x), 9) * step, 2.4, 2.4);
      }
      c.strokeStyle = 'rgba(70,50,30,0.35)'; c.lineWidth = 2; c.strokeRect(p.x, p.y, p.w, p.h);
    } else if (p.kind === 'court') {
      c.fillStyle = '#d0694a'; c.fillRect(p.x + 8, p.y + 8, p.w - 16, p.h - 16);
      c.strokeStyle = 'rgba(255,255,255,0.85)'; c.lineWidth = 3;
      c.strokeRect(p.x + 14, p.y + 14, p.w - 28, p.h - 28);
      c.beginPath(); c.moveTo(p.x + 14, p.y + p.h / 2); c.lineTo(p.x + p.w - 14, p.y + p.h / 2); c.stroke();
      c.beginPath(); c.arc(p.x + p.w / 2, p.y + p.h / 2, 45, 0, Math.PI * 2); c.stroke();
      c.strokeRect(p.x + p.w / 2 - 60, p.y + 14, 120, 70); c.strokeRect(p.x + p.w / 2 - 60, p.y + p.h - 84, 120, 70);
    }
  }

  function paintZebras(c, wb) {
    c.fillStyle = 'rgba(245,245,240,0.85)';
    for (const sw of WORLD.paths) {
      if (sw.kind !== 'sidewalk') continue;
      for (const rd of WORLD.paths) {
        if (rd.kind !== 'road') continue;
        const x0 = Math.max(sw.x, rd.x), x1 = Math.min(sw.x + sw.w, rd.x + rd.w), y0 = Math.max(sw.y, rd.y), y1 = Math.min(sw.y + sw.h, rd.y + rd.h);
        if (x1 <= x0 || y1 <= y0 || !hitRect(wb, x0, y0, x1 - x0, y1 - y0)) continue;
        if (sw.w > sw.h) for (let x = x0 + 4; x < x1 - 4; x += 14) c.fillRect(x, y0 + 2, 7, y1 - y0 - 4);
        else for (let y = y0 + 4; y < y1 - 4; y += 14) c.fillRect(x0 + 2, y, x1 - x0 - 4, 7);
      }
    }
  }

  /** Пруд, песочница, клумбы у подъезда, следы лап на собачьей площадке. Рисуется в осях земли. */
  function paintAreas(c, wb, lite) {
    for (const pd of WORLD.ponds) {
      if (!hitRect(wb, pd.x - pd.rx - pd.ring, pd.y - pd.ry - pd.ring, (pd.rx + pd.ring) * 2, (pd.ry + pd.ring) * 2)) continue;
      c.fillStyle = COLORS.shore; c.beginPath(); c.ellipse(pd.x, pd.y, pd.rx + pd.ring, pd.ry + pd.ring, 0, 0, Math.PI * 2); c.fill();
      if (!lite) {
        for (let i = 0; i < 90; i++) {
          const a = (i / 90) * Math.PI * 2, k = 1.02 + hash2(i, 11) * 0.12;
          c.fillStyle = hash2(i, 13) < 0.5 ? '#9c9078' : '#cfc3aa';
          c.beginPath(); c.ellipse(pd.x + Math.cos(a) * pd.rx * k, pd.y + Math.sin(a) * pd.ry * k, 5 + hash2(i, 17) * 4, 4, a, 0, Math.PI * 2); c.fill();
        }
      }
      c.fillStyle = COLORS.waterDeep; c.beginPath(); c.ellipse(pd.x, pd.y, pd.rx, pd.ry, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = COLORS.water; c.beginPath(); c.ellipse(pd.x - 8, pd.y - 8, pd.rx - 16, pd.ry - 14, 0, 0, Math.PI * 2); c.fill();
      if (!lite) {
        c.fillStyle = 'rgba(255,255,255,0.12)'; c.beginPath(); c.ellipse(pd.x - 40, pd.y - 50, pd.rx * 0.45, pd.ry * 0.25, 0, 0, Math.PI * 2); c.fill();
        // Кувшинки
        for (let i = 0; i < 9; i++) {
          const a = hash2(i, 21) * Math.PI * 2, d = 0.55 + hash2(i, 23) * 0.35;
          const x = pd.x + Math.cos(a) * pd.rx * d, y = pd.y + Math.sin(a) * pd.ry * d;
          c.fillStyle = i % 3 ? '#4f8a3a' : '#5f9c45';
          c.beginPath(); c.moveTo(x, y); c.arc(x, y, 9, a + 0.4, a + Math.PI * 2 - 0.2); c.closePath(); c.fill();
          if (i % 4 === 0) { c.fillStyle = '#f8c8dc'; c.beginPath(); c.arc(x + 2, y - 2, 3, 0, Math.PI * 2); c.fill(); }
        }
      }
    }
    const pg = WORLD.playground;
    if (hitRect(wb, pg.x - 10, pg.y - 10, pg.w + 20, pg.h + 20)) {
      c.strokeStyle = '#d9d2c5'; c.lineWidth = 6; c.strokeRect(pg.x - 3, pg.y - 3, pg.w + 6, pg.h + 6);
      const sb = WORLD.sandbox;
      c.fillStyle = '#a0683a'; c.fillRect(sb.x - 5, sb.y - 5, sb.w + 10, sb.h + 10);
      c.fillStyle = COLORS.sand; c.fillRect(sb.x, sb.y, sb.w, sb.h);
    }
    // Клумбы у подъезда, на них тыквы
    if (hitRect(wb, 600, 118, 220, 40)) { c.fillStyle = '#6d4c35'; c.fillRect(612, 121, 48, 26); c.fillRect(752, 121, 48, 26); }
    // Площадка у фонтана: круг из плитки
    const f = WORLD.fountain;
    if (hitRect(wb, f.x - 120, f.y - 120, 240, 240)) {
      c.strokeStyle = 'rgba(90,80,75,0.35)'; c.lineWidth = 2;
      for (const rr of [70, 95]) { c.beginPath(); c.arc(f.x, f.y, rr, 0, Math.PI * 2); c.stroke(); }
    }
    const dp = WORLD.dogPark;
    if (!lite && hitRect(wb, dp.x, dp.y, dp.w, dp.h)) {
      c.fillStyle = 'rgba(80,50,25,0.28)';
      for (let i = 0; i < 40; i++) {
        const x = dp.x + 20 + hash2(i, 31) * (dp.w - 40), y = dp.y + 20 + hash2(i, 37) * (dp.h - 40), a = hash2(i, 41) * 6;
        for (let k = 0; k < 4; k++) {
          const px = x + Math.cos(a) * k * 16 + (k % 2 ? 5 : -5) * Math.sin(a), py = y + Math.sin(a) * k * 16 - (k % 2 ? 5 : -5) * Math.cos(a);
          c.beginPath(); c.ellipse(px, py, 3, 2.4, 0, 0, Math.PI * 2); c.fill();
        }
      }
    }
  }

  function paintBuilding(c, b, bi, r) {
    const st = BUILDING_STYLE[bi] || BUILDING_STYLE[0];
    const poly = (pts, color) => { c.fillStyle = color; c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y))); c.closePath(); c.fill(); };
    const x0 = b.x, x1 = b.x + b.w, y0 = b.y, y1 = b.y + b.h, Hb = b.height;
    poly([P(x0, y0, Hb), P(x1, y0, Hb), P(x1, y1, Hb), P(x0, y1, Hb)], st.roof);
    poly([P(x0, y1, 0), P(x1, y1, 0), P(x1, y1, Hb), P(x0, y1, Hb)], st.left);
    poly([P(x1, y0, 0), P(x1, y1, 0), P(x1, y1, Hb), P(x1, y0, Hb)], st.right);
    poly([P(x0, y1, 0), P(x1, y1, 0), P(x1, y1, 14), P(x0, y1, 14)], st.plinthL);
    poly([P(x1, y0, 0), P(x1, y1, 0), P(x1, y1, 14), P(x1, y0, 14)], st.plinthR);
    c.strokeStyle = COLORS.roofEdge; c.lineWidth = 3;
    const e1 = P(x0, y1, Hb), e2 = P(x1, y1, Hb), e3 = P(x1, y0, Hb);
    c.beginPath(); c.moveTo(e1.x, e1.y); c.lineTo(e2.x, e2.y); c.lineTo(e3.x, e3.y); c.stroke();
    // Окна этого дома, только те, что попадают в тайл
    for (const w of windows) {
      if (w.bi !== bi || w.box.x1 < r.x0 || w.box.x0 > r.x1 || w.box.y1 < r.y0 || w.box.y0 > r.y1) continue;
      poly(w.frame, COLORS.windowFrame);
      poly(w.glass, w.lit ? COLORS.windowLit : COLORS.window);
    }
    const onY = b.face === 'y';
    const at = (u, z) => (onY ? P(u, y1, z) : P(x1, u, z));
    const box = (u0, du, d, z0, z1, top, left, right) => (onY ? A.isoBox(c, P, u0, y1, du, d, z0, z1, top, left, right) : A.isoBox(c, P, x1, u0, d, du, z0, z1, top, left, right));
    for (const d of b.doors) {
      if (d.shop) { paintShop(c, d.at, at, box, poly); continue; }
      poly([at(d.at - 16, 0), at(d.at + 16, 0), at(d.at + 16, 40), at(d.at - 16, 40)], d.home ? COLORS.homeDoor : COLORS.door);
      poly([at(d.at - 12, 4), at(d.at - 1, 4), at(d.at - 1, 36), at(d.at - 12, 36)], 'rgba(255,255,255,0.08)');
      box(d.at - 24, 48, 14, 44, 48, '#8c99a5', '#6f7b86', '#7d8a96');
      box(d.at - 20, 40, 12, 0, 4, '#c8c8c8', '#b0b0b0', '#bdbdbd');
      if (d.home) {
        const plate = at(d.at, 56);
        c.fillStyle = '#1c7ed6'; c.fillRect(plate.x - 7, plate.y - 5, 14, 10);
        c.fillStyle = '#fff'; c.font = 'bold 8px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('1', plate.x, plate.y + 0.5);
        const lamp = at(d.at + 22, 40);
        c.fillStyle = groundKey.endsWith('e') ? '#fff3bf' : '#e9ecef'; c.beginPath(); c.arc(lamp.x, lamp.y, 3, 0, Math.PI * 2); c.fill();
      }
    }
  }

  /** Магазин «Продукты»: витрина, дверь, козырёк и вывеска. */
  function paintShop(c, u, at, box, poly) {
    const evening = groundKey.endsWith('e');
    poly([at(u - 92, 4), at(u + 92, 4), at(u + 92, 48), at(u - 92, 48)], '#2b4d3a');
    for (const [a, b] of [[-88, -20], [20, 88]]) poly([at(u + a, 8), at(u + b, 8), at(u + b, 44), at(u + a, 44)], evening ? '#ffe3a3' : '#b7d6e6');
    poly([at(u - 14, 4), at(u + 14, 4), at(u + 14, 44), at(u - 14, 44)], '#2f3b35');
    poly([at(u - 10, 6), at(u + 10, 6), at(u + 10, 40), at(u - 10, 40)], evening ? '#ffd27f' : '#9fc4dc');
    box(u - 98, 196, 18, 48, 53, '#3c9a5f', '#2f7a4a', '#358a54');
    box(u - 80, 160, 3, 58, 80, '#2f9e44', '#237a34', '#2a8c3c');
    const p = at(u, 69);
    c.save();
    c.translate(p.x, p.y + 1.5);
    c.transform(1, 0.5, 0, 1, 0, 0);
    c.fillStyle = '#ffffff'; c.font = '900 13px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('ПРОДУКТЫ', 0, 0);
    c.restore();
  }

  /** Обзорная картинка всего района: подложка для неготовых тайлов и мини-карты. */
  function paintOverview() {
    ovSc = VISUAL.OVERVIEW_SCALE;
    if (!overview) overview = document.createElement('canvas');
    overview.width = Math.ceil(COLS * TILE * ovSc); overview.height = Math.ceil(ROWS * TILE * ovSc);
    const c = overview.getContext('2d');
    paintGround(c, { x0: BOUNDS.x0, y0: BOUNDS.y0, x1: BOUNDS.x0 + COLS * TILE, y1: BOUNDS.y0 + ROWS * TILE }, ovSc, true);
    // Деревья точками, чтобы на карте был виден парк
    c.setTransform(ovSc, 0, 0, ovSc, -BOUNDS.x0 * ovSc, -BOUNDS.y0 * ovSc);
    for (const t of WORLD.trees) { const p = P(t.x, t.y, 50); c.fillStyle = A.TREES[t.type].leaves[0]; c.beginPath(); c.arc(p.x, p.y, 24, 0, Math.PI * 2); c.fill(); }
    const mw = VISUAL.MINIMAP_W, mh = Math.round(mw * (BOUNDS.y1 - BOUNDS.y0) / (BOUNDS.x1 - BOUNDS.x0));
    const k = Math.min(dpr, 2);
    if (!minimapBase) minimapBase = document.createElement('canvas');
    minimapBase.width = Math.round(mw * k); minimapBase.height = Math.round(mh * k);
    minimapBase._w = mw; minimapBase._h = mh;
    const m = minimapBase.getContext('2d');
    m.drawImage(overview, 0, 0, (BOUNDS.x1 - BOUNDS.x0) * ovSc, (BOUNDS.y1 - BOUNDS.y0) * ovSc, 0, 0, minimapBase.width, minimapBase.height);
  }

  function prepareGround(s) {
    const evening = !!(s && s.weather.evening);
    const sc = Math.min(scale * Math.min(dpr, VISUAL.BG_DPR_MAX), 3);
    const key = `${sc.toFixed(3)}@${dpr}|${evening ? 'e' : 'd'}`;
    if (key === groundKey) return;
    groundKey = key;
    for (const t of tiles.values()) tilePool.push(t.cv);
    tiles.clear();
    buildWindows(evening);
    paintOverview();
  }

  function renderTile(ix, iy) {
    const sc = Math.min(scale * Math.min(dpr, VISUAL.BG_DPR_MAX), 3);
    const px = Math.ceil(TILE * sc);
    if (tiles.size >= VISUAL.TILE_CACHE) {
      let oldKey = null, oldUsed = Infinity;
      for (const [k, t] of tiles) if (t.used < oldUsed) { oldUsed = t.used; oldKey = k; }
      tilePool.push(tiles.get(oldKey).cv); tiles.delete(oldKey);
    }
    const cv = tilePool.pop() || document.createElement('canvas');
    cv.width = px; cv.height = px;
    const c = cv.getContext('2d');
    const r = { x0: BOUNDS.x0 + ix * TILE, y0: BOUNDS.y0 + iy * TILE };
    r.x1 = r.x0 + TILE; r.y1 = r.y0 + TILE;
    paintGround(c, r, px / TILE, false);
    const t = { cv, used: frameNo };
    tiles.set(ix * 1024 + iy, t);
    return t;
  }

  function visibleTiles(pad = 0) {
    const a = tileIndex(app.cam.x, app.cam.y), b = tileIndex(app.cam.x + viewW, app.cam.y + viewH);
    return { ix0: Math.max(0, a.ix - pad), iy0: Math.max(0, a.iy - pad), ix1: Math.min(COLS - 1, b.ix + pad), iy1: Math.min(ROWS - 1, b.iy + pad) };
  }
  /** Рисует все тайлы в кадре сразу: на старте прогулки, чтобы не мелькала подложка. */
  function warmTiles() {
    const v = visibleTiles(0);
    for (let iy = v.iy0; iy <= v.iy1; iy++) for (let ix = v.ix0; ix <= v.ix1; ix++) if (!tiles.has(ix * 1024 + iy)) renderTile(ix, iy);
  }

  function drawGround() {
    frameNo++;
    const v = visibleTiles(0), k = scale * dpr;
    let budget = VISUAL.TILES_PER_FRAME;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (let iy = v.iy0; iy <= v.iy1; iy++) {
      for (let ix = v.ix0; ix <= v.ix1; ix++) {
        let t = tiles.get(ix * 1024 + iy);
        if (!t && budget > 0) { t = renderTile(ix, iy); budget--; }
        const sx = BOUNDS.x0 + ix * TILE, sy = BOUNDS.y0 + iy * TILE;
        const dx0 = Math.round((sx - app.cam.x) * k), dy0 = Math.round((sy - app.cam.y) * k);
        const dx1 = Math.round((sx + TILE - app.cam.x) * k), dy1 = Math.round((sy + TILE - app.cam.y) * k);
        if (t) { t.used = frameNo; ctx.drawImage(t.cv, dx0, dy0, dx1 - dx0, dy1 - dy0); }
        else if (overview) ctx.drawImage(overview, ix * TILE * ovSc, iy * TILE * ovSc, TILE * ovSc, TILE * ovSc, dx0, dy0, dx1 - dx0, dy1 - dy0);
      }
    }
    // Свободный бюджет - на тайлы вокруг кадра, чтобы на бегу они были готовы
    if (budget > 0) {
      const w = visibleTiles(1);
      outer: for (let iy = w.iy0; iy <= w.iy1; iy++) for (let ix = w.ix0; ix <= w.ix1; ix++) {
        if (!tiles.has(ix * 1024 + iy)) { renderTile(ix, iy).used = frameNo - 1; if (--budget <= 0) break outer; }
      }
    }
  }

  /* ============================== Камера и размеры ============================== */
  // Отступы под вырез и полоску «домой» для мини-карты
  const saProbe = document.createElement('div');
  saProbe.style.cssText = 'position:fixed;left:0;bottom:0;width:env(safe-area-inset-left,0px);height:env(safe-area-inset-bottom,0px);visibility:hidden;pointer-events:none';
  document.body.appendChild(saProbe);
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, VISUAL.DPR_MAX);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    overlay.width = Math.ceil(W * VISUAL.NIGHT_RES); overlay.height = Math.ceil(H * VISUAL.NIGHT_RES);
    scale = Math.min(W / VISUAL.VIEW_WIDTH, H / 520);
    viewW = W / scale; viewH = H / scale;
    safe.left = saProbe.offsetWidth; safe.bottom = saProbe.offsetHeight;
    prepareGround(app.walk || app.demo);
    if (app.walk) warmTiles();
  }
  function cameraTarget(sx, sy) {
    let x = sx - viewW / 2, y = sy - viewH * 0.55;
    const bw = BOUNDS.x1 - BOUNDS.x0, bh = BOUNDS.y1 - BOUNDS.y0;
    x = viewW >= bw ? BOUNDS.x0 + (bw - viewW) / 2 : G.clamp(x, BOUNDS.x0, BOUNDS.x1 - viewW);
    y = viewH >= bh ? BOUNDS.y0 + (bh - viewH) / 2 : G.clamp(y, BOUNDS.y0, BOUNDS.y1 - viewH);
    return { x, y };
  }
  function updateCamera(dt, focus, snap) {
    const p = P(focus.x, focus.y);
    const t = cameraTarget(p.x, p.y);
    const k = snap ? 1 : 1 - Math.exp(-dt * VISUAL.CAMERA_LERP);
    app.cam.x += (t.x - app.cam.x) * k;
    app.cam.y += (t.y - app.cam.y) * k;
  }
  const toView = (sx, sy) => ({ x: (sx - app.cam.x) * scale, y: (sy - app.cam.y) * scale });

  /* ================================ Эффекты ================================ */
  function addParticle(p) { if (app.particles.length >= VISUAL.MAX_PARTICLES) app.particles.shift(); app.particles.push(p); }
  function burst(wx, wy, z, kind, n, colors, power = 80) {
    const p0 = P(wx, wy, z);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = power * (0.4 + Math.random() * 0.6);
      const ttl = kind === 'heart' ? 1.3 + Math.random() * 0.5 : kind === 'leaf' ? 1 + Math.random() * 0.8 : 0.6 + Math.random() * 0.4;
      addParticle({ kind, x: p0.x, y: p0.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.6 - (kind === 'heart' ? 30 : 70), life: ttl, ttl,
        size: kind === 'heart' ? 4 + Math.random() * 2.5 : kind === 'leaf' ? 2.4 + Math.random() * 1.6 : 1.6 + Math.random() * 2,
        color: colors[Math.floor(Math.random() * colors.length)], rot: Math.random() * 6, floor: p0.y + 4 + Math.random() * 10 });
    }
  }
  function updateParticles(dt) {
    const ps = app.particles;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.life -= dt;
      if (p.life <= 0) { ps.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += dt * 3;
      if (p.kind === 'heart') { p.vx *= 1 - dt * 1.5; p.vy -= 10 * dt; }
      else if (p.kind === 'leaf' || p.kind === 'fall') {
        p.vx = p.vx * (1 - dt * 0.6) + Math.sin(app.time * 3 + p.rot) * 12 * dt;
        p.vy = Math.min(p.vy + 60 * dt, 26);
        if (p.y >= p.floor) { p.y = p.floor; p.vx = 0; p.vy = 0; }
      } else if (p.kind === 'wind') { p.vy = Math.sin(app.time * 4 + p.rot) * 20; }
      else if (p.kind === 'drop') { p.vy += 300 * dt; }
      else { p.vx *= 1 - dt * 3; p.vy += 220 * dt; if (p.y > p.floor) { p.y = p.floor; p.vy = 0; p.vx = 0; } }
    }
    for (let i = app.rings.length - 1; i >= 0; i--) { app.rings[i].life -= dt; if (app.rings[i].life <= 0) app.rings.splice(i, 1); }
    for (let i = app.bubbles.length - 1; i >= 0; i--) { app.bubbles[i].life -= dt; if (app.bubbles[i].life <= 0) app.bubbles.splice(i, 1); }
  }
  function drawParticles(c) {
    for (const p of app.particles) {
      const a = Math.min(1, Math.max(0, p.life / p.ttl) * 1.6);
      c.globalAlpha = a;
      if (p.kind === 'heart') {
        c.fillStyle = p.color; c.beginPath();
        c.moveTo(p.x, p.y + p.size * 0.35);
        c.bezierCurveTo(p.x - p.size, p.y - p.size * 0.4, p.x - p.size * 0.45, p.y - p.size * 1.1, p.x, p.y - p.size * 0.45);
        c.bezierCurveTo(p.x + p.size * 0.45, p.y - p.size * 1.1, p.x + p.size, p.y - p.size * 0.4, p.x, p.y + p.size * 0.35);
        c.fill();
      } else if (p.kind === 'leaf' || p.kind === 'fall' || p.kind === 'wind') A.leafShape(c, p.x, p.y, p.size, p.rot, p.color);
      else if (p.kind === 'drop') { c.fillStyle = p.color; c.fillRect(p.x - 0.8, p.y - 0.8, 1.6, 1.6); }
      else { c.fillStyle = p.color; c.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size); }
    }
    c.globalAlpha = 1;
  }

  const KIOSK_VENDOR = { x: WORLD.kiosk.x + WORLD.kiosk.w / 2, y: WORLD.kiosk.y + WORLD.kiosk.h - 6, z: 52 };
  /** Реплика над героем. Прохожие молчат, если на экране уже много реплик: так спокойнее. */
  function say(owner, text, ttl = 1.8, color) {
    const s = app.walk || app.demo;
    const main = (o) => s && (o === s.louis || o === s.owner);
    app.bubbles = app.bubbles.filter((b) => b.owner !== owner);
    if (!main(owner) && app.bubbles.filter((b) => !main(b.owner)).length >= VISUAL.MAX_NPC_BUBBLES) return;
    app.bubbles.push({ owner, text, life: ttl, ttl, color });
    while (app.bubbles.length > VISUAL.MAX_BUBBLES) {
      const i = app.bubbles.findIndex((b) => !main(b.owner));
      app.bubbles.splice(i >= 0 ? i : 0, 1);
    }
  }
  function bubbleHeight(owner) {
    const s = app.walk || app.demo;
    if (!s) return 40;
    if (owner === s.louis) return 52;
    if (owner === s.owner || s.janitors.includes(owner)) return 80;
    if (s.sitters.includes(owner)) return 66;
    if (owner === KIOSK_VENDOR) return 0;
    if (s.kids.includes(owner)) return 54;
    const pair = s.pairs.find((p) => p.owner === owner || p.dog === owner);
    if (pair) return owner === pair.owner ? 80 : (pair.dog.size === 'big' ? 50 : 32);
    return 50;
  }
  function drawBubbles(c) {
    c.font = '600 12px ui-rounded, system-ui, sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    // Раскладываем пузыри, чтобы не налезали: снизу вверх, каждый выше уже занятых мест
    const placed = [];
    const items = app.bubbles.map((b) => {
      const o = b.owner;
      const p = P(o.x, o.y, bubbleHeight(o) + (o.z || 0));
      return { b, x: p.x, y: p.y, w: c.measureText(b.text).width + 14 };
    }).sort((a, b) => b.y - a.y);
    for (const it of items) {
      let y = it.y;
      for (let guard = 0; guard < 8; guard++) {
        const hit = placed.find((q) => Math.abs(q.x - it.x) < (q.w + it.w) / 2 + 2 && Math.abs(q.y - y) < 23);
        if (!hit) break;
        y = hit.y - 24;
      }
      it.y = y;
      placed.push(it);
    }
    for (const it of items) {
      const b = it.b, p = { x: it.x, y: it.y }, w = it.w;
      const a = Math.min(1, b.life / 0.25, (b.ttl - b.life) / 0.1 + 0.25);
      c.globalAlpha = a;
      c.fillStyle = 'rgba(0,0,0,0.15)'; A.rr(c, p.x - w / 2 + 1.5, p.y - 11 + 2, w, 21, 10); c.fill();
      c.fillStyle = b.color || '#fff'; A.rr(c, p.x - w / 2, p.y - 11, w, 21, 10); c.fill();
      c.beginPath(); c.moveTo(p.x - 4, p.y + 9); c.lineTo(p.x, p.y + 15); c.lineTo(p.x + 4, p.y + 9); c.closePath(); c.fill();
      c.fillStyle = b.color ? '#fff' : '#2a2118';
      c.fillText(b.text, p.x, p.y);
    }
    c.globalAlpha = 1;
  }

  /**
   * Подсказка вверху. Одна за раз: тревога перебивает остальное, хорошая новость ждёт своей очереди,
   * а мелочь пропадает, если очередь занята.
   */
  const TOAST_PRIO = { danger: 3, good: 2, '': 1, tutorial: 0 };
  function toast(text, kind = '', dur = 2.2) {
    const prio = TOAST_PRIO[kind] !== undefined ? TOAST_PRIO[kind] : 1;
    const busy = app.toastTimer > 0.5 || app.toastGap > 0;
    if (busy && prio <= app.toastPrio) {
      if (prio >= 2 && (!app.toastNext || app.toastNext.prio <= prio)) app.toastNext = { text, kind, dur, prio, at: app.time };
      return;
    }
    showToast(text, kind, dur, prio);
  }
  function showToast(text, kind, dur, prio) {
    ui.toast.textContent = text;
    ui.toast.className = 'toast show' + (kind && kind !== 'tutorial' ? ' ' + kind : '');
    app.toastTimer = dur;
    app.toastPrio = prio;
    app.toastGap = 0;
  }
  function updateToast(dt) {
    if (app.toastTimer > 0) {
      app.toastTimer -= dt;
      if (app.toastTimer <= 0) { ui.toast.classList.remove('show'); app.toastPrio = 0; app.toastGap = VISUAL.TOAST_GAP; }
      return;
    }
    if (app.toastGap > 0) { app.toastGap -= dt; return; }
    const n = app.toastNext;
    if (n) { app.toastNext = null; if (app.time - n.at < 4) showToast(n.text, n.kind, n.dur, n.prio); }
  }
  const TUTORIAL = [
    'Веди пальцем по экрану, Луи пойдёт следом. Тяни дальше - побежит',
    'Шкалы вверху: пописать, покакать, побегать и порадоваться',
    'Остановись у дерева или столба - Луи понюхает и пометит',
    'Тянется к гадости? Жми «Фу»!',
    'Злая собака? Беги к подъезду, туда она не пойдёт',
    'Район большой: внизу слева карта. Загляни в парк к пруду и на собачью площадку'
  ];

  /* ================================ Рендер мира ================================ */
  function pose(L) {
    if (L.act) {
      if (L.act.type === 'sniffPee' || L.act.type === 'sniffPoop') return 'sniff';
      if (L.act.type === 'pee') return 'pee';
      if (L.act.type === 'spin') return 'walk';
      if (L.act.type === 'poop') return 'squat';
    }
    if (L.tempt && L.speed < 90) return 'sniff';
    return L.speed > 150 ? 'run' : 'walk';
  }

  function drawSolid(c, s, night) {
    if (s.kind === 'bench') {
      A.isoBox(c, P, s.x, s.y, s.w, 4, 10, 24, '#9b6b43', '#7d5233', '#8a5c39');
      A.isoBox(c, P, s.x, s.y, s.w, s.h, 9, 12, '#b07a4c', '#7d5233', '#8a5c39');
      A.isoBox(c, P, s.x + 4, s.y + s.h - 4, 4, 4, 0, 9, '#333', '#222', '#2a2a2a');
      A.isoBox(c, P, s.x + s.w - 8, s.y + s.h - 4, 4, 4, 0, 9, '#333', '#222', '#2a2a2a');
    } else if (s.kind === 'bins') {
      for (let i = 0; i < 3; i++) {
        const x = s.x + i * 23.5;
        A.isoBox(c, P, x, s.y, 21, s.h, 0, 28, '#2f6b45', '#245236', '#2a5f3d');
        A.isoBox(c, P, x - 1, s.y - 1, 23, s.h + 2, 28, 31, '#3c8257', '#2c613f', '#336e49');
      }
    } else if (s.kind === 'car') {
      const dark = shade(s.color, -0.25), mid = shade(s.color, -0.12);
      const longY = s.h > s.w;
      A.isoBox(c, P, s.x, s.y, s.w, s.h, 6, 22, s.color, dark, mid);
      if (longY) A.isoBox(c, P, s.x + 6, s.y + 24, s.w - 12, s.h - 46, 22, 36, '#9fbfd6', '#6f8fa6', '#86a6bd');
      else A.isoBox(c, P, s.x + 24, s.y + 6, s.w - 46, s.h - 12, 22, 36, '#9fbfd6', '#6f8fa6', '#86a6bd');
      const wheels = longY ? [[s.x + s.w, s.y + 18], [s.x + s.w, s.y + s.h - 18]] : [[s.x + 18, s.y + s.h], [s.x + s.w - 18, s.y + s.h]];
      for (const [wx, wy] of wheels) { const p = P(wx, wy, 6); c.fillStyle = '#1e1e1e'; c.beginPath(); c.ellipse(p.x, p.y, 6, 5, 0, 0, Math.PI * 2); c.fill(); }
      const hl = longY ? P(s.x + s.w - 4, s.y + s.h, 16) : P(s.x + s.w, s.y + s.h - 6, 16);
      c.fillStyle = night ? '#fff3bf' : '#f1f1f1'; c.fillRect(hl.x - 2, hl.y - 1.5, 4, 3);
    } else if (s.kind === 'swings') {
      A.isoBox(c, P, s.x, s.y, 4, s.h, 0, 46, '#2d5f9a', '#234b7a', '#2a578c');
      A.isoBox(c, P, s.x + s.w - 4, s.y, 4, s.h, 0, 46, '#2d5f9a', '#234b7a', '#2a578c');
      A.isoBox(c, P, s.x, s.y + s.h / 2 - 1, s.w, 3, 44, 47, '#3a76bd', '#2d5f9a', '#336aa8');
      for (const sx of [s.x + 16, s.x + 38]) {
        const top = P(sx, s.y + s.h / 2, 44), seat = P(sx, s.y + s.h / 2, 14 + Math.sin(app.time * 2 + sx) * 1);
        c.strokeStyle = '#999'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(top.x - 3, top.y); c.lineTo(seat.x - 3, seat.y); c.moveTo(top.x + 3, top.y); c.lineTo(seat.x + 3, seat.y); c.stroke();
        c.fillStyle = '#f39c12'; c.fillRect(seat.x - 5, seat.y - 1.5, 10, 3);
      }
    } else if (s.kind === 'slide') {
      A.isoBox(c, P, s.x, s.y, s.w, 14, 0, 34, '#95a5a6', '#7f8c8d', '#879596');
      poly(c, [P(s.x, s.y + 14, 34), P(s.x + s.w, s.y + 14, 34), P(s.x + s.w, s.y + s.h, 3), P(s.x, s.y + s.h, 3)], '#e74c3c');
      poly(c, [P(s.x + s.w, s.y + 14, 34), P(s.x + s.w, s.y + s.h, 3), P(s.x + s.w, s.y + s.h, 0), P(s.x + s.w, s.y + 14, 30)], '#c0392b');
    } else if (s.kind === 'kiosk') {
      // Ларёк с шаурмой: окошко с продавцом смотрит на дорожку
      A.isoBox(c, P, s.x, s.y, s.w, s.h, 0, 58, '#f1f3f5', '#d0d7de', '#e3e8ed');
      A.isoBox(c, P, s.x - 5, s.y - 5, s.w + 10, s.h + 10, 58, 64, '#d9480f', '#b23a0b', '#c4410d');
      const y = s.y + s.h, lit = night ? '#ffd27f' : '#b7d6e6';
      poly(c, [P(s.x + 14, y, 22), P(s.x + s.w - 14, y, 22), P(s.x + s.w - 14, y, 46), P(s.x + 14, y, 46)], lit);
      const head = P(s.x + s.w / 2, y - 6, 36);
      c.fillStyle = '#e8b996'; c.beginPath(); c.arc(head.x, head.y, 4.5, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#fff'; c.fillRect(head.x - 4.5, head.y - 7, 9, 3.5);
      c.fillStyle = '#495057'; c.fillRect(head.x - 6, head.y + 4, 12, 6);
      A.isoBox(c, P, s.x + 10, y, s.w - 20, 8, 20, 22, '#adb5bd', '#868e96', '#97a0a8');
      A.isoBox(c, P, s.x + 8, y - 4, s.w - 16, 3, 66, 82, '#ffd43b', '#e8b923', '#f2c52a');
      const p = P(s.x + s.w / 2, y - 3, 74);
      c.save(); c.translate(p.x, p.y + 1); c.transform(1, 0.5, 0, 1, 0, 0);
      c.fillStyle = '#c92a2a'; c.font = '900 9px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('ШАУРМА', 0, 0);
      c.restore();
    } else if (s.kind === 'garages') {
      // Ряд гаражей, ворота смотрят на площадку перед ними
      const colors = ['#5c7c5a', '#4f6d8f', '#8d5b3e', '#6b6f73', '#7b5e8a', '#4f7f7a'];
      const n = Math.round(s.w / 80);
      for (let i = 0; i < n; i++) {
        const x = s.x + i * (s.w / n), w = s.w / n;
        A.isoBox(c, P, x, s.y, w, s.h, 0, 44, '#a3a09a', '#8c8984', '#97948f');
        A.isoBox(c, P, x - 1, s.y - 2, w + 2, s.h + 4, 44, 48, '#6d6a66', '#5a5753', '#64615d');
        const col = colors[(i + Math.round(s.x / 80)) % colors.length], y = s.y + s.h;
        poly(c, [P(x + 10, y, 2), P(x + w - 10, y, 2), P(x + w - 10, y, 36), P(x + 10, y, 36)], col);
        c.strokeStyle = 'rgba(0,0,0,0.18)'; c.lineWidth = 0.8;
        for (let k = x + 16; k < x + w - 12; k += 7) { const a = P(k, y, 3), b = P(k, y, 35); c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke(); }
        const lock = P(x + w / 2, y, 18); c.fillStyle = '#ced4da'; c.fillRect(lock.x - 1.5, lock.y - 1.5, 3, 3);
      }
    } else if (s.kind === 'gazebo') {
      const x0 = s.x, y0 = s.y, x1 = s.x + s.w, y1 = s.y + s.h, cx = s.x + s.w / 2, cy = s.y + s.h / 2;
      A.isoBox(c, P, x0, y0, s.w, s.h, 0, 6, '#c4a27a', '#9c7c57', '#ad8c66');
      const post = (x, y) => A.isoBox(c, P, x, y, 6, 6, 6, 58, '#f1e3cf', '#c8b79f', '#dccbb3');
      post(x0 + 2, y0 + 2); post(x1 - 8, y0 + 2); post(x0 + 2, y1 - 8);
      A.isoBox(c, P, x0 + 4, y1 - 3, s.w - 8, 3, 18, 22, '#e6d5bd', '#bfae96', '#d2c1a9');
      A.isoBox(c, P, x1 - 3, y0 + 4, 3, s.h - 8, 18, 22, '#e6d5bd', '#bfae96', '#d2c1a9');
      post(x1 - 8, y1 - 8);
      const o = 10, apex = P(cx, cy, 92);
      const c00 = P(x0 - o, y0 - o, 58), c10 = P(x1 + o, y0 - o, 58), c11 = P(x1 + o, y1 + o, 58), c01 = P(x0 - o, y1 + o, 58);
      poly(c, [c00, c10, apex], '#7b3f2a'); poly(c, [c00, c01, apex], '#6f3826');
      poly(c, [c10, c11, apex], '#9a5136'); poly(c, [c01, c11, apex], '#87472f');
    } else if (s.kind === 'hoop') {
      const north = s.y < WORLD.court.y + WORLD.court.h / 2, dir = north ? 1 : -1;
      A.isoBox(c, P, s.x + 3, s.y + 3, 6, 6, 0, 66, '#868e96', '#5c636a', '#6c757d');
      const by = north ? s.y + 10 : s.y - 2;
      A.isoBox(c, P, s.x - 12, by, 36, 3, 56, 80, '#f8f9fa', '#ced4da', '#dee2e6');
      const ring = P(s.x + 6, by + dir * 9, 62);
      c.strokeStyle = '#f76707'; c.lineWidth = 1.6; c.beginPath(); c.ellipse(ring.x, ring.y, 7, 3.4, 0, 0, Math.PI * 2); c.stroke();
      c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = 0.7;
      for (let k = -5; k <= 5; k += 2.5) { c.beginPath(); c.moveTo(ring.x + k, ring.y + 1); c.lineTo(ring.x + k * 0.6, ring.y + 10); c.stroke(); }
    } else if (s.kind === 'barrier') {
      const alongX = s.w > s.h, len = alongX ? s.w : s.h;
      const at = (u, z) => (alongX ? P(s.x + u, s.y + s.h / 2, z) : P(s.x + s.w / 2, s.y + u, z));
      if (alongX) A.isoBox(c, P, s.x + 2, s.y + 4, 8, 8, 0, 30, '#495057', '#343a40', '#3d444b');
      else A.isoBox(c, P, s.x + 4, s.y + 2, 8, 8, 0, 30, '#495057', '#343a40', '#3d444b');
      c.lineWidth = 3.4; c.lineCap = 'butt';
      for (let u = 8; u < len - 4; u += 14) {
        const a = at(u, 24), b = at(Math.min(len - 4, u + 14), 24);
        c.strokeStyle = Math.round(u / 14) % 2 ? '#f8f9fa' : '#e03131';
        c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
      }
      c.lineCap = 'round';
    }
  }
  function poly(c, pts, color) { c.fillStyle = color; c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y))); c.closePath(); c.fill(); }
  /** Кусок сетчатого забора собачьей площадки от (x0, y0) до (x1, y1). */
  function drawFenceSeg(c, x0, y0, x1, y1, post) {
    c.strokeStyle = COLORS.fence; c.lineWidth = 1.2;
    for (const z of [6, 28]) { const a = P(x0, y0, z), b = P(x1, y1, z); c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke(); }
    c.strokeStyle = 'rgba(47,79,58,0.55)'; c.lineWidth = 0.7;
    const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / 6));
    for (let i = 0; i <= n; i++) { const u = i / n, a = P(x0 + (x1 - x0) * u, y0 + (y1 - y0) * u, 0), b = P(x0 + (x1 - x0) * u, y0 + (y1 - y0) * u, 28); c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke(); }
    if (post) { const a = P(x0, y0, 0), b = P(x0, y0, 32); c.fillStyle = COLORS.fence; c.fillRect(a.x - 1.4, b.y, 2.8, a.y - b.y); }
  }
  function drawHurdle(c, h) {
    const x = h.x + h.w / 2;
    for (const y of [h.y, h.y + h.h]) { const a = P(x, y, 0), b = P(x, y, 22); c.fillStyle = '#495057'; c.fillRect(a.x - 1.2, b.y, 2.4, a.y - b.y); }
    c.lineWidth = 3; c.lineCap = 'butt';
    for (let u = 0; u < h.h; u += 14) {
      const a = P(x, h.y + u, 16), b = P(x, h.y + Math.min(h.h, u + 14), 16);
      c.strokeStyle = (u / 14) % 2 ? '#f8f9fa' : '#1c7ed6'; c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
    }
    c.lineCap = 'round';
  }
  function shade(hex, k) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const f = (v) => Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k);
    r = f(r); g = f(g); b = f(b);
    return `rgb(${r},${g},${b})`;
  }

  /** Длинные заборы и шлагбаумы режем на куски, чтобы герои верно заходили за них и перед ними. */
  const SOLID_PARTS = (() => {
    const parts = [];
    for (const so of WORLD.solids) {
      if (so.kind === 'building' || so.kind === 'barrier') continue;
      if (so.kind === 'fence') {
        const alongX = so.w > so.h, len = alongX ? so.w : so.h, n = Math.ceil(len / 30);
        for (let i = 0; i < n; i++) {
          const u0 = (len * i) / n, u1 = (len * (i + 1)) / n;
          const box = alongX ? { x: so.x + u0, y: so.y, w: u1 - u0, h: so.h } : { x: so.x, y: so.y + u0, w: so.w, h: u1 - u0 };
          const cx = alongX ? null : so.x + so.w / 2, cy = alongX ? so.y + so.h / 2 : null;
          box.draw = (c) => (alongX ? drawFenceSeg(c, so.x + u0, cy, so.x + u1, cy, true) : drawFenceSeg(c, cx, so.y + u0, cx, so.y + u1, true));
          parts.push(box);
        }
      } else parts.push({ x: so.x, y: so.y, w: so.w, h: so.h, solid: so });
    }
    for (const p of parts) p.key = depth(p.x + p.w / 2, p.y + p.h / 2);
    return parts;
  })();

  function render() {
    const s = app.walk || app.demo;
    const t = app.time;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = COLORS.street;
    ctx.fillRect(0, 0, W, H);
    if (!s) return;
    const night = s.weather.evening;

    drawGround();
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, -app.cam.x * dpr * scale, -app.cam.y * dpr * scale);
    const vx0 = app.cam.x - 80, vx1 = app.cam.x + viewW + 80, vy0 = app.cam.y - 40, vy1 = app.cam.y + viewH + 160;
    const vis = (wx, wy) => { const p = P(wx, wy); return p.x > vx0 && p.x < vx1 && p.y > vy0 && p.y < vy1; };
    const L = s.louis, O = s.owner;

    // Вода в пруду блестит
    for (const pd of WORLD.ponds) {
      if (!vis(pd.x, pd.y - pd.ry) && !vis(pd.x, pd.y + pd.ry) && !vis(pd.x - pd.rx, pd.y) && !vis(pd.x + pd.rx, pd.y)) continue;
      for (let i = 0; i < 7; i++) {
        const a = i * 0.9 + Math.sin(t * 0.4 + i) * 0.2, d = 0.25 + (i % 3) * 0.2;
        const p = P(pd.x + Math.cos(a) * pd.rx * d, pd.y + Math.sin(a) * pd.ry * d);
        ctx.strokeStyle = `rgba(255,255,255,${0.18 + 0.12 * Math.sin(t * 2 + i)})`; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(p.x - 7, p.y); ctx.lineTo(p.x + 7, p.y); ctx.stroke();
      }
    }
    // Следы меток и зона подъезда
    for (const m of s.marks) {
      if (!m.marked || !vis(m.x, m.y)) continue;
      const p = P(m.x, m.y);
      ctx.fillStyle = 'rgba(200,170,40,0.35)';
      ctx.beginPath(); ctx.ellipse(p.x + 6, p.y + 3, 7, 3, 0, 0, Math.PI * 2); ctx.fill();
    }
    if (L.fear > 0.15 || L.panic > 0 || s.allDone) {
      const pulse = 0.5 + Math.sin(t * 5) * 0.5;
      ctx.save();
      ctx.setTransform(dpr * scale * ISO.X, dpr * scale * ISO.Y, -dpr * scale * ISO.X, dpr * scale * ISO.Y, -app.cam.x * dpr * scale, -app.cam.y * dpr * scale);
      ctx.strokeStyle = s.allDone ? `rgba(120,255,150,${0.4 + pulse * 0.4})` : `rgba(255,255,255,${0.35 + pulse * 0.35})`;
      ctx.lineWidth = 3; ctx.setLineDash([10, 8]);
      ctx.beginPath(); ctx.arc(WORLD.safe.x, WORLD.safe.y, CFG.SAFE_R, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
    // Волна нюха
    for (const r of app.rings) {
      const k = 1 - r.life / r.ttl, p = P(r.x, r.y), R = 20 + k * CFG.SNIFF_REVEAL_R;
      ctx.strokeStyle = `rgba(255,200,120,${(1 - k) * 0.8})`; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(p.x, p.y, R * ISO.X * 1.41, R * ISO.Y * 1.41, 0, 0, Math.PI * 2); ctx.stroke();
    }
    if (app.walk && L.sniff > 0) drawScentTrails(s, t);

    // Объекты по глубине. Герои рядом с коробками (машины, гаражи, ларёк) встают перед ними или за ними
    const list = [];
    const push = (x, y, f, bias = 0) => list.push({ d: depth(x, y) + bias, f });
    const boxes = [];
    for (const part of SOLID_PARTS) {
      if (!vis(part.x + part.w / 2, part.y + part.h / 2) && !vis(part.x, part.y + part.h) && !vis(part.x + part.w, part.y)) continue;
      boxes.push(part);
      list.push({ d: part.key, f: part.draw ? () => part.draw(ctx) : () => drawSolid(ctx, part.solid, night) });
    }
    const keyFor = (x, y, base) => {
      let k = base;
      for (const b of boxes) {
        if (x < b.x - 60 || x > b.x + b.w + 60 || y < b.y - 60 || y > b.y + b.h + 60) continue;
        if (x >= b.x + b.w || y >= b.y + b.h) k = Math.max(k, b.key + 0.5);
        else if (x <= b.x || y <= b.y) k = Math.min(k, b.key - 0.5);
      }
      return k;
    };
    const pushE = (e, f, bias = 0) => list.push({ d: keyFor(e.x, e.y, depth(e.x, e.y) + bias), f });
    const at = (x, y, z, f) => { const p = P(x, y, z); ctx.save(); ctx.translate(p.x, p.y); f(p); ctx.restore(); };

    WORLD.trees.forEach((tr, i) => { if (vis(tr.x, tr.y)) push(tr.x, tr.y, () => at(tr.x, tr.y, 0, () => A.tree(ctx, tr.type, { t, seed: 50 + i, wind: s.weather.wind }))); });
    WORLD.bushes.forEach((b, i) => {
      if (!vis(b.x, b.y)) return;
      const inside = G.dist(L.x, L.y, b.x, b.y) < b.r + 8;
      push(b.x, b.y + b.r * 0.4, () => at(b.x, b.y, 0, () => A.bush(ctx, b.r, 200 + i, inside ? 0.6 : 1)));
    });
    WORLD.lamps.forEach((l) => { if (vis(l.x, l.y)) push(l.x, l.y, () => at(l.x, l.y, 0, () => A.lamp(ctx, true, night))); });
    WORLD.pumpkins.forEach((pk) => { if (vis(pk.x, pk.y)) push(pk.x, pk.y, () => at(pk.x, pk.y, 0, () => A.pumpkin(ctx, pk.r))); });
    const fo = WORLD.fountain;
    if (vis(fo.x, fo.y)) push(fo.x, fo.y, () => at(fo.x, fo.y, 0, () => A.fountain(ctx, fo.r, t, night)));
    WORLD.hurdles.forEach((h) => { if (vis(h.x, h.y + h.h / 2)) push(h.x + h.w / 2, h.y + h.h / 2, () => drawHurdle(ctx, h)); });
    s.piles.forEach((pl, i) => { if (vis(pl.x, pl.y)) push(pl.x, pl.y, () => at(pl.x, pl.y, 0, () => A.leafPile(ctx, pl.size, 400 + i, t)), -8); });
    s.poops.forEach((pp) => push(pp.x, pp.y, () => at(pp.x, pp.y, 0, () => A.poopPile(ctx)), -4));
    s.items.forEach((it) => {
      if (it.state === 'carried' || (!it.revealed && it.group === 'treat')) return;
      if (!vis(it.x, it.y)) return;
      pushE(it, () => {
        const p = P(it.x, it.y);
        at(it.x, it.y, 0, () => A.item(ctx, it.kind, t, it.id, it.z));
        if (it.group === 'bad' && L.tempt === it) { ctx.fillStyle = 'rgba(231,76,60,0.9)'; ctx.font = 'bold 13px system-ui'; ctx.textAlign = 'center'; ctx.fillText('!', p.x, p.y - 14 - Math.abs(Math.sin(t * 8)) * 3); }
      }, -3);
    });
    if (s.court) {
      const b = s.court.ball;
      if (vis(b.x, b.y)) pushE(b, () => at(b.x, b.y, 0, () => A.football(ctx, Math.abs(Math.sin((b.x + b.y) * 0.05)) * Math.min(6, Math.hypot(b.vx, b.vy) / 30), (b.x - b.y) * 0.08)));
    }
    s.flocks.forEach((f) => {
      const fly = f.state === 'fly';
      const k = fly ? Math.min(1, f.t / CFG.PIGEON_FLY_TIME) : 0;
      // Взлетают сразу: высота быстро растёт, и стая разлетается в стороны
      const up = fly ? Math.pow(Math.sin(k * Math.PI), 0.6) : 0;
      f.birds.forEach((b, i) => {
        const bx = f.x + b.ox + b.dx * 40 * up, by = f.y + b.oy + b.dy * 40 * up;
        if (!vis(bx, by)) return;
        push(bx, by, () => at(bx, by, 0, () => A.pigeon(ctx, { flying: fly, z: up * (90 + i * 6), t, ph: b.ph, facing: fly ? (f.to.x - f.to.y > f.from.x - f.from.y ? 1 : -1) : (i % 2 ? 1 : -1) })), fly ? 200 : 0);
      });
    });
    s.ducks.forEach((dk, i) => {
      if (!vis(dk.x, dk.y)) return;
      push(dk.x, dk.y, () => at(dk.x, dk.y, 0, () => A.duck(ctx, { t, ph: dk.ph, facing: dk.facing, drake: i % 2 === 0, fast: s.duckCd > CFG.DUCK_COOLDOWN - 2 })));
    });
    s.cats.forEach((cat) => {
      if (!vis(cat.x, cat.y)) return;
      const perched = cat.state === 'perch' || cat.z > 10;
      const f = () => at(cat.x, cat.y, 0, () => A.cat(ctx, cat.color, { facing: cat.facing, pose: cat.state === 'sit' || cat.state === 'perch' ? 'sit' : 'run', t, phase: cat.phase, z: cat.z }));
      if (perched) push(cat.x, cat.y, f, 120); else pushE(cat, f);
    });
    s.sitters.forEach((st) => {
      if (vis(st.x, st.y)) push(st.x, st.y, () => at(st.x, st.y, 0, () => A.person(ctx, st.look, { facing: 1, phase: 0, moving: 0, t, pose: 'sit' })), 2);
    });
    s.kids.forEach((k) => { if (vis(k.x, k.y)) pushE(k, () => at(k.x, k.y, 0, () => A.person(ctx, k.look, { facing: k.facing, phase: k.phase, moving: Math.min(1, k.speed / 40), t, pose: k.speed > 5 ? 'walk' : 'stand' }))); });
    s.janitors.forEach((J) => {
      if (vis(J.x, J.y)) pushE(J, () => at(J.x, J.y, 0, () => A.person(ctx, 'janitor', { facing: J.facing, phase: J.phase, moving: Math.min(1, J.speed / 40), t, pose: J.sweeping ? 'sweep' : J.speed > 5 ? 'walk' : 'stand', holding: 'broom' })));
    });
    const leashes = [];
    s.pairs.forEach((pair) => {
      const o = pair.owner, d = pair.dog;
      const ref = { hand: null, collar: null };
      if (!vis(o.x, o.y) && !vis(d.x, d.y)) return;
      const free = pair.offLeash || d.state === 'chase' || d.state === 'return';
      pushE(o, () => at(o.x, o.y, 0, (p) => {
        const h = A.person(ctx, o.look, { facing: o.facing, phase: o.phase, moving: Math.min(1, o.speed / 40), t, pose: d.state === 'chase' ? 'call' : o.speed > 5 ? 'walk' : 'stand', holding: free ? null : 'leash' });
        ref.hand = { x: p.x + h.x, y: p.y + h.y };
      }));
      pushE(d, () => {
        const p = P(d.x, d.y);
        const angry = d.character === 'angry' && (d.state === 'alert' || d.state === 'chase');
        let col = null;
        at(d.x, d.y, 0, () => { col = A.dog(ctx, d.look, { facing: d.facing, phase: d.phase, moving: Math.min(1, d.speed / 60), t: t + d.r, wag: d.character === 'friendly', angry: angry || d.yap > 0, hackles: d.character === 'angry', sniff: d.state === 'greet' && d.progress > 0 }); });
        ref.collar = { x: p.x + col.x, y: p.y + col.y };
        if (angry) { const yy = p.y - 46 * A.DOGS[d.look].scale; ctx.fillStyle = '#e03131'; ctx.beginPath(); ctx.arc(p.x, yy, 8, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = 'bold 12px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('!', p.x, yy + 0.5); }
      });
      if (!pair.offLeash) leashes.push({ ref, free, dog: d });
    });
    const louisRef = { ring: null, hand: null };
    if (app.walk) pushE(O, () => at(O.x, O.y, 0, (p) => {
      // Хозяин впереди Луи и заслоняет его - делаем полупрозрачным
      const lp = P(L.x, L.y);
      if (depth(O.x, O.y) > depth(L.x, L.y) && Math.abs(lp.x - p.x) < 26 && lp.y < p.y + 4 && lp.y > p.y - 70) ctx.globalAlpha = 0.55;
      const pickup = O.act && O.act.type === 'pickup' && O.act.t > 0;
      const h = A.person(ctx, O.look, { facing: O.facing, phase: O.phase, moving: Math.min(1, O.speed / 50), t: O.act && O.act.type === 'throw' ? 0.45 - O.act.t : t, pose: O.act && O.act.type === 'throw' ? 'throw' : pickup ? 'bend' : O.speed > 5 ? 'walk' : 'stand', holding: pickup ? 'bag' : 'leash' });
      louisRef.hand = { x: p.x + h.x, y: p.y + h.y };
    }));
    if (app.walk) pushE(L, () => at(L.x, L.y, 0, (p) => {
      const ps = pose(L);
      let facing = L.facing;
      if (L.act && L.act.type === 'spin') facing = Math.sin(L.act.t * 12) > 0 ? 1 : -1;
      const expr = L.panic > 0 || L.fear > 0.5 ? 'scared' : s.meters.happy > 60 || L.running ? 'happy' : 'neutral';
      const ring = A.louis(ctx, { facing, phase: L.phase, moving: L.act && L.act.type === 'spin' ? 1 : Math.min(1, L.speed / 80), t, pose: ps, expr, carry: L.carry ? L.carry.kind : null, jump: L.jump });
      louisRef.ring = { x: p.x + ring.x, y: p.y + ring.y };
      if (L.act && L.act.type === 'pee' && Math.random() < 0.6) {
        const dir = L.facing;
        addParticle({ kind: 'drop', x: p.x - dir * 12, y: p.y - 9, vx: -dir * 40, vy: -10, life: 0.25, ttl: 0.25, size: 1.5, color: 'rgba(240,200,60,0.85)', rot: 0, floor: p.y });
      }
    }));
    list.sort((a, b) => a.d - b.d);
    for (const e of list) e.f();

    // Поводки поверх
    ctx.lineCap = 'round';
    for (const l of leashes) {
      if (!l.ref.collar) continue;
      ctx.strokeStyle = 'rgba(40,30,25,0.85)'; ctx.lineWidth = 1.1;
      if (l.free) {
        const back = l.dog.facing * -22;
        ctx.beginPath(); ctx.moveTo(l.ref.collar.x, l.ref.collar.y); ctx.quadraticCurveTo(l.ref.collar.x + back * 0.5, l.ref.collar.y + 14, l.ref.collar.x + back, l.ref.collar.y + 22); ctx.stroke();
      } else if (l.ref.hand) {
        const m = { x: (l.ref.hand.x + l.ref.collar.x) / 2, y: (l.ref.hand.y + l.ref.collar.y) / 2 + 10 };
        ctx.beginPath(); ctx.moveTo(l.ref.hand.x, l.ref.hand.y); ctx.quadraticCurveTo(m.x, m.y, l.ref.collar.x, l.ref.collar.y); ctx.stroke();
      }
    }
    if (louisRef.ring && louisRef.hand) {
      const d = G.dist(L.x, L.y, O.x, O.y);
      const slack = G.clamp(1 - d / (L.leashMax * 0.95), 0, 1);
      const sag = L.taut ? 0 : 3 + slack * 9;
      const m = { x: (louisRef.hand.x + louisRef.ring.x) / 2, y: (louisRef.hand.y + louisRef.ring.y) / 2 + sag };
      ctx.strokeStyle = L.taut ? '#c0392b' : '#3b2a20'; ctx.lineWidth = L.taut ? 1.5 : 1.2;
      ctx.beginPath(); ctx.moveTo(louisRef.hand.x, louisRef.hand.y); ctx.quadraticCurveTo(m.x, m.y, louisRef.ring.x, louisRef.ring.y); ctx.stroke();
    }

    drawFence(vis);
    drawProgressRings(s, t);
    drawParticles(ctx);
    drawBubbles(ctx);
    if (app.walk) drawThought(s, t);

    if (night) drawNight(s);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (app.walk) {
      if (L.fear > 0.05) {
        const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
        g.addColorStop(0, 'rgba(200,0,0,0)'); g.addColorStop(1, `rgba(200,20,20,${L.fear * 0.4})`);
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      }
      if (s.allDone || L.panic > 0 || s.pairs.some((p) => p.dog.state === 'chase' || p.dog.state === 'alert')) drawDoorArrow(t, s.allDone);
      drawMinimap(s);
      drawJoystick();
    }
  }

  /** Забор по ближним краям района, с калитками. */
  function drawFence(vis) {
    const gap = (edge, u) => WORLD.fenceGaps.some((g) => g.edge === edge && u > g.a && u < g.b);
    ctx.strokeStyle = COLORS.fence; ctx.lineWidth = 1.6;
    const side = (edge) => {
      for (const z of [10, 22]) {
        ctx.beginPath();
        let pen = false;
        for (let u = 0; u <= S; u += 10) {
          const x = edge === 'x' ? S : u, y = edge === 'x' ? u : S;
          if (gap(edge, u) || !vis(x, y)) { pen = false; continue; }
          const p = P(x, y, z);
          if (pen) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y);
          pen = true;
        }
        ctx.stroke();
      }
      ctx.fillStyle = COLORS.fence;
      for (let u = 40; u <= S; u += 60) {
        const x = edge === 'x' ? S : u, y = edge === 'x' ? u : S;
        if (gap(edge, u) || !vis(x, y)) continue;
        const a = P(x, y, 0), b = P(x, y, 26); ctx.fillRect(a.x - 1.2, b.y, 2.4, a.y - b.y);
      }
    };
    side('x'); side('y');
  }

  /** Мини-карта района в углу: дом, Луи, собаки. */
  function drawMinimap(s) {
    if (!minimapBase) return;
    const mw = minimapBase._w, mh = minimapBase._h;
    const x0 = 12 + safe.left, y0 = H - mh - 16 - safe.bottom;
    const k = mw / (BOUNDS.x1 - BOUNDS.x0);
    const toMap = (wx, wy) => { const p = P(wx, wy); return { x: x0 + (p.x - BOUNDS.x0) * k, y: y0 + (p.y - BOUNDS.y0) * k }; };
    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = 'rgba(255,248,235,0.85)'; A.rr(ctx, x0 - 4, y0 - 4, mw + 8, mh + 8, 10); ctx.fill();
    ctx.save(); A.rr(ctx, x0, y0, mw, mh, 7); ctx.clip();
    ctx.drawImage(minimapBase, x0, y0, mw, mh);
    // Рамка того, что видно на экране
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1;
    ctx.strokeRect(x0 + (app.cam.x - BOUNDS.x0) * k, y0 + (app.cam.y - BOUNDS.y0) * k, viewW * k, viewH * k);
    ctx.restore();
    ctx.globalAlpha = 1;
    const dot = (p, r, color, ring) => { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill(); if (ring) { ctx.strokeStyle = ring; ctx.lineWidth = 1.2; ctx.stroke(); } };
    const home = toMap(WORLD.door.x, WORLD.door.y + 10);
    ctx.fillStyle = COLORS.homeDoor; ctx.beginPath(); ctx.moveTo(home.x - 5, home.y + 1); ctx.lineTo(home.x, home.y - 5); ctx.lineTo(home.x + 5, home.y + 1); ctx.lineTo(home.x + 3.5, home.y + 1); ctx.lineTo(home.x + 3.5, home.y + 5); ctx.lineTo(home.x - 3.5, home.y + 5); ctx.lineTo(home.x - 3.5, home.y + 1); ctx.closePath(); ctx.fill();
    for (const pair of s.pairs) {
      const d = pair.dog;
      const color = d.character === 'angry' ? '#e03131' : d.character === 'grumpy' ? '#f59f00' : d.friend ? '#adb5bd' : '#2f9e44';
      dot(toMap(d.x, d.y), 2.4, color, '#fff');
    }
    const L = s.louis, lp = toMap(L.x, L.y);
    dot(lp, 3.6 + Math.sin(app.time * 6) * 0.6, '#d9480f', '#fff');
    ctx.restore();
  }
  function drawProgressRings(s, t) {
    const L = s.louis;
    const ring = (wx, wy, z, k, color) => {
      const p = P(wx, wy, z);
      ctx.strokeStyle = 'rgba(255,255,255,0.65)'; ctx.lineWidth = 3.5;
      ctx.beginPath(); ctx.arc(p.x, p.y, 8, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = color; ctx.beginPath(); ctx.arc(p.x, p.y, 8, -Math.PI / 2, -Math.PI / 2 + Math.min(1, k) * Math.PI * 2); ctx.stroke();
    };
    if (L.act) {
      const a = L.act;
      const total = { sniffPee: CFG.PEE_SNIFF_TIME, pee: CFG.PEE_TIME, sniffPoop: CFG.POOP_SNIFF_TIME, spin: CFG.POOP_SPIN_TIME, poop: CFG.POOP_TIME }[a.type];
      const col = a.type.indexOf('Pee') >= 0 || a.type === 'pee' ? '#f1c40f' : '#a0522d';
      ring(L.x, L.y, 58, a.t / total, col);
    }
    for (const pair of s.pairs) {
      const d = pair.dog;
      if (d.state === 'greet' && d.progress > 0) ring((d.x + L.x) / 2, (d.y + L.y) / 2, 50, d.progress / CFG.FRIEND_SNIFF_TIME, '#ff6b81');
    }
    const pet = (p, spot) => { if (p && p.progress > 0 && p.cd <= 0) ring(spot.x, spot.y, 60, p.progress / CFG.PET_TIME, '#ff6b81'); };
    s.sitters.forEach((st) => pet(st, st.spot));
    s.kids.forEach((k) => pet(k, k));
    // Запах на интересных местах
    for (const m of s.marks) {
      if (m.marked || m.sniffed || !m.scent || s.meters.pee >= 100) continue;
      if (G.dist(m.x, m.y, L.x, L.y) > (L.sniff > 0 ? 300 : 120)) continue;
      const p = P(m.x, m.y, 4);
      ctx.strokeStyle = 'rgba(241,196,15,0.55)'; ctx.lineWidth = 1.4;
      for (let i = 0; i < 2; i++) {
        ctx.beginPath();
        for (let k = 0; k < 6; k++) { const yy = p.y - k * 4 - ((t * 10) % 4); const xx = p.x - 4 + i * 8 + Math.sin(k + t * 3 + i) * 2.4; k ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy); }
        ctx.stroke();
      }
    }
  }

  function drawScentTrails(s, t) {
    const L = s.louis;
    const targets = s.items.filter((i) => i.group === 'treat').map((i) => ({ x: i.x, y: i.y, c: '255,159,67' }))
      .concat(s.marks.filter((m) => m.scent && !m.marked && !m.sniffed && s.meters.pee < 100).map((m) => ({ x: m.x, y: m.y, c: '241,196,15' })))
      .map((o) => ({ ...o, d: G.dist(o.x, o.y, L.x, L.y) })).filter((o) => o.d < 700).sort((a, b) => a.d - b.d).slice(0, 4);
    const k = Math.min(1, L.sniff / 0.6);
    targets.forEach((o, idx) => {
      const ux = (o.x - L.x) / o.d, uy = (o.y - L.y) / o.d, len = Math.min(o.d, 220);
      for (let d = 16; d < len; d += 12) {
        const wv = Math.sin(d * 0.06 - t * 6 + idx) * 6;
        const p = P(L.x + ux * d - uy * wv, L.y + uy * d + ux * wv, 3);
        ctx.fillStyle = `rgba(${o.c},${k * (1 - d / (len + 30)) * 0.9})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, 2.6 - d / len, 0, Math.PI * 2); ctx.fill();
      }
    });
  }

  function drawThought(s, t) {
    const L = s.louis;
    let icon = null;
    if (L.tempt) icon = L.tempt.kind;
    else if (L.carry) icon = 'give';
    else if (app.wishShow > 0 && !L.act) icon = app.wish;
    if (!icon) return;
    const p = P(L.x, L.y, 62);
    ctx.save(); ctx.translate(p.x + 14, p.y - 8); A.thought(ctx, icon, t); ctx.restore();
  }

  function drawNight(s) {
    const L = s.louis, o = octx, k = scale * VISUAL.NIGHT_RES;
    o.setTransform(1, 0, 0, 1, 0, 0);
    o.globalCompositeOperation = 'source-over';
    o.clearRect(0, 0, overlay.width, overlay.height);
    o.fillStyle = 'rgba(12,18,50,0.78)';
    o.fillRect(0, 0, overlay.width, overlay.height);
    o.globalCompositeOperation = 'destination-out';
    const light = (sx, sy, r, a = 1) => {
      const x = (sx - app.cam.x) * k, y = (sy - app.cam.y) * k, R = r * k;
      if (x < -R || y < -R || x > overlay.width + R || y > overlay.height + R) return;
      const g = o.createRadialGradient(x, y, 0, x, y, R);
      g.addColorStop(0, `rgba(0,0,0,${a})`); g.addColorStop(0.5, `rgba(0,0,0,${a * 0.7})`); g.addColorStop(1, 'rgba(0,0,0,0)');
      o.fillStyle = g; o.fillRect(x - R, y - R, R * 2, R * 2);
    };
    for (const l of WORLD.lamps) { const p = P(l.x, l.y, 30); light(p.x, p.y, 120); }
    const dp = P(WORLD.door.x, WORLD.door.y + 30, 20); light(dp.x, dp.y, 110);
    for (const w of litWindows) light(w.x, w.y, 26, 0.9);
    const lp = P(L.x, L.y, 14); light(lp.x, lp.y, 80, 0.8);
    for (const tr of WORLD.trees) { const p = P(tr.x, tr.y, 60); light(p.x, p.y, 70, 0.55); }
    const kp = P(WORLD.kiosk.x + WORLD.kiosk.w / 2, WORLD.kiosk.y + WORLD.kiosk.h + 20, 20); light(kp.x, kp.y, 120);
    const fp = P(WORLD.fountain.x, WORLD.fountain.y, 20); light(fp.x, fp.y, 90, 0.7);
    // Цветная подсветка деревьев в парке, как на фото, и тёплые фонари
    o.globalCompositeOperation = 'source-over';
    const tint = (sx, sy, r, color) => {
      const x = (sx - app.cam.x) * k, y = (sy - app.cam.y) * k, R = r * k;
      if (x < -R || y < -R || x > overlay.width + R || y > overlay.height + R) return;
      const g = o.createRadialGradient(x, y, 0, x, y, R);
      g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
      o.fillStyle = g; o.fillRect(x - R, y - R, R * 2, R * 2);
    };
    WORLD.trees.forEach((tr, i) => {
      if (tr.x < 1440 || tr.y < 1440) return;
      const p = P(tr.x, tr.y, 65); tint(p.x, p.y, 75, i % 3 === 0 ? 'rgba(255,90,170,0.26)' : i % 2 ? 'rgba(70,130,255,0.32)' : 'rgba(40,220,170,0.28)');
    });
    tint(kp.x, kp.y, 90, 'rgba(255,170,80,0.25)');
    for (const l of WORLD.lamps) { const p = P(l.x, l.y, 40); tint(p.x, p.y, 90, 'rgba(255,190,110,0.2)'); }
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.drawImage(overlay, 0, 0, overlay.width, overlay.height, 0, 0, overlay.width / VISUAL.NIGHT_RES, overlay.height / VISUAL.NIGHT_RES);
    ctx.restore();
  }

  function drawDoorArrow(t, good) {
    const dp = P(WORLD.safe.x, WORLD.safe.y);
    const p = toView(dp.x, dp.y);
    const m = 46, top = 150;
    if (p.x > m && p.x < W - m && p.y > top && p.y < H - m) return;
    const cx = W / 2, cy = H / 2, dx = p.x - cx, dy = p.y - cy;
    const kx = (W / 2 - m) / Math.abs(dx || 1e-6);
    const ky = dy < 0 ? (cy - top) / Math.abs(dy || 1e-6) : (H / 2 - m) / Math.abs(dy || 1e-6);
    const k = Math.min(kx, ky);
    const ax = cx + dx * k, ay = cy + dy * k, ang = Math.atan2(dy, dx), pulse = 1 + Math.sin(t * 8) * 0.08;
    ctx.save(); ctx.translate(ax, ay); ctx.scale(pulse, pulse);
    ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.beginPath(); ctx.arc(0, 0, 24, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = COLORS.homeDoor; ctx.fillRect(-7, -10, 14, 18);
    ctx.fillStyle = '#ffd43b'; ctx.beginPath(); ctx.arc(4, 0, 1.6, 0, Math.PI * 2); ctx.fill();
    ctx.rotate(ang); ctx.fillStyle = good ? '#2f9e44' : '#f08a24';
    ctx.beginPath(); ctx.moveTo(34, 0); ctx.lineTo(24, -9); ctx.lineTo(24, 9); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  /* ================================== Ввод ================================== */
  const joy = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
  const keys = new Set();
  function readInput() {
    let sx = 0, sy = 0, mag = 0, run = false;
    if (joy.id !== null) { sx = joy.x - joy.ox; sy = joy.y - joy.oy; mag = Math.min(1, Math.hypot(sx, sy) / VISUAL.JOY_RADIUS); }
    let kx = 0, ky = 0;
    if (keys.has('left')) kx -= 1;
    if (keys.has('right')) kx += 1;
    if (keys.has('up')) ky -= 1;
    if (keys.has('down')) ky += 1;
    if (kx || ky) { sx = kx; sy = ky; run = keys.has('run'); mag = run ? 1 : 0.75; }
    const w = G.toWorldDir(sx, sy);
    return { x: w.x, y: w.y, mag, run };
  }
  function drawJoystick() {
    if (joy.id === null) return;
    const R = VISUAL.JOY_RADIUS, dx = joy.x - joy.ox, dy = joy.y - joy.oy;
    const running = Math.hypot(dx, dy) / R >= CFG.RUN_DEFLECTION;
    ctx.fillStyle = 'rgba(255,255,255,0.16)'; ctx.beginPath(); ctx.arc(joy.ox, joy.oy, R, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = running ? 'rgba(255,146,43,0.9)' : 'rgba(255,255,255,0.85)';
    ctx.beginPath(); ctx.arc(joy.x, joy.y, 24, 0, Math.PI * 2); ctx.fill();
  }
  canvas.addEventListener('pointerdown', (e) => {
    ensureAudio();
    if (app.mode !== 'playing' || joy.id !== null) return;
    joy.id = e.pointerId; joy.ox = joy.x = e.clientX; joy.oy = joy.y = e.clientY;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerId !== joy.id) return;
    joy.x = e.clientX; joy.y = e.clientY;
    const dx = joy.x - joy.ox, dy = joy.y - joy.oy, len = Math.hypot(dx, dy), R = VISUAL.JOY_RADIUS;
    if (len > R) { joy.ox = joy.x - dx / len * R; joy.oy = joy.y - dy / len * R; }
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
  function doFu() {
    if (app.mode !== 'playing' || !app.walk) return;
    const s = app.walk;
    sfx.fu();
    say(s.owner, 'Фу!', 1, '#e03131');
    app.fuFlash = 0.3;
    if (G.sayFu(s)) { say(s.louis, 'Ну ладно...', 1.3); vibrate(15); }
  }
  ui.sniff.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); ensureAudio(); doSniff(); });
  ui.fu.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); ensureAudio(); doFu(); });
  const KEYMAP = { ArrowLeft: 'left', a: 'left', A: 'left', 'ф': 'left', ArrowRight: 'right', d: 'right', D: 'right', 'в': 'right',
    ArrowUp: 'up', w: 'up', W: 'up', 'ц': 'up', ArrowDown: 'down', s: 'down', S: 'down', 'ы': 'down', Shift: 'run' };
  window.addEventListener('keydown', (e) => {
    const k = KEYMAP[e.key];
    if (k) { keys.add(k); e.preventDefault(); ensureAudio(); return; }
    if (e.key === ' ' || e.key === 'e' || e.key === 'E') { e.preventDefault(); ensureAudio(); doSniff(); }
    else if (e.key === 'f' || e.key === 'F' || e.key === 'а' || e.key === 'Enter') { e.preventDefault(); doFu(); }
    else if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') { if (app.mode === 'playing') pauseGame(); else if (app.mode === 'paused') resumeGame(); }
    else if (e.key === 'm' || e.key === 'M') setMuted(!audio.muted);
  });
  window.addEventListener('keyup', (e) => { const k = KEYMAP[e.key]; if (k) keys.delete(k); });
  window.addEventListener('blur', () => { keys.clear(); joy.id = null; pauseGame(); });

  /* ================================ Экраны ================================ */
  function show(el, on) { el.classList.toggle('hidden', !on); }
  function renderMenu() {
    const p = app.progress;
    ui.stats.innerHTML = p.walks
      ? `<span><b>${p.walks}</b> прогулок</span><span><b>${p.perfect}</b> на три звезды</span><span>рекорд <b>${p.best}</b></span>`
      : '<span>Первая прогулка ждёт!</span>';
    ui.album.innerHTML = '';
    G.allDogNames().forEach((name) => {
      const known = p.friends.indexOf(name) >= 0;
      const ch = document.createElement('span');
      ch.className = 'chip' + (known ? '' : ' unknown');
      ch.textContent = known ? '🐾 ' + name : '???';
      ui.album.appendChild(ch);
    });
  }
  function makeDemo() {
    app.demo = G.createWalk(Math.random, { evening: false, wind: true });
    // В меню двор живёт сам: Луи с хозяином ещё дома
    app.demo.louis.x = app.demo.owner.x = 30;
    app.demo.louis.y = app.demo.owner.y = 30;
  }
  function showMenu() {
    app.mode = 'menu';
    app.walk = null;
    makeDemo();
    app.particles.length = 0; app.bubbles.length = 0;
    joy.id = null;
    show(ui.hud, false); show(ui.sniff, false); show(ui.fu, false);
    show(ui.pauseScreen, false); show(ui.result, false);
    renderMenu();
    show(ui.menu, true);
    prepareGround(app.demo);
  }
  function weatherText(w) {
    return (w.evening ? 'вечер' : 'день') + ', ' + (w.wind ? 'ветрено' : 'ясно');
  }
  function startWalk(opts) {
    app.walk = G.createWalk(Math.random, opts);
    app.demo = null;
    app.mode = 'playing';
    app.particles.length = 0; app.bubbles.length = 0; app.rings.length = 0;
    app.heartbeat = 0; app.wishT = 4; app.wishShow = 0; app.tutorialStep = 0; app.tutorialTimer = 0.8;
    app.toastNext = null; app.toastTimer = 0; app.toastGap = 0; app.toastPrio = 0;
    joy.id = null;
    prepareGround(app.walk);
    show(ui.menu, false); show(ui.result, false); show(ui.pauseScreen, false);
    show(ui.hud, true); show(ui.sniff, true); show(ui.fu, false);
    updateCamera(0, app.walk.louis, true);
    warmTiles();
    say(app.walk.louis, 'Гулять!', 1.8);
    say(app.walk.owner, 'Пошли, Луи!', 2);
    sfx.bark(false);
    toast(`Сегодня: ${weatherText(app.walk.weather)}. Три минуты на прогулку`, '', 2.8);
  }
  function pauseGame() {
    if (app.mode !== 'playing') return;
    app.mode = 'paused'; joy.id = null;
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
    app.endTimer = result.reason === 'done' ? 1.4 : result.reason === 'quit' ? 0.01 : 1.8;
    app.lastResult = result;
    joy.id = null;
    show(ui.sniff, false); show(ui.fu, false);
    const s = app.walk;
    if (result.reason === 'done') { say(s.louis, 'Домой!', 2); burst(s.louis.x, s.louis.y, 30, 'heart', 10, ['#ff6b81', '#ff8fa3']); sfx.done(); }
    else if (result.reason === 'timeout') { say(s.owner, 'Всё, пора домой!', 2); result.count < 4 ? sfx.sad() : sfx.done(); }
    if (result.reason !== 'quit') {
      const r = G.recordWalk(app.progress, result);
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
    const all = r.count === 4;
    ui.resultTitle.textContent = r.reason === 'quit' ? 'Прогулка прервана' : all && r.reason === 'done' ? 'Отличная прогулка!' : all ? 'Всё успели!' : r.count >= 2 ? 'Неплохо погуляли' : 'Ой-ой, дома беспорядок';
    ui.resultStars.innerHTML = [0, 1, 2].map((i) => `<span class="${i < r.stars ? '' : 'off'}">★</span>`).join('');
    ui.resultScore.textContent = String(r.score);
    show(ui.resultBest, !!r.isBest && r.score > 0);
    const line = (ok, okText, badText) => `<li class="${ok ? 'ok' : 'bad'}"><span>${ok ? '✓' : '✗'}</span><span>${ok ? okText : badText}</span></li>`;
    const rows = [
      line(r.done.pee, 'Пописал', 'Не пописал: лужа у двери'),
      line(r.done.poop, 'Покакал', 'Не покакал: сюрприз на коврике'),
      line(r.done.energy, 'Набегался', 'Не набегался: сгрыз тапки'),
      line(r.done.happy, 'Счастлив', 'Не нарадовался: грустит в кресле')
    ];
    if (r.friends.length) rows.push(`<li class="ok"><span>🐾</span><span>Друзья: ${r.friends.join(', ')}</span></li>`);
    if (r.newFriends && r.newFriends.length) rows.push(`<li class="ok"><span>★</span><span>Новые в альбоме: ${r.newFriends.join(', ')}</span></li>`);
    if (r.timeBonus) rows.push(`<li class="ok"><span>⏱</span><span>Вернулись раньше: +${r.timeBonus}</span></li>`);
    ui.resultRows.innerHTML = rows.join('');
    show(ui.result, true);
    app.homeT = 0;
    sizeHomeCanvas();
  }
  function sizeHomeCanvas() {
    const c = ui.homeCanvas, w = c.clientWidth || 320, h = c.clientHeight || 180, k = Math.min(window.devicePixelRatio || 1, 2);
    c.width = Math.round(w * k); c.height = Math.round(h * k);
    c._k = k; c._w = w; c._h = h;
  }
  function drawHome(dt) {
    if (app.mode !== 'result' || !app.lastResult) return;
    app.homeT += dt;
    const c = ui.homeCanvas, g = c.getContext('2d');
    g.setTransform(c._k, 0, 0, c._k, 0, 0);
    A.homeScene(g, c._w, c._h, app.lastResult, app.homeT);
  }
  ui.start.addEventListener('click', () => { ensureAudio(); sfx.click(); startWalk(); });
  ui.pause.addEventListener('click', (e) => { e.stopPropagation(); ensureAudio(); pauseGame(); });
  ui.resume.addEventListener('click', () => { sfx.click(); resumeGame(); });
  ui.quit.addEventListener('click', () => {
    sfx.click(); show(ui.pauseScreen, false);
    if (app.walk) { app.walk.over = true; endWalk(G.finishWalk(app.walk, 'quit')); }
  });
  ui.again.addEventListener('click', () => { ensureAudio(); sfx.click(); startWalk(); });
  ui.toMenu.addEventListener('click', () => { sfx.click(); showMenu(); });
  ui.mute.addEventListener('click', (e) => { e.stopPropagation(); ensureAudio(); setMuted(!audio.muted); });

  /* ============================== События прогулки ============================== */
  const pairOf = (s, id) => s.pairs.find((p) => p.id === id);
  const PEE_SAY = ['Моё!', 'Тут был Луи', 'Метка!'];
  function handleEvents(events) {
    const s = app.walk, L = s.louis, O = s.owner;
    for (const ev of events) {
      const pair = ev.pair ? pairOf(s, ev.pair) : null;
      switch (ev.type) {
        case 'treat': burst(ev.x, ev.y, 4, 'crumb', 10, ['#d99a5b', '#f8f1e5', '#c8553d']); sfx.chomp(); say(L, 'Ням!', 1.1); toast(`Нашёл ${CFG.ITEMS[ev.kind].name}!`, 'good', 1.4); break;
        case 'toy': sfx.squeak(); say(L, 'Моё!', 1.1); toast(`Нашёл ${CFG.ITEMS[ev.kind].name}! Принеси, и его кинут`, 'good', 2); break;
        case 'throw': sfx.throw(); say(O, 'Апорт!', 1.2); break;
        case 'fetch': sfx.squeak(); burst(ev.x, ev.y, 10, 'star', 8, ['#ffd43b', '#ffffff']); break;
        case 'pocket': say(O, 'Всё, в карман', 1.6); break;
        case 'tempt': say(L, 'О, что это?', 1.2); vibrate(20); break;
        case 'ateBad': sfx.chomp(); sfx.whine(); vibrate([40, 30, 40]); say(L, 'Ой, живот...', 1.8); say(O, 'Луи, нельзя!', 1.6); toast(`Съел ${CFG.ITEMS[ev.kind].name}! Болит живот, снова надо покакать`, 'danger', 2.6); break;
        case 'peeStart': sfx.pee(); break;
        case 'pee': say(L, PEE_SAY[Math.floor(Math.random() * PEE_SAY.length)], 1.2); if (ev.full) toast('Пописал как следует!', 'good', 1.6); break;
        case 'notHere': say(L, 'Не то...', 1.1); break;
        case 'poopStart': say(L, '...', 1); break;
        case 'poop': say(O, 'Молодец! Убираю', 1.8); toast('Покакал! За ним убрали пакетом', 'good', 1.8); break;
        case 'abort': say(L, 'Передумал', 1.2); break;
        case 'cleaned': burst(ev.x, ev.y, 6, 'star', 6, ['#69db7c', '#ffffff'], 40); break;
        case 'pile': sfx.leaves(); burst(ev.x, ev.y, 6, 'leaf', 26, A.LEAF_COLORS, 120); say(L, 'Ура-а!', 1); break;
        case 'scold': if (s.janitors[ev.janitor]) say(s.janitors[ev.janitor], 'Ах ты, хулиган!', 1.8); toast('Дворник ругается: опять разбросали кучу', '', 1.8); break;
        case 'wind': sfx.wind(); for (let i = 0; i < 36; i++) addParticle({ kind: 'wind', x: app.cam.x - 20 - Math.random() * 60, y: app.cam.y + Math.random() * viewH, vx: 180 + Math.random() * 120, vy: 0, life: 3, ttl: 3, size: 2.4 + Math.random() * 1.6, color: A.LEAF_COLORS[i % A.LEAF_COLORS.length], rot: Math.random() * 6, floor: 1e9 }); toast('Подул ветер и разметал кучи листьев', '', 1.6); break;
        case 'pigeons': sfx.flutter(); if (ev.chased) say(L, 'Гав!', 0.9); break;
        case 'cat': sfx.meow(); if (ev.chased) { sfx.bark(false); say(L, 'Кот!', 0.9); } break;
        case 'grandma': case 'sitter': {
          const st = s.sitters.find((x) => x.id === ev.id);
          if (ev.type === 'grandma') sfx.chomp(); else sfx.friend();
          if (st) { say(st, ev.type === 'grandma' ? 'Ути, какой кудрявый! Держи' : 'Ах ты мой хороший', 2); burst(st.x, st.y, 30, 'heart', 6, ['#ff6b81']); }
          break;
        }
        case 'kiosk': sfx.ding(); say(KIOSK_VENDOR, 'Держи, кудрявый!', 2); break;
        case 'ducks': sfx.quack(); if (ev.chased) { sfx.splash(); say(L, 'Гав-гав!', 0.9); } break;
        case 'courtBall': { sfx.kick(); burst(ev.x, ev.y, 6, 'star', 6, ['#ffd43b', '#ffffff'], 50); const kid = s.kids.find((k) => k.court); if (kid) say(kid, 'Пас, пёсик!', 1.4); break; }
        case 'hurdle': sfx.hop(); say(L, 'Хоп!', 0.8); break;
        case 'kid': { const kid = s.kids.find((k) => k.id === ev.id); if (kid) say(kid, 'Собачка!', 1.6); burst(L.x, L.y, 26, 'heart', 6, ['#ff6b81', '#ffc9d4']); sfx.friend(); break; }
        case 'pairEnter': break;
        case 'invite': if (pair) say(pair.owner, 'Можно познакомиться!', 2.2); break;
        case 'friend': if (pair) say(pair.dog, 'Гав!', 1); burst((pair ? pair.dog.x : L.x), (pair ? pair.dog.y : L.y), 26, 'heart', 12, ['#ff6b81', '#ff8fa3', '#ffc9d4']); sfx.friend(); sfx.bark(false, 0.35); say(L, 'Привет!', 1.3); toast(`Новый друг: ${ev.name}! Побегайте вместе`, 'good', 2); break;
        case 'playEnd': break;
        case 'warn': if (pair) say(pair.owner, 'Осторожно, он не любит собак!', 2.4); break;
        case 'notice': sfx.growl(); sfx.bark(true, 0.25); if (pair) say(pair.dog, 'Р-р-р!', 1); say(L, 'Ой...', 1.1); vibrate(30); toast(`${ev.name} рычит! Отойди подальше`, 'danger', 1.8); break;
        case 'held': if (pair) say(pair.owner, 'Фу! Сидеть!', 1.6); break;
        case 'chase': sfx.bark(true); if (pair) say(pair.owner, 'Стоять!', 1.6); toast(`${ev.name} сорвался! Беги к подъезду!`, 'danger', 2); break;
        case 'giveup': if (pair) say(pair.owner, 'Ко мне! Кому говорю!', 1.8); break;
        case 'back': break;
        case 'catch': sfx.bark(true); sfx.whine(); vibrate([60, 40, 110]); say(L, 'Ай-ай!', 1.3); say(O, 'Луи!', 1.2); toast('Луи испугался и бежит к подъезду', 'danger', 2.2); break;
        case 'yap': sfx.yap(); if (pair) say(pair.dog, 'Тяв-тяв!', 1.1); say(L, '!', 0.8); break;
        case 'allDone': sfx.done(); say(O, 'Всё сделали, домой!', 2.4); toast('Все четыре шкалы полные! Веди Луи к подъезду', 'good', 3); break;
        case 'end': endWalk(s.result); break;
        default: break;
      }
    }
  }

  /* ================================== Цикл ================================== */
  const METER_KEYS = ['pee', 'poop', 'energy', 'happy'];
  function updateHud() {
    const s = app.walk; if (!s) return;
    for (const k of METER_KEYS) {
      const v = Math.round(s.meters[k]);
      const el = ui.meters[k];
      el.style.setProperty('--v', v);
      el.classList.toggle('full', v >= 100);
    }
    const sec = Math.ceil(s.time);
    ui.timer.textContent = Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
    ui.timer.classList.toggle('urgent', s.time < 30);
    const L = s.louis, cdTotal = CFG.SNIFF_DURATION + CFG.SNIFF_COOLDOWN;
    ui.sniff.style.setProperty('--cd', L.sniff > 0 ? 0 : (L.sniffCd / cdTotal).toFixed(3));
    ui.sniff.classList.toggle('cooldown', L.sniffCd > 0 && L.sniff <= 0);
    ui.sniff.classList.toggle('active', L.sniff > 0);
    show(ui.fu, !!L.tempt);
  }
  function spawnFallingLeaves(dt) {
    app.leafT -= dt;
    if (app.leafT > 0) return;
    app.leafT = 0.35;
    const s = app.walk || app.demo; if (!s) return;
    // Листья падают с деревьев, что сейчас в кадре
    const inView = WORLD.trees.filter((tr) => { const p = P(tr.x, tr.y, 80); return p.x > app.cam.x - 60 && p.x < app.cam.x + viewW + 60 && p.y > app.cam.y - 100 && p.y < app.cam.y + viewH + 60; });
    if (!inView.length) return;
    const tr = inView[Math.floor(Math.random() * inView.length)];
    const p = P(tr.x, tr.y, 80);
    const base = P(tr.x, tr.y);
    addParticle({ kind: 'fall', x: p.x + (Math.random() - 0.5) * 40, y: p.y + (Math.random() - 0.5) * 20, vx: (Math.random() - 0.3) * 20 + (s.weather.wind ? 25 : 0), vy: 5,
      life: 6, ttl: 6, size: 2.4 + Math.random() * 1.4, color: A.LEAF_COLORS[Math.floor(Math.random() * A.LEAF_COLORS.length)], rot: Math.random() * 6, floor: base.y + 10 + Math.random() * 30 });
  }
  function update(dt) {
    app.time += dt;
    updateToast(dt);
    if (app.fuFlash > 0) app.fuFlash -= dt;
    if (app.mode === 'playing') {
      const s = app.walk;
      handleEvents(G.stepWalk(s, readInput(), dt));
      const L = s.louis;
      if (s.pairs.some((p) => p.dog.state === 'chase')) { app.heartbeat -= dt; if (app.heartbeat <= 0) { sfx.heartbeat(); app.heartbeat = 0.55; } } else app.heartbeat = 0;
      app.ambient -= dt;
      if (app.ambient <= 0) { sfx.chirp(s.weather.evening); app.ambient = 3 + Math.random() * 5; }
      app.wishT -= dt;
      if (app.wishShow > 0) app.wishShow -= dt;
      if (app.wishT <= 0) { app.wishT = VISUAL.WISH_EVERY; app.wish = G.currentWish(s); app.wishShow = VISUAL.WISH_SHOW; }
      if (app.tutorial && app.tutorialStep < TUTORIAL.length) {
        app.tutorialTimer -= dt;
        if (app.tutorialTimer <= 0 && app.toastTimer <= 0 && app.toastGap <= 0 && !app.toastNext) { toast(TUTORIAL[app.tutorialStep++], 'tutorial', 3.2); app.tutorialTimer = 4.5; }
      }
      updateCamera(dt, L, false);
      updateHud();
    } else if (app.mode === 'ending') {
      app.endTimer -= dt;
      updateCamera(dt, app.walk.louis, false);
      if (app.endTimer <= 0) showResult();
    } else if (app.mode === 'menu' && app.demo) {
      G.stepAmbient(app.demo, dt);
      // В меню камера медленно облетает район
      const k = app.time * 0.05;
      updateCamera(dt, { x: 1225 + Math.sin(k) * 650, y: 1225 + Math.cos(k * 0.8) * 650 }, false);
    }
    spawnFallingLeaves(dt);
    updateParticles(dt);
    drawHome(dt);
  }
  let last = performance.now();
  function frame(now) {
    let dt = (now - last) / 1000;
    last = now;
    if (dt < 0) dt = 0;
    if (dt > VISUAL.MAX_DT) dt = VISUAL.MAX_DT;
    update(dt);
    render();
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
  document.addEventListener('touchmove', (e) => { if (!e.target.closest('.screen')) e.preventDefault(); }, { passive: false });
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('dblclick', (e) => e.preventDefault());
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('resize', () => { resize(); if (app.mode === 'result') sizeHomeCanvas(); });
  window.addEventListener('orientationchange', () => setTimeout(resize, 120));

  if (/[?&]debug=1/.test(location.search)) window.__walk = { app, G, startWalk, showMenu };

  setMuted(audio.muted);
  makeDemo();
  resize();
  showMenu();
  updateCamera(0, { x: 1225, y: 1225 }, true);
  requestAnimationFrame((t) => { last = t; frame(t); });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch((err) => console.warn('SW registration failed', err));
    });
  }
})();
