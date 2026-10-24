/*
 * Луи на прогулке - ядро игры: баланс, карта двора и вся симуляция
 * (движение, столкновения, поведение собак, настроение, очки, прогресс).
 *
 * Здесь нет DOM и Canvas: файл одинаково работает в браузере
 * (window.LouisLogic) и в Node.js (require) для автотестов.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.LouisLogic = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ================================================================
   *  БАЛАНС - все параметры игры в одном месте.
   *  Расстояния в единицах мира (двор 1000 x 1570), время в секундах,
   *  скорости в единицах в секунду. Настроение от 0 до 100.
   * ================================================================ */
  var CONFIG = {
    VIEW_WIDTH: 440,           // сколько единиц мира видно по ширине экрана

    // Луи
    LOUIS_RADIUS: 16,
    WALK_SPEED: 150,           // шаг при полном отклонении джойстика без бега
    SPRINT_SPEED: 255,         // бег (джойстик до упора или Shift)
    SPRINT_DEFLECTION: 0.85,   // с какого отклонения джойстика начинается бег
    DEADZONE: 0.12,            // мёртвая зона джойстика
    STAMINA_DRAIN: 0.38,       // расход выносливости за секунду бега
    STAMINA_REGEN: 0.22,       // восстановление за секунду
    STAMINA_MIN_TO_SPRINT: 0.2,
    FEAR_SPEED_BONUS: 35,      // со страху Луи бегает чуть быстрее
    PANIC_SPEED: 280,          // убегает к подъезду после испуга
    PANIC_TIME: 2.6,

    // Настроение
    MOOD_START: 65,
    MOOD_DECAY: 0.5,           // скучает: минус в секунду
    MOOD_FEAR_DRAIN: 7,        // минус в секунду при максимальном страхе
    MOOD_SCARE: 25,            // большая собака догнала
    MOOD_FRIEND: 18,           // понюхались с маленькой собачкой
    FEAR_RADIUS: 260,          // на каком расстоянии страшно рядом с большой собакой
    FEAR_IDLE_FACTOR: 0.35,    // насколько страшна спокойная большая собака

    // Нюх
    SNIFF_DURATION: 3,
    SNIFF_COOLDOWN: 7,         // перезарядка после окончания нюха
    SNIFF_REVEAL_RADIUS: 270,  // во время нюха видно вещи в этом радиусе
    SNIFF_TRAILS: 3,           // сколько следов запаха показывать
    SNIFF_MOVE_FACTOR: 0.55,   // пока нюхает, идёт медленнее
    REVEAL_RADIUS: 105,        // без нюха вещь видна только вблизи
    PICKUP_RADIUS: 30,
    ITEM_RESPAWN: 4,           // через сколько секунд появляется новая вещь

    // Вещи: очки, настроение, частота
    ITEMS: {
      bone:    { group: 'treat', name: 'косточку', score: 10, mood: 8,  weight: 5 },
      cookie:  { group: 'treat', name: 'печеньку', score: 10, mood: 7,  weight: 4 },
      sausage: { group: 'treat', name: 'сосиску',  score: 20, mood: 12, weight: 2 },
      ball:    { group: 'toy',   name: 'мячик',    score: 25, mood: 12, weight: 4 },
      stick:   { group: 'toy',   name: 'палку',    score: 20, mood: 10, weight: 4 },
      squeaky: { group: 'toy',   name: 'пищалку',  score: 30, mood: 14, weight: 2 }
    },
    BUSH_ITEM_CHANCE: 0.45,    // доля вещей, спрятанных в кустах

    // Большие собаки
    BIG_RADIUS: 24,
    BIG_WANDER_SPEED: 55,
    BIG_WANDER_RANGE: 320,     // как далеко гуляет от своего места
    BIG_NOTICE_RADIUS: 215,    // замечает Луи
    BIG_ALERT_TIME: 0.75,      // лает перед погоней, есть время среагировать
    BIG_CHASE_SPEED: 205,
    BIG_CHASE_TIME: 6,         // дольше не гонится
    BIG_LOSE_RADIUS: 390,      // отстал и бросил погоню
    BIG_GIVEUP_COOLDOWN: 3,
    BIG_CATCH_COOLDOWN: 8,     // после испуга Луи оставляет его в покое
    BIG_START_GRACE: 5,        // первые секунды прогулки большие собаки не замечают Луи

    // Маленькие собаки
    SMALL_RADIUS: 13,
    SMALL_WANDER_SPEED: 45,
    SMALL_WANDER_RANGE: 260,
    SMALL_GREET_RADIUS: 150,   // замечает Луи и бежит знакомиться
    SMALL_APPROACH_SPEED: 95,
    FRIEND_SNIFF_RADIUS: 48,   // на этом расстоянии они нюхаются
    FRIEND_SNIFF_TIME: 1.6,    // сколько нужно постоять рядом
    FRIEND_SCORE: 40,

    // Двор и финал
    SAFE_RADIUS: 85,           // зона у двери подъезда: сюда большие собаки не заходят
    HOME_BONUS: 50,            // вернулся домой после окончания прогулки
    END_MOOD_SCORE: 1          // очков за каждую единицу настроения в конце
  };

  /* Прогулки. stars - пороги очков для 1, 2 и 3 звёзд. */
  var LEVELS = [
    {
      id: 'morning', name: 'Утро', note: 'Тихий двор, во дворе гуляет Рекс',
      duration: 120, bigDogs: ['Рекс'], smallDogs: ['Бусинка', 'Тоша', 'Кнопка'],
      treats: 6, toys: 3, bigSpeedMul: 0.85, night: false, stars: [220, 380, 540]
    },
    {
      id: 'day', name: 'День', note: 'Народу больше, Барон тоже вышел',
      duration: 150, bigDogs: ['Рекс', 'Барон'], smallDogs: ['Пиксель', 'Ричи', 'Зефирка'],
      treats: 7, toys: 4, bigSpeedMul: 1, night: false, stars: [260, 450, 630]
    },
    {
      id: 'evening', name: 'Вечер', note: 'Темно, светят фонари. Три больших пса',
      duration: 150, bigDogs: ['Рекс', 'Барон', 'Гром'], smallDogs: ['Луна', 'Чапа'],
      treats: 7, toys: 4, bigSpeedMul: 1.06, night: true, stars: [220, 400, 560]
    }
  ];

  /* ================================================================
   *  КАРТА ДВОРА. y растёт вниз. Сверху дом с подъездом, снизу гаражи.
   * ================================================================ */
  var WORLD = {
    width: 1000,
    height: 1570,
    door: { x: 500, y: 238 },
    // Твёрдые прямоугольники: сквозь них не пройти
    solids: [
      { x: 0, y: 0, w: 1000, h: 205, kind: 'building' },
      { x: 300, y: 262, w: 84, h: 22, kind: 'bench' },
      { x: 616, y: 262, w: 84, h: 22, kind: 'bench' },
      // Машины: левый ряд вплотную к краю, между рядами щель шире самой большой собаки
      { x: 0, y: 400, w: 74, h: 124, kind: 'car', color: '#e0524d' },
      { x: 150, y: 440, w: 74, h: 124, kind: 'car', color: '#4f7fd9' },
      { x: 0, y: 610, w: 74, h: 124, kind: 'car', color: '#e9edf2' },
      { x: 150, y: 700, w: 74, h: 124, kind: 'car', color: '#f2c14e' },
      { x: 0, y: 860, w: 74, h: 124, kind: 'car', color: '#5aa469' },
      { x: 904, y: 410, w: 96, h: 56, kind: 'bins' }, // вплотную к краю, чтобы не было узкой щели
      { x: 350, y: 860, w: 32, h: 90, kind: 'slide' },
      { x: 580, y: 905, w: 110, h: 16, kind: 'swings' }
    ],
    // Деревья: сталкиваемся со стволом (r), крона рисуется больше
    trees: [
      { x: 110, y: 300, r: 14 }, { x: 330, y: 500, r: 14 }, { x: 760, y: 362, r: 14 },
      { x: 900, y: 300, r: 14 }, { x: 760, y: 620, r: 14 }, { x: 930, y: 760, r: 14 },
      { x: 800, y: 1040, r: 14 }, { x: 250, y: 1110, r: 14 }, { x: 120, y: 1120, r: 14 },
      { x: 900, y: 1120, r: 14 }, { x: 330, y: 1390, r: 14 }, { x: 680, y: 1380, r: 14 },
      { x: 900, y: 1430, r: 14 }, { x: 120, y: 1460, r: 14 }, { x: 610, y: 1500, r: 14 }
    ],
    // Кусты: проходимые, в них прячутся вещи
    bushes: [
      { x: 200, y: 255, r: 34 }, { x: 790, y: 255, r: 36 }, { x: 955, y: 580, r: 34 },
      { x: 285, y: 640, r: 36 }, { x: 860, y: 905, r: 40 }, { x: 385, y: 1110, r: 36 },
      { x: 640, y: 1120, r: 36 }, { x: 200, y: 1350, r: 40 }, { x: 390, y: 1480, r: 36 },
      { x: 800, y: 1335, r: 40 }, { x: 690, y: 565, r: 32 }, { x: 950, y: 1480, r: 36 }
    ],
    lamps: [
      { x: 400, y: 318 }, { x: 600, y: 318 }, { x: 262, y: 850 }, { x: 738, y: 850 },
      { x: 420, y: 1185 }, { x: 580, y: 1185 }, { x: 250, y: 1300 }, { x: 750, y: 1300 },
      { x: 900, y: 520 }
    ],
    spawnArea: { x0: 30, y0: 235, x1: 970, y1: 1545 }
  };

  /* ----------------------------- утилиты ----------------------------- */
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function dist(ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return Math.sqrt(dx * dx + dy * dy); }
  function distTo(a, b) { return dist(a.x, a.y, b.x, b.y); }

  function inSafeZone(x, y) {
    return dist(x, y, WORLD.door.x, WORLD.door.y) < CONFIG.SAFE_RADIUS;
  }

  /* --------------------------- столкновения --------------------------- */

  /** Выталкивает круг (e.x, e.y, r) из прямоугольника. true - если было пересечение. */
  function pushOutOfRect(e, r, rect) {
    var cx = clamp(e.x, rect.x, rect.x + rect.w);
    var cy = clamp(e.y, rect.y, rect.y + rect.h);
    var dx = e.x - cx, dy = e.y - cy;
    var d2 = dx * dx + dy * dy;
    if (d2 >= r * r) return false;
    if (d2 > 1e-9) {
      var d = Math.sqrt(d2);
      var k = (r - d) / d;
      e.x += dx * k;
      e.y += dy * k;
      return true;
    }
    // Центр внутри прямоугольника: выталкиваем по кратчайшей оси
    var left = e.x - rect.x, right = rect.x + rect.w - e.x;
    var top = e.y - rect.y, bottom = rect.y + rect.h - e.y;
    var m = Math.min(left, right, top, bottom);
    if (m === left) e.x = rect.x - r;
    else if (m === right) e.x = rect.x + rect.w + r;
    else if (m === top) e.y = rect.y - r;
    else e.y = rect.y + rect.h + r;
    return true;
  }

  /** Выталкивает круг из другого круга (c.x, c.y, c.r). */
  function pushOutOfCircle(e, r, c) {
    var dx = e.x - c.x, dy = e.y - c.y;
    var min = r + c.r;
    var d2 = dx * dx + dy * dy;
    if (d2 >= min * min) return false;
    var d = Math.sqrt(d2);
    if (d < 1e-6) { e.y = c.y + min; return true; }
    var k = (min - d) / d;
    e.x += dx * k;
    e.y += dy * k;
    return true;
  }

  function resolveCollisions(e, r) {
    var hit = false;
    for (var i = 0; i < WORLD.solids.length; i++) hit = pushOutOfRect(e, r, WORLD.solids[i]) || hit;
    for (var j = 0; j < WORLD.trees.length; j++) hit = pushOutOfCircle(e, r, WORLD.trees[j]) || hit;
    e.x = clamp(e.x, r, WORLD.width - r);
    e.y = clamp(e.y, r, WORLD.height - r);
    return hit;
  }

  /** Двигает сущность на (dx, dy) с учётом препятствий. Возвращает пройденное расстояние. */
  function moveEntity(e, r, dx, dy) {
    var ox = e.x, oy = e.y;
    e.x += dx;
    e.y += dy;
    for (var i = 0; i < 4; i++) {           // несколько проходов для углов между препятствиями
      if (!resolveCollisions(e, r)) break;
    }
    return dist(ox, oy, e.x, e.y);
  }

  /** Свободна ли точка для круга радиуса r. */
  function isFree(x, y, r) {
    if (x < r || y < r || x > WORLD.width - r || y > WORLD.height - r) return false;
    for (var i = 0; i < WORLD.solids.length; i++) {
      var s = WORLD.solids[i];
      var cx = clamp(x, s.x, s.x + s.w), cy = clamp(y, s.y, s.y + s.h);
      if (dist(x, y, cx, cy) < r) return false;
    }
    for (var j = 0; j < WORLD.trees.length; j++) {
      var t = WORLD.trees[j];
      if (dist(x, y, t.x, t.y) < r + t.r) return false;
    }
    return true;
  }

  /** Случайная свободная точка в зоне спавна, удовлетворяющая accept(x, y). */
  function randomFreePoint(rng, r, accept) {
    var a = WORLD.spawnArea;
    for (var i = 0; i < 400; i++) {
      var x = a.x0 + rng() * (a.x1 - a.x0);
      var y = a.y0 + rng() * (a.y1 - a.y0);
      if (isFree(x, y, r) && (!accept || accept(x, y))) return { x: x, y: y };
    }
    // Запасной вариант: середина двора всегда свободна
    return { x: 500, y: 1180 };
  }

  /** Выталкивает из зоны у подъезда (для больших собак). */
  function keepOutOfSafeZone(e) {
    var d = dist(e.x, e.y, WORLD.door.x, WORLD.door.y);
    var min = CONFIG.SAFE_RADIUS + e.r;
    if (d >= min) return;
    if (d < 1e-6) { e.y = WORLD.door.y + min; return; }
    e.x = WORLD.door.x + (e.x - WORLD.door.x) / d * min;
    e.y = WORLD.door.y + (e.y - WORLD.door.y) / d * min;
    resolveCollisions(e, e.r);
  }

  /* ------------------------------- вещи ------------------------------- */

  function pickItemKind(group, rng) {
    var kinds = Object.keys(CONFIG.ITEMS).filter(function (k) { return CONFIG.ITEMS[k].group === group; });
    var total = kinds.reduce(function (s, k) { return s + CONFIG.ITEMS[k].weight; }, 0);
    var roll = rng() * total;
    for (var i = 0; i < kinds.length; i++) {
      roll -= CONFIG.ITEMS[kinds[i]].weight;
      if (roll < 0) return kinds[i];
    }
    return kinds[kinds.length - 1];
  }

  var itemIdSeq = 1;

  /** Создаёт вещь в свободном месте, не ближе minFrom к точке avoid. */
  function spawnItem(group, rng, avoid, minFrom) {
    var kind = pickItemKind(group, rng);
    var ok = function (x, y) {
      if (inSafeZone(x, y) || dist(x, y, WORLD.door.x, WORLD.door.y) < CONFIG.SAFE_RADIUS + 30) return false;
      if (avoid && dist(x, y, avoid.x, avoid.y) < minFrom) return false;
      return true;
    };
    var pos = null;
    var inBush = false;
    if (rng() < CONFIG.BUSH_ITEM_CHANCE) {
      for (var i = 0; i < 30 && !pos; i++) {
        var b = WORLD.bushes[Math.floor(rng() * WORLD.bushes.length)];
        var a = rng() * Math.PI * 2, rr = rng() * b.r * 0.55;
        var x = b.x + Math.cos(a) * rr, y = b.y + Math.sin(a) * rr;
        if (isFree(x, y, 10) && ok(x, y)) { pos = { x: x, y: y }; inBush = true; }
      }
    }
    if (!pos) pos = randomFreePoint(rng, 12, ok);
    return { id: itemIdSeq++, kind: kind, group: group, x: pos.x, y: pos.y, revealed: false, inBush: inBush, age: 0 };
  }

  /* --------------------------- создание прогулки --------------------------- */

  function makeDog(name, pos, r, extra) {
    var d = {
      name: name, x: pos.x, y: pos.y, r: r, home: { x: pos.x, y: pos.y },
      target: { x: pos.x, y: pos.y }, state: 'wander', timer: 0, wait: 1 + Math.random(),
      stuck: 0, cooldown: 0, facing: 1, speed: 0, phase: Math.random() * 6
    };
    for (var k in extra) d[k] = extra[k];
    return d;
  }

  /** Новая прогулка по уровню levelIndex. rng - генератор случайных чисел 0..1. */
  function createWalk(levelIndex, rng) {
    rng = rng || Math.random;
    var level = LEVELS[levelIndex];
    var louis = {
      x: WORLD.door.x, y: WORLD.door.y + 62, r: CONFIG.LOUIS_RADIUS, facing: 1,
      stamina: 1, sprinting: false, panic: 0, sniff: 0, sniffCd: 0,
      mood: CONFIG.MOOD_START, fear: 0, speed: 0, phase: 0
    };
    var placed = [];
    var farFrom = function (min) {
      return function (x, y) {
        if (dist(x, y, louis.x, louis.y) < min) return false;
        return placed.every(function (p) { return dist(x, y, p.x, p.y) > 220; });
      };
    };
    var bigDogs = level.bigDogs.map(function (name) {
      var p = randomFreePoint(rng, CONFIG.BIG_RADIUS, function (x, y) { return y > 760 && farFrom(560)(x, y); });
      placed.push(p);
      return makeDog(name, p, CONFIG.BIG_RADIUS, { cooldown: CONFIG.BIG_START_GRACE });
    });
    var smallDogs = level.smallDogs.map(function (name) {
      var p = randomFreePoint(rng, CONFIG.SMALL_RADIUS, function (x, y) { return y > 420 && farFrom(280)(x, y); });
      placed.push(p);
      return makeDog(name, p, CONFIG.SMALL_RADIUS, { friend: false, progress: 0 });
    });
    var items = [];
    for (var i = 0; i < level.treats; i++) items.push(spawnItem('treat', rng, louis, 140));
    for (var j = 0; j < level.toys; j++) items.push(spawnItem('toy', rng, louis, 140));

    return {
      level: level, levelIndex: levelIndex,
      time: level.duration, elapsed: 0, timeUp: false, over: false, result: null,
      louis: louis, bigDogs: bigDogs, smallDogs: smallDogs, items: items, respawns: [],
      stats: { score: 0, treats: 0, toys: 0, friends: [], scares: 0, found: {} }
    };
  }

  /* ------------------------------ Луи ------------------------------ */

  /**
   * input: { x, y } - направление (любой длины), mag - сила 0..1,
   * sprint - принудительный бег (клавиатура).
   */
  function stepLouis(s, input, dt) {
    var L = s.louis, cfg = CONFIG;
    L.sniff = Math.max(0, L.sniff - dt);
    L.sniffCd = Math.max(0, L.sniffCd - dt);
    var dirX = 0, dirY = 0, speed = 0;

    if (L.panic > 0) {
      L.panic -= dt;
      var px = WORLD.door.x - L.x, py = WORLD.door.y + 30 - L.y;
      var pl = Math.sqrt(px * px + py * py) || 1;
      dirX = px / pl; dirY = py / pl;
      speed = cfg.PANIC_SPEED;
      L.sprinting = false;
      if (inSafeZone(L.x, L.y)) L.panic = 0;
    } else {
      var mag = clamp(input && input.mag || 0, 0, 1);
      var len = input ? Math.sqrt(input.x * input.x + input.y * input.y) : 0;
      if (mag > cfg.DEADZONE && len > 1e-6) {
        dirX = input.x / len; dirY = input.y / len;
        var wantSprint = !!input.sprint || mag >= cfg.SPRINT_DEFLECTION;
        var canSprint = L.sprinting ? L.stamina > 0 : L.stamina >= cfg.STAMINA_MIN_TO_SPRINT;
        L.sprinting = wantSprint && canSprint;
        var walk = cfg.WALK_SPEED * (0.35 + 0.65 * Math.min(1, mag / cfg.SPRINT_DEFLECTION));
        speed = (L.sprinting ? cfg.SPRINT_SPEED : walk) + cfg.FEAR_SPEED_BONUS * L.fear;
        if (L.sniff > 0) speed *= cfg.SNIFF_MOVE_FACTOR;
      } else {
        L.sprinting = false;
      }
    }

    if (L.sprinting) L.stamina = Math.max(0, L.stamina - cfg.STAMINA_DRAIN * dt);
    else L.stamina = Math.min(1, L.stamina + cfg.STAMINA_REGEN * dt);
    if (L.stamina <= 0) L.sprinting = false;

    var moved = speed > 0 ? moveEntity(L, L.r, dirX * speed * dt, dirY * speed * dt) : 0;
    L.speed = dt > 0 ? moved / dt : 0;
    L.phase += moved * 0.14;
    if (Math.abs(dirX) > 0.15) L.facing = dirX > 0 ? 1 : -1;
  }

  /** Включает нюх, если он перезарядился. */
  function trySniff(s) {
    var L = s.louis;
    if (s.over || L.sniffCd > 0 || L.panic > 0) return false;
    L.sniff = CONFIG.SNIFF_DURATION;
    L.sniffCd = CONFIG.SNIFF_DURATION + CONFIG.SNIFF_COOLDOWN;
    return true;
  }

  /** n ближайших к Луи вещей (для следов запаха). */
  function nearestItems(s, n) {
    var L = s.louis;
    return s.items
      .map(function (it) { return { item: it, d: dist(it.x, it.y, L.x, L.y) }; })
      .sort(function (a, b) { return a.d - b.d; })
      .slice(0, n);
  }

  /* --------------------------- большие собаки --------------------------- */

  function wanderTarget(dog, range, rng, avoidSafe) {
    return randomFreePoint(rng, dog.r, function (x, y) {
      if (dist(x, y, dog.home.x, dog.home.y) > range) return false;
      if (avoidSafe && dist(x, y, WORLD.door.x, WORLD.door.y) < CONFIG.SAFE_RADIUS + dog.r + 40) return false;
      return true;
    });
  }

  function moveToward(dog, tx, ty, speed, dt) {
    var dx = tx - dog.x, dy = ty - dog.y;
    var l = Math.sqrt(dx * dx + dy * dy);
    if (l < 1e-6) return 0;
    var step = Math.min(l, speed * dt);
    var moved = moveEntity(dog, dog.r, dx / l * step, dy / l * step);
    if (Math.abs(dx) > 2) dog.facing = dx > 0 ? 1 : -1;
    dog.phase += moved * 0.12;
    if (moved < step * 0.3) dog.stuck += dt; else dog.stuck = 0;
    return moved;
  }

  function wanderStep(dog, dt, rng, speed, range, avoidSafe) {
    if (dog.wait > 0) { dog.wait -= dt; return 0; }
    if (distTo(dog, dog.target) < 10 || dog.stuck > 1.2) {
      dog.target = wanderTarget(dog, range, rng, avoidSafe);
      dog.wait = 0.8 + rng() * 2.4;
      dog.stuck = 0;
      return 0;
    }
    return moveToward(dog, dog.target.x, dog.target.y, speed, dt);
  }

  /** Шаг большой собаки. Возвращает событие: notice | chase | giveup | catch | null. */
  function stepBigDog(dog, s, dt, rng) {
    var cfg = CONFIG, L = s.louis, mul = s.level.bigSpeedMul;
    var event = null, moved = 0;
    if (dog.cooldown > 0) dog.cooldown -= dt;
    var d = distTo(dog, L);
    var safe = inSafeZone(L.x, L.y);

    if (dog.state === 'wander') {
      if (!safe && L.panic <= 0 && dog.cooldown <= 0 && d < cfg.BIG_NOTICE_RADIUS) {
        dog.state = 'alert';
        dog.timer = cfg.BIG_ALERT_TIME;
        event = 'notice';
      } else {
        moved = wanderStep(dog, dt, rng, cfg.BIG_WANDER_SPEED * mul, cfg.BIG_WANDER_RANGE, true);
      }
    } else if (dog.state === 'alert') {
      dog.facing = L.x >= dog.x ? 1 : -1;
      if (safe) {
        dog.state = 'wander';
        dog.cooldown = 1;
      } else {
        dog.timer -= dt;
        if (dog.timer <= 0) {
          dog.state = 'chase';
          dog.timer = cfg.BIG_CHASE_TIME;
          event = 'chase';
        }
      }
    } else if (dog.state === 'chase') {
      dog.timer -= dt;
      if (safe || d > cfg.BIG_LOSE_RADIUS || dog.timer <= 0) {
        dog.state = 'wander';
        dog.cooldown = cfg.BIG_GIVEUP_COOLDOWN;
        dog.target = wanderTarget(dog, cfg.BIG_WANDER_RANGE, rng, true);
        dog.wait = 0.6;
        event = 'giveup';
      } else {
        moved = moveToward(dog, L.x, L.y, cfg.BIG_CHASE_SPEED * mul, dt);
        if (distTo(dog, L) < dog.r + L.r + 2 && L.panic <= 0) {
          event = 'catch';
          dog.state = 'wander';
          dog.cooldown = cfg.BIG_CATCH_COOLDOWN;
          dog.target = wanderTarget(dog, cfg.BIG_WANDER_RANGE, rng, true);
          dog.wait = 1.2;
        }
      }
    }
    keepOutOfSafeZone(dog);
    dog.speed = dt > 0 ? moved / dt : 0;
    return event;
  }

  /* --------------------------- маленькие собаки --------------------------- */

  /** Шаг маленькой собаки. Возвращает 'friend', когда подружились. */
  function stepSmallDog(dog, s, dt, rng) {
    var cfg = CONFIG, L = s.louis;
    var event = null, moved = 0;
    var d = distTo(dog, L);

    if (dog.state === 'happy') {
      dog.timer -= dt;
      dog.facing = L.x >= dog.x ? 1 : -1;
      if (dog.timer <= 0) dog.state = 'wander';
    } else if (!dog.friend && L.panic <= 0 && d < cfg.SMALL_GREET_RADIUS) {
      dog.state = 'greet';
      dog.facing = L.x >= dog.x ? 1 : -1;
      if (d > cfg.FRIEND_SNIFF_RADIUS) {
        moved = moveToward(dog, L.x, L.y, cfg.SMALL_APPROACH_SPEED, dt);
        dog.progress = Math.max(0, dog.progress - dt * 0.5);
      } else {
        dog.progress += dt;
        if (dog.progress >= cfg.FRIEND_SNIFF_TIME) {
          dog.friend = true;
          dog.progress = 0;
          dog.state = 'happy';
          dog.timer = 2.2;
          event = 'friend';
        }
      }
    } else {
      if (dog.state === 'greet') dog.state = 'wander';
      dog.progress = Math.max(0, dog.progress - dt);
      moved = wanderStep(dog, dt, rng, cfg.SMALL_WANDER_SPEED, cfg.SMALL_WANDER_RANGE, false);
    }
    dog.speed = dt > 0 ? moved / dt : 0;
    return event;
  }

  /* --------------------------- настроение и страх --------------------------- */

  function computeFear(s) {
    var L = s.louis, cfg = CONFIG, fear = 0;
    if (inSafeZone(L.x, L.y)) return 0;
    for (var i = 0; i < s.bigDogs.length; i++) {
      var dog = s.bigDogs[i];
      var k = clamp(1 - (distTo(dog, L) - dog.r - L.r) / cfg.FEAR_RADIUS, 0, 1);
      if (dog.state === 'wander') k *= cfg.FEAR_IDLE_FACTOR;
      if (k > fear) fear = k;
    }
    return fear;
  }

  function addMood(L, v) { L.mood = clamp(L.mood + v, 0, 100); }

  /* ------------------------------ шаг прогулки ------------------------------ */

  /**
   * Продвигает прогулку на dt секунд. Возвращает массив событий для звука,
   * эффектов и подсказок: pickup, friend, notice, chase, giveup, catch, timeup, end.
   */
  function stepWalk(s, input, dt, rng) {
    rng = rng || Math.random;
    var events = [];
    if (s.over) return events;
    var cfg = CONFIG, L = s.louis;
    s.elapsed += dt;

    if (!s.timeUp) {
      s.time -= dt;
      if (s.time <= 0) {
        s.time = 0;
        s.timeUp = true;
        events.push({ type: 'timeup' });
      }
    }

    stepLouis(s, input, dt);

    // Вещи: видимость и подбор
    var reveal = L.sniff > 0 ? cfg.SNIFF_REVEAL_RADIUS : cfg.REVEAL_RADIUS;
    for (var i = s.items.length - 1; i >= 0; i--) {
      var it = s.items[i];
      it.age += dt;
      var d = dist(it.x, it.y, L.x, L.y);
      if (d < reveal) it.revealed = true;
      if (d < cfg.PICKUP_RADIUS && L.panic <= 0) {
        var def = cfg.ITEMS[it.kind];
        s.items.splice(i, 1);
        s.stats.score += def.score;
        if (def.group === 'treat') s.stats.treats++; else s.stats.toys++;
        s.stats.found[it.kind] = (s.stats.found[it.kind] || 0) + 1;
        addMood(L, def.mood);
        s.respawns.push({ group: def.group, t: cfg.ITEM_RESPAWN });
        events.push({ type: 'pickup', kind: it.kind, group: def.group, x: it.x, y: it.y, score: def.score });
      }
    }
    for (var r = s.respawns.length - 1; r >= 0; r--) {
      s.respawns[r].t -= dt;
      if (s.respawns[r].t <= 0) {
        s.items.push(spawnItem(s.respawns[r].group, rng, L, 260));
        s.respawns.splice(r, 1);
      }
    }

    // Маленькие собаки
    for (var m = 0; m < s.smallDogs.length; m++) {
      var sd = s.smallDogs[m];
      if (stepSmallDog(sd, s, dt, rng) === 'friend') {
        s.stats.friends.push(sd.name);
        s.stats.score += cfg.FRIEND_SCORE;
        addMood(L, cfg.MOOD_FRIEND);
        events.push({ type: 'friend', name: sd.name, x: (sd.x + L.x) / 2, y: (sd.y + L.y) / 2 });
      }
    }

    // Большие собаки
    for (var b = 0; b < s.bigDogs.length; b++) {
      var bd = s.bigDogs[b];
      var ev = stepBigDog(bd, s, dt, rng);
      if (ev === 'catch') {
        L.panic = cfg.PANIC_TIME;
        L.sniff = 0;
        s.stats.scares++;
        addMood(L, -cfg.MOOD_SCARE);
      }
      if (ev) events.push({ type: ev, name: bd.name, x: bd.x, y: bd.y });
    }

    // Страх и настроение
    var fearTarget = computeFear(s);
    L.fear += (fearTarget - L.fear) * Math.min(1, dt * 4);
    var safe = inSafeZone(L.x, L.y);
    if (!safe) addMood(L, -cfg.MOOD_DECAY * dt);
    addMood(L, -cfg.MOOD_FEAR_DRAIN * L.fear * dt);

    // Конец прогулки
    if (L.mood <= 0) {
      s.over = true;
      s.result = finishWalk(s, 'sad');
      events.push({ type: 'end', reason: 'sad' });
    } else if (s.timeUp && safe) {
      s.over = true;
      s.result = finishWalk(s, 'home');
      events.push({ type: 'end', reason: 'home' });
    }
    return events;
  }

  /* ------------------------------ итоги ------------------------------ */

  function starsFor(score, level) {
    var n = 0;
    for (var i = 0; i < level.stars.length; i++) if (score >= level.stars[i]) n = i + 1;
    return n;
  }

  /** reason: home - вернулся домой, sad - настроение кончилось, quit - вышел сам. */
  function finishWalk(s, reason) {
    var home = reason === 'home' ? CONFIG.HOME_BONUS : 0;
    var moodBonus = reason === 'quit' ? 0 : Math.round(s.louis.mood * CONFIG.END_MOOD_SCORE);
    var score = s.stats.score + home + moodBonus;
    return {
      reason: reason,
      score: score,
      stars: reason === 'quit' ? 0 : starsFor(score, s.level),
      itemsScore: s.stats.score,
      homeBonus: home,
      moodBonus: moodBonus,
      treats: s.stats.treats,
      toys: s.stats.toys,
      friends: s.stats.friends.slice(),
      scares: s.stats.scares
    };
  }

  /* ------------------------------ прогресс ------------------------------ */

  var STORAGE_KEY = 'louis-progress-v1';

  function emptyProgress() {
    return { levels: {}, friends: [], totals: { treats: 0, toys: 0, walks: 0 } };
  }

  function loadProgress(storage) {
    var p = emptyProgress();
    try {
      var raw = JSON.parse(storage.getItem(STORAGE_KEY));
      if (!raw || typeof raw !== 'object') return p;
      if (raw.levels && typeof raw.levels === 'object') {
        LEVELS.forEach(function (lv) {
          var e = raw.levels[lv.id];
          if (e && isFinite(e.best) && isFinite(e.stars)) {
            p.levels[lv.id] = { best: Math.max(0, Math.floor(e.best)), stars: clamp(Math.floor(e.stars), 0, 3) };
          }
        });
      }
      if (Array.isArray(raw.friends)) p.friends = raw.friends.filter(function (f) { return typeof f === 'string'; });
      if (raw.totals) {
        ['treats', 'toys', 'walks'].forEach(function (k) {
          if (isFinite(raw.totals[k]) && raw.totals[k] > 0) p.totals[k] = Math.floor(raw.totals[k]);
        });
      }
    } catch (e) { /* пустое, битое или недоступное хранилище */ }
    return p;
  }

  function saveProgress(storage, p) {
    try { storage.setItem(STORAGE_KEY, JSON.stringify(p)); return true; } catch (e) { return false; }
  }

  /** Записывает итог прогулки. Возвращает { progress, isBest, newFriends }. */
  function recordWalk(p, levelId, result) {
    var next = JSON.parse(JSON.stringify(p));
    var prev = next.levels[levelId] || { best: 0, stars: 0 };
    var isBest = result.score > prev.best;
    next.levels[levelId] = { best: Math.max(prev.best, result.score), stars: Math.max(prev.stars, result.stars) };
    var newFriends = result.friends.filter(function (f) { return next.friends.indexOf(f) < 0; });
    next.friends = next.friends.concat(newFriends);
    next.totals.treats += result.treats;
    next.totals.toys += result.toys;
    next.totals.walks += 1;
    return { progress: next, isBest: isBest, newFriends: newFriends };
  }

  /** Прогулка открыта, если на предыдущей есть хотя бы одна звезда. */
  function isUnlocked(p, levelIndex) {
    if (levelIndex <= 0) return true;
    var prev = p.levels[LEVELS[levelIndex - 1].id];
    return !!(prev && prev.stars >= 1);
  }

  function allFriendNames() {
    return LEVELS.reduce(function (acc, lv) { return acc.concat(lv.smallDogs); }, []);
  }

  return {
    CONFIG: CONFIG, LEVELS: LEVELS, WORLD: WORLD, STORAGE_KEY: STORAGE_KEY,
    clamp: clamp, dist: dist, inSafeZone: inSafeZone,
    pushOutOfRect: pushOutOfRect, pushOutOfCircle: pushOutOfCircle,
    moveEntity: moveEntity, isFree: isFree, randomFreePoint: randomFreePoint,
    keepOutOfSafeZone: keepOutOfSafeZone, pickItemKind: pickItemKind, spawnItem: spawnItem,
    createWalk: createWalk, stepLouis: stepLouis, trySniff: trySniff, nearestItems: nearestItems,
    stepBigDog: stepBigDog, stepSmallDog: stepSmallDog, computeFear: computeFear,
    stepWalk: stepWalk, starsFor: starsFor, finishWalk: finishWalk,
    emptyProgress: emptyProgress, loadProgress: loadProgress, saveProgress: saveProgress,
    recordWalk: recordWalk, isUnlocked: isUnlocked, allFriendNames: allFriendNames
  };
});
