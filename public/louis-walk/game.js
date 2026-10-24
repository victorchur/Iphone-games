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
    BG_MAX_PIXELS: 12e6,
    NIGHT_RES: 0.5,
    CAMERA_LERP: 6,
    JOY_RADIUS: 58,
    MAX_PARTICLES: 320,
    MAX_DT: 0.05,
    FLOOR_H: 42,
    WISH_EVERY: 7,
    WISH_SHOW: 2.4
  };
  const COLORS = {
    street: '#5d5a55', curb: '#8a857d', lawn: '#7f8f3c', lawnDark: '#6f7f33', lawnLight: '#93a24a',
    tile: '#a49b98', tileDark: '#958c89', tileLight: '#b3aaa6', sidewalk: '#8f8c88',
    rubber: '#3f7d6e', sand: '#e9d39a', wallA: '#e6d3bf', wallB: '#d2bea9', wallShade: '#c9b39d',
    roof: '#7b8487', roofEdge: '#5f676a', window: '#9fc4dc', windowFrame: '#f4efe8', windowLit: '#ffd27f',
    door: '#6b4630', homeDoor: '#7a3e1d', canopy: '#7d8a96', fence: '#2f4f3a'
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
  const BOUNDS = { x0: -WORLD.size * ISO.X - 80, x1: WORLD.size * ISO.X + 80, y0: -250, y1: 2 * WORLD.size * ISO.Y + 90 };
  let bg = null, bgScale = 1, bgKey = '';
  const overlay = document.createElement('canvas');
  const octx = overlay.getContext('2d');
  let litWindows = [];

  const app = {
    mode: 'menu', walk: null, demo: null, progress: G.loadProgress(safeStorage),
    cam: { x: -180, y: 80 }, time: 0, particles: [], bubbles: [], rings: [], drops: [],
    wishT: 3, wishShow: 0, wish: null, heartbeat: 0, ambient: 3, leafT: 0,
    tutorial: safeStorage.getItem(STORAGE_TUTORIAL) !== '1', tutorialStep: 0, tutorialTimer: 0,
    lastResult: null, endTimer: 0, homeT: 0, fuFlash: 0, toastTimer: 0
  };

  /* ================================== Звук ================================== */
  const audio = { ctx: null, master: null, noise: null, rain: null, muted: safeStorage.getItem(STORAGE_MUTE) === '1' };
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
  function startRain(on) {
    if (!audio.ctx) return;
    if (audio.rain) { try { audio.rain.src.stop(); } catch (e) { /* ignore */ } audio.rain = null; }
    if (!on || audio.muted) return;
    const c = audio.ctx, src = c.createBufferSource();
    src.buffer = audio.noise; src.loop = true;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1500;
    const g = c.createGain(); g.gain.value = 0.035;
    src.connect(f).connect(g).connect(audio.master);
    src.start();
    audio.rain = { src, g };
  }
  function setMuted(m) {
    audio.muted = m;
    safeStorage.setItem(STORAGE_MUTE, m ? '1' : '0');
    if (audio.master) audio.master.gain.value = m ? 0 : 0.9;
    ui.mute.classList.toggle('muted', m);
    ui.mute.setAttribute('aria-label', m ? 'Включить звук' : 'Выключить звук');
    ui.mute.setAttribute('aria-pressed', m ? 'true' : 'false');
    if (!m && app.walk && app.walk.weather.rain && !audio.rain) startRain(true);
    if (m) startRain(false);
  }
  function vibrate(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) { /* ignore */ } }

  /* ============================== Проекция ============================== */
  const P = (x, y, z = 0) => ({ x: (x - y) * ISO.X, y: (x + y) * ISO.Y - z });
  const depth = (x, y) => x + y;

  /* ============================== Фон: земля и дом ============================== */
  function paintBackground(s) {
    const weather = s ? s.weather : { rain: false, evening: false };
    const key = `${W}x${H}@${dpr}|${weather.evening ? 'e' : 'd'}${weather.rain ? 'r' : ''}`;
    if (key === bgKey && bg) return;
    bgKey = key;
    const bw = BOUNDS.x1 - BOUNDS.x0, bh = BOUNDS.y1 - BOUNDS.y0;
    let sc = scale * Math.min(dpr, VISUAL.BG_DPR_MAX);
    sc = Math.min(sc, Math.sqrt(VISUAL.BG_MAX_PIXELS / (bw * bh)));
    bgScale = sc;
    if (!bg) bg = document.createElement('canvas');
    bg.width = Math.ceil(bw * sc);
    bg.height = Math.ceil(bh * sc);
    const c = bg.getContext('2d');
    const rnd = A.mulberry32(77);
    const screenT = () => c.setTransform(sc, 0, 0, sc, -BOUNDS.x0 * sc, -BOUNDS.y0 * sc);
    const worldT = () => c.setTransform(ISO.X * sc, ISO.Y * sc, -ISO.X * sc, ISO.Y * sc, -BOUNDS.x0 * sc, -BOUNDS.y0 * sc);

    // Улица за забором
    screenT();
    c.fillStyle = COLORS.street;
    c.fillRect(BOUNDS.x0, BOUNDS.y0, bw, bh);
    worldT();
    c.fillStyle = COLORS.curb; c.fillRect(-40, -40, 1110, 1110);
    c.fillStyle = '#6e6a62'; c.fillRect(-40, -40, 1080, 1080);
    // Газон
    c.fillStyle = COLORS.lawn; c.fillRect(0, 0, 1000, 1000);
    for (let i = 0; i < 90; i++) {
      c.fillStyle = rnd() < 0.5 ? 'rgba(255,240,180,0.07)' : 'rgba(40,60,10,0.08)';
      c.beginPath(); c.ellipse(rnd() * 1000, rnd() * 1000, 30 + rnd() * 80, 20 + rnd() * 60, rnd() * 3, 0, Math.PI * 2); c.fill();
    }
    // Дорожки из плитки, как на фото
    for (const p of WORLD.paths) {
      c.fillStyle = p.y < 120 || p.x < 125 && p.w < 70 ? COLORS.sidewalk : COLORS.tile;
      c.fillRect(p.x, p.y, p.w, p.h);
      const tw = 22, th = 11;
      for (let ty = p.y; ty < p.y + p.h; ty += th) {
        const off = Math.floor((ty - p.y) / th) % 2 ? tw / 2 : 0;
        for (let tx = p.x - off; tx < p.x + p.w; tx += tw) {
          const x0 = Math.max(p.x, tx), x1 = Math.min(p.x + p.w, tx + tw), y1 = Math.min(p.y + p.h, ty + th);
          const v = rnd();
          c.fillStyle = v < 0.3 ? COLORS.tileDark : v > 0.8 ? COLORS.tileLight : 'rgba(0,0,0,0)';
          c.fillRect(x0 + 0.6, ty + 0.6, x1 - x0 - 1.2, y1 - ty - 1.2);
        }
      }
      c.strokeStyle = 'rgba(70,60,55,0.25)'; c.lineWidth = 0.8;
      c.strokeRect(p.x, p.y, p.w, p.h);
    }
    // Детская площадка
    const pg = WORLD.playground;
    c.fillStyle = '#d9d2c5'; c.fillRect(pg.x - 4, pg.y - 4, pg.w + 8, pg.h + 8);
    c.fillStyle = COLORS.rubber; c.fillRect(pg.x, pg.y, pg.w, pg.h);
    c.fillStyle = 'rgba(255,255,255,0.08)';
    for (let i = 0; i < 6; i++) c.fillRect(pg.x + 20 + i * 38, pg.y + 10, 14, pg.h - 20);
    const sb = WORLD.sandbox;
    c.fillStyle = '#a0683a'; c.fillRect(sb.x - 5, sb.y - 5, sb.w + 10, sb.h + 10);
    c.fillStyle = COLORS.sand; c.fillRect(sb.x, sb.y, sb.w, sb.h);
    // Пятна от меток будут рисоваться поверх, а здесь клумба у подъезда
    c.fillStyle = '#6d4c35'; c.fillRect(380, 118, 80, 40); c.fillRect(580, 118, 70, 40);

    // Опавшие листья: по экрану, чтобы не сплющивались
    screenT();
    for (let i = 0; i < 4200; i++) {
      let x, y;
      if (rnd() < 0.55) {
        const t = WORLD.trees[Math.floor(rnd() * WORLD.trees.length)];
        const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * 120;
        x = t.x + Math.cos(a) * d; y = t.y + Math.sin(a) * d;
      } else { x = rnd() * 1000; y = rnd() * 1000; }
      if (x < 2 || y < 2 || x > 998 || y > 998) continue;
      const onLawn = G.isLawn(x, y);
      if (!onLawn && rnd() < 0.8) continue;
      if (x < 120 || y < 112) continue;
      const p = P(x, y);
      A.leafShape(c, p.x, p.y, 2.2 + rnd() * 1.8, rnd() * 6, A.LEAF_COLORS[Math.floor(rnd() * A.LEAF_COLORS.length)]);
    }
    // Тени деревьев
    for (const t of WORLD.trees) {
      const p = P(t.x, t.y);
      c.fillStyle = 'rgba(30,40,10,0.18)';
      c.beginPath(); c.ellipse(p.x + 8, p.y + 2, 42, 18, 0, 0, Math.PI * 2); c.fill();
    }

    paintBuildings(c, screenT, weather.evening, rnd);
  }

  function paintBuildings(c, screenT, evening, rnd) {
    screenT();
    litWindows = [];
    const poly = (pts, color) => { c.fillStyle = color; c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y))); c.closePath(); c.fill(); };
    const Hb = 230, F = VISUAL.FLOOR_H;
    const A0 = WORLD.buildings[0], B0 = WORLD.buildings[1];
    const yA = A0.y + A0.h; // фасад дома A по y = 110
    const xB = B0.x + B0.w; // фасад дома B по x = 120

    // Крыши
    poly([P(0, 0, Hb), P(1000, 0, Hb), P(1000, yA, Hb), P(xB, yA, Hb), P(xB, 1000, Hb), P(0, 1000, Hb)], COLORS.roof);
    // Фасад B (смотрит вправо-вниз) и торец A
    poly([P(xB, yA, 0), P(xB, 1000, 0), P(xB, 1000, Hb), P(xB, yA, Hb)], COLORS.wallA);
    poly([P(1000, 0, 0), P(1000, yA, 0), P(1000, yA, Hb), P(1000, 0, Hb)], COLORS.wallA);
    // Фасад A (смотрит влево-вниз) и торец B
    poly([P(xB, yA, 0), P(1000, yA, 0), P(1000, yA, Hb), P(xB, yA, Hb)], COLORS.wallB);
    poly([P(0, 1000, 0), P(xB, 1000, 0), P(xB, 1000, Hb), P(0, 1000, Hb)], COLORS.wallB);
    // Цоколь и парапет
    poly([P(xB, yA, 0), P(1000, yA, 0), P(1000, yA, 14), P(xB, yA, 14)], '#a99582');
    poly([P(xB, yA, 0), P(xB, 1000, 0), P(xB, 1000, 14), P(xB, yA, 14)], '#b8a48f');
    c.strokeStyle = COLORS.roofEdge; c.lineWidth = 3;
    c.beginPath(); const e1 = P(xB, 1000, Hb), e2 = P(xB, yA, Hb), e3 = P(1000, yA, Hb);
    c.moveTo(e1.x, e1.y); c.lineTo(e2.x, e2.y); c.lineTo(e3.x, e3.y); c.stroke();

    const win = (pts, lit) => {
      poly(pts.frame, COLORS.windowFrame);
      poly(pts.glass, lit ? COLORS.windowLit : COLORS.window);
      if (lit) { const m = pts.glass.reduce((a, p) => ({ x: a.x + p.x / 4, y: a.y + p.y / 4 }), { x: 0, y: 0 }); litWindows.push(m); }
    };
    // Окна фасада A вдоль x
    const doorsA = A0.doorsAlongX;
    for (let f = 0; f < 5; f++) {
      for (let x = xB + 30; x < 980; x += 52) {
        if (f === 0 && doorsA.some((d) => Math.abs(d - (x + 14)) < 34)) continue;
        const z0 = 22 + f * F, z1 = z0 + 24, x0 = x, x1 = x + 28;
        const lit = evening && rnd() < 0.5;
        win({ frame: [P(x0 - 2, yA, z0 - 2), P(x1 + 2, yA, z0 - 2), P(x1 + 2, yA, z1 + 2), P(x0 - 2, yA, z1 + 2)],
          glass: [P(x0, yA, z0), P(x1, yA, z0), P(x1, yA, z1), P(x0, yA, z1)] }, lit);
      }
    }
    // Окна фасада B вдоль y
    for (let f = 0; f < 5; f++) {
      for (let y = yA + 30; y < 980; y += 52) {
        if (f === 0 && B0.doorsAlongY.some((d) => Math.abs(d - (y + 14)) < 34)) continue;
        const z0 = 22 + f * F, z1 = z0 + 24, y0 = y, y1 = y + 28;
        const lit = evening && rnd() < 0.5;
        win({ frame: [P(xB, y0 - 2, z0 - 2), P(xB, y1 + 2, z0 - 2), P(xB, y1 + 2, z1 + 2), P(xB, y0 - 2, z1 + 2)],
          glass: [P(xB, y0, z0), P(xB, y1, z0), P(xB, y1, z1), P(xB, y0, z1)] }, lit);
      }
    }
    // Подъезды
    for (const dx of doorsA) {
      const home = dx === WORLD.door.x;
      poly([P(dx - 16, yA, 0), P(dx + 16, yA, 0), P(dx + 16, yA, 40), P(dx - 16, yA, 40)], home ? COLORS.homeDoor : COLORS.door);
      poly([P(dx - 12, yA, 4), P(dx - 1, yA, 4), P(dx - 1, yA, 36), P(dx - 12, yA, 36)], 'rgba(255,255,255,0.08)');
      A.isoBox(c, P, dx - 24, yA, 48, 14, 44, 48, '#8c99a5', '#6f7b86', '#7d8a96');
      A.isoBox(c, P, dx - 20, yA, 40, 12, 0, 4, '#c8c8c8', '#b0b0b0', '#bdbdbd');
      if (home) {
        const plate = P(dx, yA, 56);
        c.fillStyle = '#1c7ed6'; c.fillRect(plate.x - 7, plate.y - 5, 14, 10);
        c.fillStyle = '#fff'; c.font = 'bold 8px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('1', plate.x, plate.y + 0.5);
        const lamp = P(dx + 22, yA, 40);
        c.fillStyle = evening ? '#fff3bf' : '#e9ecef'; c.beginPath(); c.arc(lamp.x, lamp.y, 3, 0, Math.PI * 2); c.fill();
      }
    }
    for (const dy of B0.doorsAlongY) {
      poly([P(xB, dy - 16, 0), P(xB, dy + 16, 0), P(xB, dy + 16, 40), P(xB, dy - 16, 40)], COLORS.door);
      A.isoBox(c, P, xB, dy - 24, 14, 48, 44, 48, '#8c99a5', '#6f7b86', '#7d8a96');
    }
  }

  /* ============================== Камера и размеры ============================== */
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, VISUAL.DPR_MAX);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    overlay.width = Math.ceil(W * VISUAL.NIGHT_RES); overlay.height = Math.ceil(H * VISUAL.NIGHT_RES);
    scale = Math.min(W / VISUAL.VIEW_WIDTH, H / 520);
    viewW = W / scale; viewH = H / scale;
    bgKey = '';
    paintBackground(app.walk || app.demo);
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

  function say(owner, text, ttl = 1.8, color) {
    app.bubbles = app.bubbles.filter((b) => b.owner !== owner);
    app.bubbles.push({ owner, text, life: ttl, ttl, color });
  }
  function bubbleHeight(owner) {
    const s = app.walk || app.demo;
    if (!s) return 40;
    if (owner === s.louis) return 52;
    if (owner === s.owner || owner === s.janitor) return 80;
    if (owner === s.grandma) return 66;
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

  function toast(text, kind = '', dur = 2.2) {
    ui.toast.textContent = text;
    ui.toast.className = 'toast show' + (kind ? ' ' + kind : '');
    app.toastTimer = dur;
  }
  const TUTORIAL = [
    'Веди пальцем по экрану, Луи пойдёт следом. Тяни дальше - побежит',
    'Шкалы вверху: пописать, покакать, побегать и порадоваться',
    'Остановись у дерева или столба - Луи понюхает и пометит',
    'Тянется к гадости? Жми «Фу»!',
    'Злая собака? Беги к подъезду, туда она не пойдёт'
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
      A.isoBox(c, P, s.x, s.y, s.w, s.h, 6, 22, s.color, dark, mid);
      A.isoBox(c, P, s.x + 8, s.y + 22, s.w - 16, s.h - 44, 22, 36, '#9fbfd6', '#6f8fa6', '#86a6bd');
      for (const [wx, wy] of [[s.x + s.w, s.y + 18], [s.x + s.w, s.y + s.h - 18], [s.x + 12, s.y + s.h], [s.x + s.w - 12, s.y + s.h]]) {
        const p = P(wx, wy, 6); c.fillStyle = '#1e1e1e'; c.beginPath(); c.ellipse(p.x, p.y, 6, 5, 0, 0, Math.PI * 2); c.fill();
      }
      const hl = P(s.x + s.w, s.y + s.h - 4, 16);
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
      c.fillStyle = '#e74c3c';
      const q = [P(s.x, s.y + 14, 34), P(s.x + s.w, s.y + 14, 34), P(s.x + s.w, s.y + s.h, 3), P(s.x, s.y + s.h, 3)];
      c.beginPath(); q.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y))); c.closePath(); c.fill();
      c.fillStyle = '#c0392b';
      const side = [P(s.x + s.w, s.y + 14, 34), P(s.x + s.w, s.y + s.h, 3), P(s.x + s.w, s.y + s.h, 0), P(s.x + s.w, s.y + 14, 30)];
      c.beginPath(); side.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y))); c.closePath(); c.fill();
    }
  }
  function shade(hex, k) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const f = (v) => Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k);
    r = f(r); g = f(g); b = f(b);
    return `rgb(${r},${g},${b})`;
  }

  function render() {
    const s = app.walk || app.demo;
    const t = app.time;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = COLORS.street;
    ctx.fillRect(0, 0, W, H);
    if (!s) return;
    const night = s.weather.evening;

    // Фон
    if (bg) {
      let sx = app.cam.x - BOUNDS.x0, sy = app.cam.y - BOUNDS.y0, sw = viewW, sh = viewH, dx = 0, dy = 0;
      if (sx < 0) { dx = -sx; sw += sx; sx = 0; }
      if (sy < 0) { dy = -sy; sh += sy; sy = 0; }
      sw = Math.min(sw, bg.width / bgScale - sx); sh = Math.min(sh, bg.height / bgScale - sy);
      if (sw > 0 && sh > 0) ctx.drawImage(bg, sx * bgScale, sy * bgScale, sw * bgScale, sh * bgScale, dx * scale, dy * scale, sw * scale, sh * scale);
    }
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, -app.cam.x * dpr * scale, -app.cam.y * dpr * scale);
    const vx0 = app.cam.x - 80, vx1 = app.cam.x + viewW + 80, vy0 = app.cam.y - 40, vy1 = app.cam.y + viewH + 160;
    const vis = (wx, wy) => { const p = P(wx, wy); return p.x > vx0 && p.x < vx1 && p.y > vy0 && p.y < vy1; };
    const L = s.louis, O = s.owner;

    // Земля: лужи, следы меток, зона подъезда
    if (s.weather.rain) {
      for (const q of WORLD.puddles) {
        if (!vis(q.x, q.y)) continue;
        ctx.save();
        ctx.setTransform(dpr * scale * ISO.X, dpr * scale * ISO.Y, -dpr * scale * ISO.X, dpr * scale * ISO.Y, -app.cam.x * dpr * scale, -app.cam.y * dpr * scale);
        ctx.fillStyle = 'rgba(80,100,125,0.6)';
        ctx.beginPath(); ctx.ellipse(q.x, q.y, q.rx, q.ry, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(220,235,255,0.35)'; ctx.lineWidth = 1.2;
        const k = (t * 0.8 + q.x) % 1;
        ctx.beginPath(); ctx.ellipse(q.x + (q.rx * 0.3), q.y, q.rx * 0.6 * k, q.ry * 0.6 * k, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
    }
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

    // Объекты по глубине
    const list = [];
    const push = (x, y, f, bias = 0) => list.push({ d: depth(x, y) + bias, f });
    WORLD.trees.forEach((tr, i) => { if (vis(tr.x, tr.y)) push(tr.x, tr.y, () => { const p = P(tr.x, tr.y); ctx.save(); ctx.translate(p.x, p.y); A.tree(ctx, tr.type, { t, seed: 50 + i, wind: s.weather.wind }); ctx.restore(); }); });
    WORLD.bushes.forEach((b, i) => {
      if (!vis(b.x, b.y)) return;
      const inside = G.dist(L.x, L.y, b.x, b.y) < b.r + 8;
      push(b.x, b.y + b.r * 0.4, () => { const p = P(b.x, b.y); ctx.save(); ctx.translate(p.x, p.y); A.bush(ctx, b.r, 200 + i, inside ? 0.6 : 1); ctx.restore(); });
    });
    WORLD.lamps.forEach((l) => { if (vis(l.x, l.y)) push(l.x, l.y, () => { const p = P(l.x, l.y); ctx.save(); ctx.translate(p.x, p.y); A.lamp(ctx, true, night); ctx.restore(); }); });
    WORLD.pumpkins.forEach((pk) => push(pk.x, pk.y, () => { const p = P(pk.x, pk.y); ctx.save(); ctx.translate(p.x, p.y); A.pumpkin(ctx, pk.r); ctx.restore(); }));
    WORLD.solids.forEach((so) => { if (so.kind !== 'building' && vis(so.x + so.w / 2, so.y + so.h / 2)) push(so.x + so.w / 2, so.y + so.h / 2, () => drawSolid(ctx, so, night)); });
    s.piles.forEach((pl, i) => { if (vis(pl.x, pl.y)) push(pl.x, pl.y, () => { const p = P(pl.x, pl.y); ctx.save(); ctx.translate(p.x, p.y); A.leafPile(ctx, pl.size, 400 + i); ctx.restore(); }, -6); });
    s.poops.forEach((pp) => push(pp.x, pp.y, () => { const p = P(pp.x, pp.y); ctx.save(); ctx.translate(p.x, p.y); A.poopPile(ctx); ctx.restore(); }, -4));
    s.items.forEach((it) => {
      if (it.state === 'carried' || (!it.revealed && it.group === 'treat')) return;
      if (!vis(it.x, it.y)) return;
      push(it.x, it.y, () => {
        const p = P(it.x, it.y);
        ctx.save(); ctx.translate(p.x, p.y); A.item(ctx, it.kind, t, it.id, it.z); ctx.restore();
        if (it.group === 'bad' && L.tempt === it) { ctx.fillStyle = 'rgba(231,76,60,0.9)'; ctx.font = 'bold 13px system-ui'; ctx.textAlign = 'center'; ctx.fillText('!', p.x, p.y - 14 - Math.abs(Math.sin(t * 8)) * 3); }
      }, -3);
    });
    s.flocks.forEach((f) => {
      f.birds.forEach((b, i) => {
        const fly = f.state === 'fly';
        const k = fly ? Math.min(1, f.t / CFG.PIGEON_FLY_TIME) : 0;
        const z = fly ? Math.sin(k * Math.PI) * 90 + (k < 0.5 ? 0 : 0) : 0;
        const bx = f.x + b.ox, by = f.y + b.oy;
        if (!vis(bx, by)) return;
        push(bx, by, () => { const p = P(bx, by); ctx.save(); ctx.translate(p.x, p.y); A.pigeon(ctx, { flying: fly, z, t, ph: b.ph, facing: fly ? (f.to.x - f.to.y > f.from.x - f.from.y ? 1 : -1) : (i % 2 ? 1 : -1) }); ctx.restore(); });
      });
    });
    s.cats.forEach((cat) => {
      if (!vis(cat.x, cat.y)) return;
      push(cat.x, cat.y, () => { const p = P(cat.x, cat.y); ctx.save(); ctx.translate(p.x, p.y); A.cat(ctx, cat.color, { facing: cat.facing, pose: cat.state === 'sit' || cat.state === 'perch' ? 'sit' : 'run', t, phase: cat.phase, z: cat.z }); ctx.restore(); }, cat.state === 'perch' || cat.z > 10 ? 120 : 0);
    });
    if (s.grandma) {
      const gm = s.grandma;
      push(gm.x, gm.y, () => { const p = P(gm.x, gm.y); ctx.save(); ctx.translate(p.x, p.y); A.person(ctx, 'grandma', { facing: 1, phase: 0, moving: 0, t, pose: 'sit' }); ctx.restore(); }, 2);
    }
    s.kids.forEach((k) => { if (vis(k.x, k.y)) push(k.x, k.y, () => { const p = P(k.x, k.y); ctx.save(); ctx.translate(p.x, p.y); A.person(ctx, k.look, { facing: k.facing, phase: k.phase, moving: Math.min(1, k.speed / 40), t, pose: k.speed > 5 ? 'walk' : 'stand' }); ctx.restore(); }); });
    if (s.janitor) {
      const J = s.janitor;
      if (vis(J.x, J.y)) push(J.x, J.y, () => { const p = P(J.x, J.y); ctx.save(); ctx.translate(p.x, p.y); A.person(ctx, 'janitor', { facing: J.facing, phase: J.phase, moving: Math.min(1, J.speed / 40), t, pose: J.sweeping ? 'sweep' : J.speed > 5 ? 'walk' : 'stand', holding: 'broom' }); ctx.restore(); });
    }
    const leashes = [];
    s.pairs.forEach((pair) => {
      const o = pair.owner, d = pair.dog;
      const ref = { hand: null, collar: null };
      if (vis(o.x, o.y) || vis(d.x, d.y)) {
        push(o.x, o.y, () => { const p = P(o.x, o.y); ctx.save(); ctx.translate(p.x, p.y); const h = A.person(ctx, o.look, { facing: o.facing, phase: o.phase, moving: Math.min(1, o.speed / 40), t, pose: d.state === 'chase' ? 'call' : o.speed > 5 ? 'walk' : 'stand', holding: d.state === 'chase' || d.state === 'return' ? null : 'leash' }); ctx.restore(); ref.hand = { x: p.x + h.x, y: p.y + h.y }; });
        push(d.x, d.y, () => {
          const p = P(d.x, d.y); ctx.save(); ctx.translate(p.x, p.y);
          const angry = d.character === 'angry' && (d.state === 'alert' || d.state === 'chase');
          const col = A.dog(ctx, d.look, { facing: d.facing, phase: d.phase, moving: Math.min(1, d.speed / 60), t: t + d.r, wag: d.character === 'friendly', angry: angry || d.yap > 0, hackles: d.character === 'angry', sniff: d.state === 'greet' && d.progress > 0 });
          ctx.restore();
          ref.collar = { x: p.x + col.x, y: p.y + col.y };
          if (angry) { ctx.fillStyle = '#e03131'; ctx.beginPath(); ctx.arc(p.x, p.y - 46 * (A.DOGS[d.look].scale), 8, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = 'bold 12px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('!', p.x, p.y - 46 * A.DOGS[d.look].scale + 0.5); }
        });
        leashes.push({ ref, free: d.state === 'chase' || d.state === 'return', dog: d });
      }
    });
    const louisRef = { ring: null, hand: null };
    if (app.walk) push(O.x, O.y, () => {
      const p = P(O.x, O.y); ctx.save(); ctx.translate(p.x, p.y);
      // Хозяин впереди Луи и заслоняет его - делаем полупрозрачным
      const lp = P(L.x, L.y);
      if (depth(O.x, O.y) > depth(L.x, L.y) && Math.abs(lp.x - p.x) < 26 && lp.y < p.y + 4 && lp.y > p.y - 70) ctx.globalAlpha = 0.55;
      const pickup = O.act && O.act.type === 'pickup' && O.act.t > 0;
      const h = A.person(ctx, O.look, { facing: O.facing, phase: O.phase, moving: Math.min(1, O.speed / 50), t: O.act && O.act.type === 'throw' ? 0.45 - O.act.t : t, pose: O.act && O.act.type === 'throw' ? 'throw' : pickup ? 'bend' : O.speed > 5 ? 'walk' : 'stand', holding: pickup ? 'bag' : 'leash' });
      ctx.restore();
      louisRef.hand = { x: p.x + h.x, y: p.y + h.y };
    });
    if (app.walk) push(L.x, L.y, () => {
      const p = P(L.x, L.y); ctx.save(); ctx.translate(p.x, p.y);
      const ps = pose(L);
      let facing = L.facing;
      if (L.act && L.act.type === 'spin') facing = Math.sin(L.act.t * 12) > 0 ? 1 : -1;
      const expr = L.panic > 0 || L.fear > 0.5 ? 'scared' : s.meters.happy > 60 || L.running ? 'happy' : 'neutral';
      const ring = A.louis(ctx, { facing, phase: L.phase, moving: L.act && L.act.type === 'spin' ? 1 : Math.min(1, L.speed / 80), t, pose: ps, expr, dirty: L.dirty, carry: L.carry ? L.carry.kind : null, jump: L.jump });
      ctx.restore();
      louisRef.ring = { x: p.x + ring.x, y: p.y + ring.y };
      if (L.act && L.act.type === 'pee' && Math.random() < 0.6) {
        const dir = L.facing;
        addParticle({ kind: 'drop', x: p.x - dir * 9, y: p.y - 9, vx: -dir * 40, vy: -10, life: 0.25, ttl: 0.25, size: 1.5, color: 'rgba(240,200,60,0.85)', rot: 0, floor: p.y });
      }
    });
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

    drawFence(night);
    drawProgressRings(s, t);
    drawParticles(ctx);
    drawBubbles(ctx);
    if (app.walk) drawThought(s, t);

    if (night) drawNight(s);
    if (s.weather.rain) drawRain();

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (app.walk) {
      if (L.fear > 0.05) {
        const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
        g.addColorStop(0, 'rgba(200,0,0,0)'); g.addColorStop(1, `rgba(200,20,20,${L.fear * 0.4})`);
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      }
      if (s.allDone || L.panic > 0 || s.pairs.some((p) => p.dog.state === 'chase' || p.dog.state === 'alert')) drawDoorArrow(t, s.allDone);
      drawJoystick();
    }
  }

  function drawFence(night) {
    const posts = [];
    for (let y = 40; y <= 1000; y += 60) posts.push({ x: 1000, y });
    for (let x = 40; x < 1000; x += 60) posts.push({ x, y: 1000 });
    const gateOK = (p) => !WORLD.gates.some((g) => G.dist(g.x, g.y, p.x, p.y) < 40);
    ctx.strokeStyle = COLORS.fence; ctx.lineWidth = 1.6;
    const rail = (z) => {
      ctx.beginPath();
      let pen = false;
      for (let y = 0; y <= 1000; y += 10) { const ok = gateOK({ x: 1000, y }); const p = P(1000, y, z); if (ok) { pen ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); pen = true; } else pen = false; }
      pen = false;
      for (let x = 1000; x >= 0; x -= 10) { const ok = gateOK({ x, y: 1000 }); const p = P(x, 1000, z); if (ok) { pen ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); pen = true; } else pen = false; }
      ctx.stroke();
    };
    rail(10); rail(22);
    ctx.fillStyle = COLORS.fence;
    for (const p of posts) { if (!gateOK(p)) continue; const a = P(p.x, p.y, 0), b = P(p.x, p.y, 26); ctx.fillRect(a.x - 1.2, b.y, 2.4, a.y - b.y); }
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
    pet(s.grandma, WORLD.grandmaSpot);
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
    // Цветная подсветка деревьев, как в парке на фото, и тёплые фонари
    o.globalCompositeOperation = 'source-over';
    const tint = (sx, sy, r, color) => {
      const x = (sx - app.cam.x) * k, y = (sy - app.cam.y) * k, R = r * k;
      if (x < -R || y < -R || x > overlay.width + R || y > overlay.height + R) return;
      const g = o.createRadialGradient(x, y, 0, x, y, R);
      g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
      o.fillStyle = g; o.fillRect(x - R, y - R, R * 2, R * 2);
    };
    WORLD.trees.forEach((tr, i) => { const p = P(tr.x, tr.y, 65); tint(p.x, p.y, 75, i % 2 ? 'rgba(70,130,255,0.32)' : 'rgba(40,220,170,0.28)'); });
    for (const l of WORLD.lamps) { const p = P(l.x, l.y, 40); tint(p.x, p.y, 90, 'rgba(255,190,110,0.2)'); }
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.drawImage(overlay, 0, 0, overlay.width, overlay.height, 0, 0, overlay.width / VISUAL.NIGHT_RES, overlay.height / VISUAL.NIGHT_RES);
    ctx.restore();
  }

  function drawRain() {
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = 'rgba(40,55,75,0.16)';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(210,225,245,0.45)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (const d of app.drops) { ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - 3, d.y + 11); }
    ctx.stroke();
    ctx.restore();
  }
  function updateRain(dt) {
    const s = app.walk || app.demo;
    if (!s || !s.weather.rain) { app.drops.length = 0; return; }
    while (app.drops.length < 110) app.drops.push({ x: Math.random() * (W + 40), y: Math.random() * H, v: 420 + Math.random() * 200 });
    for (const d of app.drops) { d.y += d.v * dt; d.x -= d.v * 0.25 * dt; if (d.y > H) { d.y = -12; d.x = Math.random() * (W + 40); } }
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
    app.demo = G.createWalk(Math.random, { rain: false, evening: false, wind: true });
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
    startRain(false);
    show(ui.hud, false); show(ui.sniff, false); show(ui.fu, false);
    show(ui.pauseScreen, false); show(ui.result, false);
    renderMenu();
    show(ui.menu, true);
    paintBackground(app.demo);
  }
  function weatherText(w) {
    const parts = [w.evening ? 'вечер' : 'день'];
    if (w.rain) parts.push('дождь'); else if (w.wind) parts.push('ветрено'); else parts.push('ясно');
    return parts.join(', ');
  }
  function startWalk(opts) {
    app.walk = G.createWalk(Math.random, opts);
    app.demo = null;
    app.mode = 'playing';
    app.particles.length = 0; app.bubbles.length = 0; app.rings.length = 0;
    app.heartbeat = 0; app.wishT = 4; app.wishShow = 0; app.tutorialStep = 0; app.tutorialTimer = 0.8;
    joy.id = null;
    paintBackground(app.walk);
    show(ui.menu, false); show(ui.result, false); show(ui.pauseScreen, false);
    show(ui.hud, true); show(ui.sniff, true); show(ui.fu, false);
    updateCamera(0, app.walk.louis, true);
    say(app.walk.louis, 'Гулять!', 1.8);
    say(app.walk.owner, 'Пошли, Луи!', 2);
    sfx.bark(false);
    startRain(app.walk.weather.rain);
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
    startRain(false);
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
    if (r.dirty) rows.push('<li class="bad"><span>🛁</span><span>Лазил по лужам: мыть лапы</span></li>');
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
        case 'scold': if (s.janitor) say(s.janitor, 'Ах ты, хулиган!', 1.8); toast('Дворник ругается: опять разбросали кучу', '', 1.8); break;
        case 'wind': sfx.wind(); for (let i = 0; i < 36; i++) addParticle({ kind: 'wind', x: app.cam.x - 20 - Math.random() * 60, y: app.cam.y + Math.random() * viewH, vx: 180 + Math.random() * 120, vy: 0, life: 3, ttl: 3, size: 2.4 + Math.random() * 1.6, color: A.LEAF_COLORS[i % A.LEAF_COLORS.length], rot: Math.random() * 6, floor: 1e9 }); toast('Подул ветер и разметал кучи листьев', '', 1.6); break;
        case 'puddle': sfx.splash(); burst(ev.x, ev.y, 2, 'crumb', 10, ['#b0c4de', '#dbe7f5'], 60); if (ev.first) say(O, 'Ну вот, лапы мыть...', 1.8); break;
        case 'pigeons': sfx.flutter(); if (ev.chased) say(L, 'Гав!', 0.9); break;
        case 'cat': sfx.meow(); if (ev.chased) { sfx.bark(false); say(L, 'Кот!', 0.9); } break;
        case 'grandma': sfx.chomp(); if (s.grandma) say(s.grandma, 'Ути, какой кудрявый!', 2); burst(s.grandma.x, s.grandma.y, 30, 'heart', 6, ['#ff6b81']); break;
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
    const tr = WORLD.trees[Math.floor(Math.random() * WORLD.trees.length)];
    const p = P(tr.x, tr.y, 80);
    if (p.x < app.cam.x - 60 || p.x > app.cam.x + viewW + 60 || p.y < app.cam.y - 100 || p.y > app.cam.y + viewH + 60) return;
    const base = P(tr.x, tr.y);
    addParticle({ kind: 'fall', x: p.x + (Math.random() - 0.5) * 40, y: p.y + (Math.random() - 0.5) * 20, vx: (Math.random() - 0.3) * 20 + (s.weather.wind ? 25 : 0), vy: 5,
      life: 6, ttl: 6, size: 2.4 + Math.random() * 1.4, color: A.LEAF_COLORS[Math.floor(Math.random() * A.LEAF_COLORS.length)], rot: Math.random() * 6, floor: base.y + 10 + Math.random() * 30 });
  }
  function update(dt) {
    app.time += dt;
    if (app.toastTimer > 0) { app.toastTimer -= dt; if (app.toastTimer <= 0) ui.toast.classList.remove('show'); }
    if (app.fuFlash > 0) app.fuFlash -= dt;
    if (app.mode === 'playing') {
      const s = app.walk;
      handleEvents(G.stepWalk(s, readInput(), dt));
      const L = s.louis;
      if (s.pairs.some((p) => p.dog.state === 'chase')) { app.heartbeat -= dt; if (app.heartbeat <= 0) { sfx.heartbeat(); app.heartbeat = 0.55; } } else app.heartbeat = 0;
      app.ambient -= dt;
      if (app.ambient <= 0) { if (!s.weather.rain) sfx.chirp(s.weather.evening); app.ambient = 3 + Math.random() * 5; }
      app.wishT -= dt;
      if (app.wishShow > 0) app.wishShow -= dt;
      if (app.wishT <= 0) { app.wishT = VISUAL.WISH_EVERY; app.wish = G.currentWish(s); app.wishShow = VISUAL.WISH_SHOW; }
      if (app.tutorial && app.tutorialStep < TUTORIAL.length) {
        app.tutorialTimer -= dt;
        if (app.tutorialTimer <= 0 && app.toastTimer <= 0) { toast(TUTORIAL[app.tutorialStep++], '', 3.2); app.tutorialTimer = 3.8; }
      }
      updateCamera(dt, L, false);
      updateHud();
    } else if (app.mode === 'ending') {
      app.endTimer -= dt;
      updateCamera(dt, app.walk.louis, false);
      if (app.endTimer <= 0) showResult();
    } else if (app.mode === 'menu' && app.demo) {
      G.stepAmbient(app.demo, dt);
      const k = app.time * 0.06;
      updateCamera(dt, { x: 560 + Math.sin(k) * 260, y: 560 + Math.cos(k * 0.8) * 260 }, false);
    }
    spawnFallingLeaves(dt);
    updateRain(dt);
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
  updateCamera(0, { x: 560, y: 560 }, true);
  requestAnimationFrame((t) => { last = t; frame(t); });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch((err) => console.warn('SW registration failed', err));
    });
  }
})();
