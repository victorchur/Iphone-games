/*
 * Neon Runner - игровой цикл, рендер на Canvas 2D, ввод, звук, эффекты.
 * Баланс настраивается в logic.js (объект CONFIG).
 */
(() => {
  'use strict';

  const L = window.NeonLogic;
  const CONFIG = L.CONFIG;

  /* ---------------- Визуальные настройки (не влияют на баланс) ---------------- */
  const COLORS = {
    bg: '#07000f',
    bgTop: '#15052e',
    cyan: '#00f0ff',
    magenta: '#ff2bd6',
    gold: '#ffd43b',
    violet: '#7a2cff',
    white: '#ffffff'
  };
  const GRID_STEP = 0.1;      // шаг горизонтальной сетки, доли экрана
  const STREAK_COUNT = 36;    // количество фоновых "полос скорости"
  const MAX_PARTICLES = 320;
  const STORAGE_BEST = 'neon-runner-best';
  const STORAGE_MUTE = 'neon-runner-muted';

  /* ------------------------------- DOM ------------------------------- */
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d', { alpha: false });
  const $ = (id) => document.getElementById(id);
  const ui = {
    score: $('score'),
    best: $('best'),
    coins: $('coins-value'),
    mute: $('mute'),
    start: $('overlay-start'),
    startBest: $('start-best'),
    pause: $('overlay-pause'),
    over: $('overlay-over'),
    overScore: $('over-score'),
    overBest: $('over-best'),
    overNew: $('over-new'),
    again: $('btn-again')
  };

  /* ---------------------------- Хранилище ---------------------------- */
  // Доступ к localStorage может бросить исключение (приватный режим, iframe)
  const safeStorage = {
    getItem(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } },
    setItem(k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* ignore */ } }
  };

  /* --------------------------- Состояние игры --------------------------- */
  let W = 0, H = 0, laneW = 0, dpr = 1;

  const game = {
    mode: 'menu', // menu | playing | dying | paused | over
    time: 0,
    elapsed: 0,
    speed: CONFIG.BASE_SPEED,
    coins: 0,
    score: 0,
    best: L.loadBest(safeStorage, STORAGE_BEST),
    isNewBest: false,
    lane: Math.floor(CONFIG.LANES / 2),
    playerX: 0,
    targetX: 0,
    entities: [],   // { type: 'obstacle' | 'coin', lane, y (доли экрана), phase }
    particles: [],
    distToNext: 0.35,
    prevFree: null,
    deathTimer: 0,
    shake: 0,
    flash: 0,
    gridOffset: 0
  };
  const streaks = [];
  const hudCache = { score: '', best: '', coins: '' };

  /* ------------------------------- Звук ------------------------------- */
  const audio = {
    ctx: null,
    master: null,
    noiseBuffer: null,
    muted: safeStorage.getItem(STORAGE_MUTE) === '1'
  };

  function ensureAudio() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!audio.ctx) {
      audio.ctx = new AC();
      audio.master = audio.ctx.createGain();
      audio.master.gain.value = audio.muted ? 0 : 1;
      audio.master.connect(audio.ctx.destination);
    }
    if (audio.ctx.state === 'suspended') audio.ctx.resume().catch(() => {});
  }

  function tone({ type = 'sine', freq = 440, freqEnd = 0, dur = 0.1, gain = 0.1, delay = 0 }) {
    if (!audio.ctx || audio.muted) return;
    const c = audio.ctx;
    const t0 = c.currentTime + delay;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (freqEnd) osc.frequency.exponentialRampToValueAtTime(freqEnd, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(audio.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  function noiseBurst(dur, gain) {
    if (!audio.ctx || audio.muted) return;
    const c = audio.ctx;
    if (!audio.noiseBuffer) {
      const len = Math.floor(c.sampleRate * 0.5);
      const buf = c.createBuffer(1, len, c.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      audio.noiseBuffer = buf;
    }
    const t0 = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = audio.noiseBuffer;
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2400, t0);
    filter.frequency.exponentialRampToValueAtTime(120, t0 + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter).connect(g).connect(audio.master);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  }

  const sfx = {
    coin() {
      tone({ freq: 880, freqEnd: 1760, dur: 0.09, gain: 0.12 });
      tone({ freq: 1320, freqEnd: 2400, dur: 0.12, gain: 0.07, delay: 0.05 });
    },
    switch() {
      tone({ type: 'triangle', freq: 300, freqEnd: 520, dur: 0.05, gain: 0.05 });
    },
    crash() {
      tone({ type: 'sawtooth', freq: 240, freqEnd: 35, dur: 0.45, gain: 0.22 });
      noiseBurst(0.4, 0.3);
    },
    start() {
      [440, 554, 659, 880].forEach((f, i) => tone({ type: 'square', freq: f, dur: 0.09, gain: 0.05, delay: i * 0.07 }));
    },
    over() {
      [392, 311, 233].forEach((f, i) => tone({ type: 'triangle', freq: f, dur: 0.22, gain: 0.08, delay: 0.25 + i * 0.18 }));
    }
  };

  function setMuted(muted) {
    audio.muted = muted;
    safeStorage.setItem(STORAGE_MUTE, muted ? '1' : '0');
    if (audio.master) audio.master.gain.value = muted ? 0 : 1;
    ui.mute.classList.toggle('muted', muted);
    ui.mute.setAttribute('aria-label', muted ? 'Включить звук' : 'Выключить звук');
    ui.mute.setAttribute('aria-pressed', muted ? 'true' : 'false');
  }

  function vibrate(pattern) {
    try {
      if (navigator.vibrate) navigator.vibrate(pattern);
    } catch (e) { /* ignore */ }
  }

  /* ------------------------------ Размеры ------------------------------ */
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    laneW = W / CONFIG.LANES;
    game.targetX = L.laneCenter(game.lane, laneW);
    game.playerX = game.targetX;
    initStreaks();
  }

  function playerRect() {
    const w = laneW * CONFIG.PLAYER_W;
    const h = H * CONFIG.PLAYER_H;
    return { x: game.playerX - w / 2, y: H * CONFIG.PLAYER_Y - h / 2, w, h };
  }

  function obstacleRect(e) {
    const w = laneW * CONFIG.OBSTACLE_W;
    const h = H * CONFIG.OBSTACLE_H;
    return { x: L.laneCenter(e.lane, laneW) - w / 2, y: e.y * H - h / 2, w, h };
  }

  function coinCircle(e) {
    return { x: L.laneCenter(e.lane, laneW), y: e.y * H, r: H * CONFIG.COIN_R };
  }

  /* --------------------------- Фоновые полосы --------------------------- */
  function initStreaks() {
    streaks.length = 0;
    for (let i = 0; i < STREAK_COUNT; i++) {
      streaks.push({
        x: Math.random(),
        y: Math.random(),
        len: 0.03 + Math.random() * 0.08,
        alpha: 0.05 + Math.random() * 0.12,
        depth: 0.4 + Math.random() * 0.6 // параллакс
      });
    }
  }

  function updateStreaks(dt, speed) {
    for (const s of streaks) {
      s.y += speed * s.depth * dt * 1.2;
      if (s.y > 1.1) {
        s.y = -s.len;
        s.x = Math.random();
      }
    }
  }

  /* ------------------------------ Частицы ------------------------------ */
  function burst(x, y, count, colors, power) {
    for (let i = 0; i < count; i++) {
      if (game.particles.length >= MAX_PARTICLES) game.particles.shift();
      const a = Math.random() * Math.PI * 2;
      const v = power * (0.3 + Math.random() * 0.7);
      const ttl = 0.4 + Math.random() * 0.6;
      game.particles.push({
        x, y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life: ttl, ttl,
        size: 2 + Math.random() * 4,
        color: colors[Math.floor(Math.random() * colors.length)]
      });
    }
  }

  function updateParticles(dt) {
    const ps = game.particles;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.life -= dt;
      if (p.life <= 0) { ps.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - 2.5 * dt;
      p.vy = p.vy * (1 - 2.5 * dt) + 300 * dt; // лёгкая гравитация
    }
  }

  /* ---------------------------- Игровая логика ---------------------------- */
  function resetGame() {
    game.elapsed = 0;
    game.speed = CONFIG.BASE_SPEED;
    game.coins = 0;
    game.score = 0;
    game.isNewBest = false;
    game.lane = Math.floor(CONFIG.LANES / 2);
    game.targetX = L.laneCenter(game.lane, laneW);
    game.playerX = game.targetX;
    game.entities.length = 0;
    game.particles.length = 0;
    game.distToNext = 0.35;
    game.prevFree = null;
    game.deathTimer = 0;
    game.shake = 0;
    game.flash = 0;
  }

  function startGame() {
    resetGame();
    game.mode = 'playing';
    ui.start.classList.add('hidden');
    ui.over.classList.add('hidden');
    ui.pause.classList.add('hidden');
    sfx.start();
  }

  function pauseGame() {
    if (game.mode !== 'playing') return;
    game.mode = 'paused';
    ui.pause.classList.remove('hidden');
  }

  function resumeGame() {
    if (game.mode !== 'paused') return;
    game.mode = 'playing';
    ui.pause.classList.add('hidden');
    ensureAudio();
  }

  function switchLane(dir) {
    if (game.mode !== 'playing') return;
    const next = L.clamp(game.lane + dir, 0, CONFIG.LANES - 1);
    if (next === game.lane) return;
    game.lane = next;
    game.targetX = L.laneCenter(next, laneW);
    sfx.switch();
  }

  function movePlayer(dt) {
    const diff = game.targetX - game.playerX;
    if (diff === 0) return;
    const step = (laneW / CONFIG.LANE_SWITCH_TIME) * dt;
    if (Math.abs(diff) <= step) game.playerX = game.targetX;
    else game.playerX += Math.sign(diff) * step;
  }

  function spawnRow(yOffset) {
    const row = L.pickRow(game.prevFree, game.elapsed, CONFIG);
    game.prevFree = row.free;
    const y = -0.08 + yOffset;
    for (const lane of row.obstacles) game.entities.push({ type: 'obstacle', lane, y, phase: Math.random() * 6.28 });
    for (const lane of row.coins) game.entities.push({ type: 'coin', lane, y, phase: Math.random() * 6.28 });
  }

  function collectCoin(e) {
    game.coins++;
    const c = coinCircle(e);
    burst(c.x, c.y, 14, [COLORS.gold, COLORS.white, '#ffb000'], 260);
    sfx.coin();
  }

  function crash() {
    game.mode = 'dying';
    game.deathTimer = CONFIG.DEATH_DELAY;
    game.shake = CONFIG.SHAKE_TIME;
    game.flash = 1;
    burst(game.playerX, H * CONFIG.PLAYER_Y, 56, [COLORS.magenta, COLORS.cyan, COLORS.white], 480);
    sfx.crash();
    sfx.over();
    vibrate(CONFIG.VIBRATE_PATTERN);
    const r = L.saveBest(safeStorage, STORAGE_BEST, game.score);
    game.best = r.best;
    game.isNewBest = r.isNew;
  }

  function showGameOver() {
    game.mode = 'over';
    ui.overScore.textContent = String(game.score);
    ui.overBest.textContent = 'Рекорд ' + game.best;
    ui.overNew.classList.toggle('hidden', !game.isNewBest);
    ui.over.classList.remove('hidden');
  }

  function update(dt) {
    game.time += dt;

    if (game.mode === 'playing') {
      game.elapsed += dt;
      const speed = L.speedAt(game.elapsed, CONFIG);
      game.speed = speed;

      movePlayer(dt);

      // Спавн по пройденному расстоянию, а не по времени: ряды всегда на
      // одинаковом расстоянии друг от друга независимо от скорости.
      game.distToNext -= speed * dt;
      while (game.distToNext <= 0) {
        spawnRow(-game.distToNext);
        game.distToNext += L.rowGapAt(game.elapsed, CONFIG);
      }

      const pr = playerRect();
      const hit = L.shrinkRect(pr, CONFIG.HITBOX_SHRINK);
      const ents = game.entities;
      for (let i = ents.length - 1; i >= 0; i--) {
        const e = ents[i];
        e.y += speed * dt;
        if (e.y > 1.2) { ents.splice(i, 1); continue; }
        if (e.type === 'obstacle') {
          if (L.rectsOverlap(hit, obstacleRect(e))) { crash(); break; }
        } else if (L.circleRectHit(coinCircle(e), pr)) {
          collectCoin(e);
          ents.splice(i, 1);
        }
      }

      game.score = L.computeScore(game.elapsed, game.coins, CONFIG);
      game.gridOffset = (game.gridOffset + speed * dt) % GRID_STEP;
      updateStreaks(dt, speed);
    } else if (game.mode === 'dying') {
      game.deathTimer -= dt;
      if (game.deathTimer <= 0) showGameOver();
    } else if (game.mode === 'menu') {
      game.gridOffset = (game.gridOffset + 0.25 * dt) % GRID_STEP;
      updateStreaks(dt, 0.25);
    }

    updateParticles(dt);
    game.shake = Math.max(0, game.shake - dt);
    game.flash = Math.max(0, game.flash - dt * 2.5);
    updateHud();
  }

  function updateHud() {
    const score = String(game.score);
    const best = 'Рекорд ' + game.best;
    const coins = String(game.coins);
    if (score !== hudCache.score) { hudCache.score = score; ui.score.textContent = score; }
    if (best !== hudCache.best) { hudCache.best = best; ui.best.textContent = best; ui.startBest.textContent = best; }
    if (coins !== hudCache.coins) { hudCache.coins = coins; ui.coins.textContent = coins; }
  }

  /* -------------------------------- Рендер -------------------------------- */
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawBackground() {
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, COLORS.bgTop);
    grad.addColorStop(1, COLORS.bg);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Горизонтальная сетка, едет вниз
    ctx.strokeStyle = 'rgba(122, 44, 255, 0.16)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let y = game.gridOffset - GRID_STEP; y < 1 + GRID_STEP; y += GRID_STEP) {
      const py = Math.round(y * H) + 0.5;
      ctx.moveTo(0, py);
      ctx.lineTo(W, py);
    }
    ctx.stroke();

    // Полосы скорости
    ctx.lineWidth = 1.5;
    for (const s of streaks) {
      ctx.strokeStyle = `rgba(0, 240, 255, ${s.alpha})`;
      ctx.beginPath();
      ctx.moveTo(s.x * W, s.y * H);
      ctx.lineTo(s.x * W, (s.y + s.len * s.depth) * H);
      ctx.stroke();
    }
  }

  function drawLanes() {
    ctx.save();
    ctx.strokeStyle = COLORS.cyan;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.45;
    ctx.shadowColor = COLORS.cyan;
    ctx.shadowBlur = 14;
    ctx.beginPath();
    for (let i = 1; i < CONFIG.LANES; i++) {
      const x = Math.round(i * laneW) + 0.5;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
    }
    ctx.stroke();
    ctx.restore();

    // Свечение под игроком
    const py = H * CONFIG.PLAYER_Y;
    const glow = ctx.createRadialGradient(game.playerX, py + H * 0.06, 0, game.playerX, py + H * 0.06, laneW * 0.9);
    glow.addColorStop(0, 'rgba(0, 240, 255, 0.18)');
    glow.addColorStop(1, 'rgba(0, 240, 255, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(game.playerX - laneW, py - laneW, laneW * 2, laneW * 2);
  }

  function drawPlayer() {
    const r = playerRect();
    const cx = game.playerX;
    const cy = r.y + r.h / 2;
    const tilt = L.clamp((game.targetX - game.playerX) / laneW, -1, 1);

    ctx.save();
    ctx.translate(cx, cy);
    ctx.transform(1, 0, -tilt * 0.35, 1, 0, 0);

    // Выхлоп
    const flick = 0.7 + Math.sin(game.time * 40) * 0.3;
    ctx.shadowColor = COLORS.magenta;
    ctx.shadowBlur = 18;
    ctx.fillStyle = `rgba(255, 43, 214, ${0.55 * flick})`;
    ctx.beginPath();
    ctx.moveTo(-r.w * 0.18, r.h * 0.3);
    ctx.lineTo(0, r.h * (0.55 + 0.35 * flick));
    ctx.lineTo(r.w * 0.18, r.h * 0.3);
    ctx.closePath();
    ctx.fill();

    // Корпус
    const grad = ctx.createLinearGradient(0, -r.h / 2, 0, r.h / 2);
    grad.addColorStop(0, COLORS.white);
    grad.addColorStop(0.35, COLORS.cyan);
    grad.addColorStop(1, '#0060a0');
    ctx.shadowColor = COLORS.cyan;
    ctx.shadowBlur = 26;
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(0, -r.h / 2);
    ctx.lineTo(r.w / 2, r.h / 2);
    ctx.lineTo(0, r.h * 0.22);
    ctx.lineTo(-r.w / 2, r.h / 2);
    ctx.closePath();
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  function drawObstacle(e) {
    const r = obstacleRect(e);
    ctx.save();
    ctx.shadowColor = COLORS.magenta;
    ctx.shadowBlur = 20;
    ctx.fillStyle = 'rgba(255, 43, 214, 0.16)';
    roundRect(r.x, r.y, r.w, r.h, 6);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = COLORS.magenta;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Внутренние "предупреждающие" полоски
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    const n = 3;
    for (let i = 1; i <= n; i++) {
      const x = r.x + (r.w * i) / (n + 1);
      ctx.moveTo(x - r.h * 0.25, r.y + r.h * 0.7);
      ctx.lineTo(x + r.h * 0.25, r.y + r.h * 0.3);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawCoin(e) {
    const c = coinCircle(e);
    const spin = Math.abs(Math.cos(game.time * 5 + e.phase));
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.scale(0.25 + 0.75 * spin, 1);
    ctx.shadowColor = COLORS.gold;
    ctx.shadowBlur = 18;
    const grad = ctx.createRadialGradient(-c.r * 0.3, -c.r * 0.3, c.r * 0.1, 0, 0, c.r);
    grad.addColorStop(0, '#fff6c2');
    grad.addColorStop(0.6, COLORS.gold);
    grad.addColorStop(1, '#d98a00');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, c.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(120, 60, 0, 0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, c.r * 0.62, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawParticles() {
    for (const p of game.particles) {
      const a = Math.max(0, p.life / p.ttl);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size * a + 1, p.size * a + 1);
    }
    ctx.globalAlpha = 1;
  }

  function draw() {
    ctx.save();
    if (game.shake > 0) {
      const s = (game.shake / CONFIG.SHAKE_TIME) * 12;
      ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
    }
    drawBackground();
    drawLanes();
    for (const e of game.entities) {
      if (e.type === 'obstacle') drawObstacle(e);
      else drawCoin(e);
    }
    if (game.mode !== 'dying' && game.mode !== 'over') drawPlayer();
    drawParticles();
    ctx.restore();

    if (game.flash > 0) {
      ctx.fillStyle = `rgba(255, 43, 214, ${game.flash * 0.35})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  /* ----------------------------- Игровой цикл ----------------------------- */
  let last = performance.now();
  function frame(now) {
    let dt = (now - last) / 1000;
    last = now;
    if (dt < 0) dt = 0;
    if (dt > CONFIG.MAX_DT) dt = CONFIG.MAX_DT;
    update(dt);
    draw();
    requestAnimationFrame(frame);
  }

  /* --------------------------------- Ввод --------------------------------- */
  let pointer = null; // { id, x, y, handled }

  canvas.addEventListener('pointerdown', (e) => {
    ensureAudio();
    if (game.mode !== 'playing') return;
    pointer = { id: e.pointerId, x: e.clientX, y: e.clientY, handled: false };
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!pointer || pointer.id !== e.pointerId || pointer.handled) return;
    const dx = e.clientX - pointer.x;
    const dy = e.clientY - pointer.y;
    if (Math.abs(dx) >= CONFIG.SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy)) {
      pointer.handled = true;
      switchLane(dx > 0 ? 1 : -1);
    }
  });

  canvas.addEventListener('pointerup', (e) => {
    if (!pointer || pointer.id !== e.pointerId) return;
    if (!pointer.handled) switchLane(pointer.x < W / 2 ? -1 : 1); // тап по половине экрана
    pointer = null;
  });

  canvas.addEventListener('pointercancel', () => { pointer = null; });

  ui.start.addEventListener('pointerdown', (e) => {
    if (e.target.closest('a')) return; // ссылка «Все игры»
    e.preventDefault();
    ensureAudio();
    startGame();
  });

  ui.pause.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    resumeGame();
  });

  ui.again.addEventListener('click', (e) => {
    e.stopPropagation();
    ensureAudio();
    startGame();
  });

  ui.mute.addEventListener('click', (e) => {
    e.stopPropagation();
    ensureAudio();
    setMuted(!audio.muted);
  });

  window.addEventListener('keydown', (e) => {
    switch (e.key) {
      case 'ArrowLeft': case 'a': case 'A': case 'ф': case 'Ф': switchLane(-1); break;
      case 'ArrowRight': case 'd': case 'D': case 'в': case 'В': switchLane(1); break;
      case ' ': case 'Enter':
        e.preventDefault();
        ensureAudio();
        if (game.mode === 'menu' || game.mode === 'over') startGame();
        else if (game.mode === 'paused') resumeGame();
        break;
      case 'p': case 'P': case 'Escape':
        if (game.mode === 'playing') pauseGame();
        else if (game.mode === 'paused') resumeGame();
        break;
      case 'm': case 'M': setMuted(!audio.muted); break;
      default: break;
    }
  });

  // Пауза при сворачивании вкладки / приложения
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      pauseGame();
      if (audio.ctx && audio.ctx.state === 'running') audio.ctx.suspend().catch(() => {});
    } else {
      last = performance.now();
      if (audio.ctx && audio.ctx.state === 'suspended' && game.mode !== 'paused') audio.ctx.resume().catch(() => {});
    }
  });
  window.addEventListener('pagehide', pauseGame);
  window.addEventListener('blur', pauseGame);

  // Защита от прокрутки, зума и контекстного меню на мобильных
  document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('dblclick', (e) => e.preventDefault());
  document.addEventListener('contextmenu', (e) => e.preventDefault());

  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 100));

  /* ------------------------------- Запуск ------------------------------- */
  setMuted(audio.muted);
  resize();
  updateHud();
  requestAnimationFrame((t) => { last = t; frame(t); });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch((err) => console.warn('SW registration failed', err));
    });
  }
})();
