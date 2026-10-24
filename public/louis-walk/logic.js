/*
 * Выгуляй Луи - ядро игры: баланс, карта двора и вся симуляция прогулки.
 * Без DOM и Canvas: работает в браузере (window.WalkLogic) и в Node.js для тестов.
 *
 * Координаты мира - плоскость земли двора: x и y от 0 до 1000.
 * На экране двор рисуется в изометрии: см. ISO и toScreenDir.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.WalkLogic = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ================================================================
   *  БАЛАНС - все параметры в одном месте.
   *  Расстояния в единицах двора (двор 1000 x 1000), время в секундах.
   *  Шкалы от 0 до 100, полная шкала - цель выполнена.
   * ================================================================ */
  var CONFIG = {
    WALK_TIME: 180,             // длительность прогулки

    // Луи
    LOUIS_R: 13,
    WALK_SPEED: 115,            // шаг при сильном отклонении джойстика
    RUN_SPEED: 215,             // бег: джойстик до упора
    RUN_DEFLECTION: 0.8,
    DEADZONE: 0.12,
    STILL_SPEED: 12,            // медленнее - считается, что Луи стоит
    PANIC_SPEED: 250,           // убегает к подъезду после испуга
    PANIC_TIME: 3,
    SNIFF_DURATION: 3,          // кнопка «Нюх»
    SNIFF_COOLDOWN: 6,
    SNIFF_MOVE_FACTOR: 0.6,
    REVEAL_R: 80,               // спрятанное в листьях видно вблизи
    SNIFF_REVEAL_R: 240,        // и в этом радиусе во время нюха
    PICKUP_R: 18,

    // Хозяин и рулетка
    OWNER_R: 12,
    OWNER_SPEED: 90,
    OWNER_HURRY_SPEED: 175,
    LEASH_SLACK: 80,            // ближе - хозяин стоит
    LEASH_MAX: 210,             // длина рулетки
    LEASH_PANIC: 700,           // при испуге рулетка разматывается
    LEASH_REEL_SPEED: 160,      // потом сматывается обратно
    PICKUP_POOP_TIME: 1.4,      // хозяин убирает пакетом
    GIVE_R: 42,                 // поднести игрушку, чтобы её кинули
    THROW_MIN: 110,
    THROW_MAX: 190,
    THROW_FLIGHT: 0.8,
    MAX_FETCHES: 5,             // потом игрушку убирают в карман

    // Шкала «пописать»: метки на деревьях, столбах, кустах
    PEE_PER_MARK: 34,           // 3 метки - шкала полная
    MARK_R: 30,                 // как близко к месту надо стоять
    SCENT_CHANCE: 0.5,          // доля мест с запахом: метит только их, остальные «не то»
    PEE_COOLDOWN: 4,            // пауза между метками
    PEE_SNIFF_TIME: 0.9,
    PEE_TIME: 1.4,

    // Шкала «покакать»: один раз на траве
    POOP_SNIFF_TIME: 1.3,
    POOP_SPIN_TIME: 1.3,
    POOP_TIME: 1.6,
    POOP_READY_WALK: 800,       // покакать захочется, когда Луи нагуляется (путь в единицах двора)
    POOP_PRIVACY_R: 100,        // рядом не должно быть чужих людей и собак
    DISTURB_FEAR: 0.35,         // при таком страхе Луи передумывает

    // Шкала «сбросить энергию»
    ENERGY_RUN: 0.014,          // за единицу пути бегом
    ENERGY_WALK: 0.004,         // за единицу пути шагом
    ENERGY_PILE: 12,            // прыжок в полную кучу листьев
    ENERGY_FETCH: 10,           // принёс брошенную игрушку
    ENERGY_PIGEONS: 8,
    ENERGY_CAT: 10,
    ENERGY_PUDDLE: 3,
    PLAY_ENERGY_MULT: 2.5,      // бег рядом с подружившейся собакой

    // Шкала «зарядить счастье»
    HAPPY_FRIEND: 22,
    HAPPY_GRANDMA: 12,
    HAPPY_KID: 8,
    HAPPY_PILE: 4,
    HAPPY_FETCH: 4,
    HAPPY_PIGEONS: 3,
    HAPPY_CAT: 3,
    HAPPY_SCARE: -20,
    HAPPY_BAD: -15,
    HAPPY_SCOLD: -5,
    HAPPY_YAP: -5,

    // Вещи
    ITEMS: {
      cookie:      { group: 'treat', name: 'печеньку', happy: 8 },
      biscuit:     { group: 'treat', name: 'косточку', happy: 8 },
      sausage:     { group: 'treat', name: 'сосиску',  happy: 12 },
      ball:        { group: 'toy',   name: 'мячик' },
      stick:       { group: 'toy',   name: 'палку' },
      chestnut:    { group: 'bad',   name: 'каштан' },
      chickenbone: { group: 'bad',   name: 'куриную кость' },
      wrapper:     { group: 'bad',   name: 'обёртку' },
      mushroom:    { group: 'bad',   name: 'гриб' }
    },
    TREATS: 6,
    BAD_ITEMS: 7,
    CHESTNUT_RESPAWN: 18,       // каштаны падают снова

    // «Фу»
    TEMPT_R: 75,                // рядом с гадостью Луи начинает к ней тянуться
    TEMPT_FREEZE: 0.6,          // сначала замирает и принюхивается: время среагировать
    TEMPT_SPEED: 55,            // потом тянется к ней не быстрее этого
    TEMPT_PULL: 0.6,            // насколько сильно тянет против управления
    TEMPT_PULL_RUN: 0.35,       // если тянуть прочь со всей силы, можно увести
    FU_IGNORE_TIME: 8,          // после «Фу» эта гадость его не интересует
    FU_CALM_TIME: 3,            // и пару секунд никакая другая
    BAD_POOP_ROLLBACK: 100,     // съел гадость - шкала «покакать» откатывается

    // Чужие собаки с хозяевами
    MAX_PAIRS: 3,
    FIRST_PAIR_AT: 5,
    PAIR_INTERVAL: [16, 30],
    PAIR_WALK_SPEED: 52,
    DOG_LEASH: 55,
    BIG_ANGRY_CHANCE: 0.6,      // большая собака злая, иначе добрая
    SMALL_GRUMPY_CHANCE: 0.25,  // маленькая вредная, иначе добрая
    GREET_R: 130,
    INVITE_R: 190,
    FRIEND_SNIFF_R: 44,
    FRIEND_SNIFF_TIME: 1.5,
    PLAY_TIME: 7,
    WARN_R: 230,
    NOTICE_R: 160,
    ALERT_TIME: 0.9,
    BREAK_FREE_CHANCE: 0.75,    // хозяин не удержал поводок
    CHASE_SPEED: 195,
    CHASE_TIME: 6,
    LOSE_R: 360,
    CATCH_COOLDOWN: 14,
    YAP_R: 75,
    YAP_COOLDOWN: 6,
    FEAR_R: 240,

    // Люди
    PET_R: 46,
    PET_TIME: 1.1,
    GRANDMA_COOLDOWN: 25,
    KID_COOLDOWN: 16,
    KID_RUN_R: 150,

    // Голуби, кошки, дворник, кучи, лужи
    PIGEON_FLEE_R: 75,
    PIGEON_FLY_TIME: 2.4,
    CAT_FLEE_R: 95,
    CAT_SPEED: 240,
    CAT_PERCH_TIME: 14,
    PILE_R: 24,
    PILE_MIN_SIZE: 0.35,
    PILE_JUMP_SPEED: 50,
    SWEEP_RATE: 0.22,
    SCOLD_R: 170,
    JANITOR_SPEED: 45,
    WIND_INTERVAL: [14, 26],
    WIND_PILE_LOSS: 0.3,

    // Погода (каждая прогулка случайная)
    RAIN_CHANCE: 0.3,
    WIND_CHANCE: 0.5,
    EVENING_CHANCE: 0.4,

    // Зона у подъезда: сюда злые собаки не заходят
    SAFE_R: 70,

    // Очки
    TIME_BONUS: 2,              // за каждую оставшуюся секунду, если всё сделал и пришёл домой
    FRIEND_SCORE: 15,
    TREAT_SCORE: 5,
    BAD_SCORE: -10
  };

  /* Изометрия: поворот на 45 градусов и сжатие по вертикали в 2 раза. */
  var ISO = { X: 0.7071, Y: 0.3536 };

  /* ================================================================
   *  КАРТА ДВОРА
   *  Дом буквой Г вдоль дальних краёв, у ближних краёв забор с калитками.
   * ================================================================ */
  var WORLD = {
    size: 1000,
    door: { x: 520, y: 110 },
    safe: { x: 520, y: 152 },
    buildings: [
      { x: 120, y: 0, w: 880, h: 110, height: 230, doorsAlongX: [300, 520, 800] },
      { x: 0, y: 0, w: 120, h: 1000, height: 230, doorsAlongY: [420, 760] }
    ],
    // Дорожки из плитки. Всё, что не дорожка и не площадка, - газон
    paths: [
      { x: 120, y: 110, w: 880, h: 60 },
      { x: 120, y: 170, w: 60, h: 830 },
      { x: 490, y: 170, w: 60, h: 330 },
      { x: 180, y: 500, w: 820, h: 60 },
      { x: 300, y: 560, w: 60, h: 440 },
      { x: 700, y: 560, w: 40, h: 80 }
    ],
    playground: { x: 620, y: 640, w: 250, h: 230 },
    sandbox: { x: 660, y: 690, w: 80, h: 70 },
    solids: [
      { x: 120, y: 0, w: 880, h: 110, kind: 'building' },
      { x: 0, y: 0, w: 120, h: 1000, kind: 'building' },
      { x: 340, y: 186, w: 70, h: 22, kind: 'bench', grandma: true },
      { x: 610, y: 186, w: 70, h: 22, kind: 'bench' },
      { x: 930, y: 180, w: 70, h: 36, kind: 'bins' }, // вплотную к забору, без щели
      { x: 940, y: 600, w: 60, h: 100, kind: 'car', color: '#c0392b' },
      { x: 940, y: 730, w: 60, h: 100, kind: 'car', color: '#ecf0f1' },
      { x: 940, y: 860, w: 60, h: 100, kind: 'car', color: '#2c3e50' },
      { x: 780, y: 680, w: 60, h: 12, kind: 'swings' },
      { x: 770, y: 790, w: 24, h: 60, kind: 'slide' }
    ],
    trees: [
      { x: 230, y: 260, r: 10, type: 'maple' }, { x: 700, y: 300, r: 10, type: 'maple' },
      { x: 420, y: 700, r: 10, type: 'maple' }, { x: 250, y: 880, r: 10, type: 'maple' },
      { x: 380, y: 300, r: 9, type: 'birch' }, { x: 560, y: 700, r: 9, type: 'birch' },
      { x: 215, y: 650, r: 9, type: 'birch' }, { x: 300, y: 410, r: 11, type: 'chestnut' },
      { x: 800, y: 270, r: 10, type: 'linden' }, { x: 450, y: 950, r: 10, type: 'linden' },
      { x: 700, y: 950, r: 10, type: 'linden' }, { x: 860, y: 420, r: 10, type: 'maple' }
    ],
    bushes: [
      { x: 420, y: 420, r: 30 }, { x: 650, y: 440, r: 28 }, { x: 225, y: 770, r: 30 },
      { x: 500, y: 830, r: 28 }, { x: 860, y: 960, r: 26 }, { x: 590, y: 960, r: 26 }
    ],
    lamps: [
      { x: 480, y: 235, r: 5 }, { x: 562, y: 400, r: 5 }, { x: 250, y: 490, r: 5 },
      { x: 680, y: 490, r: 5 }, { x: 372, y: 700, r: 5 }, { x: 372, y: 900, r: 5 },
      { x: 880, y: 490, r: 5 }
    ],
    pumpkins: [{ x: 470, y: 118, r: 8 }, { x: 571, y: 117, r: 7 }, { x: 585, y: 116, r: 6 }], // вплотную к стене, без щелей
    piles: [{ x: 430, y: 340 }, { x: 640, y: 380 }, { x: 240, y: 615 }, { x: 560, y: 610 }, { x: 450, y: 880 }, { x: 780, y: 950 }],
    pigeonSpots: [{ x: 445, y: 235 }, { x: 600, y: 530 }, { x: 870, y: 245 }, { x: 330, y: 760 }],
    catSpots: [{ x: 905, y: 660 }, { x: 900, y: 900 }],
    puddles: [
      { x: 520, y: 330, rx: 30, ry: 22 }, { x: 410, y: 530, rx: 34, ry: 22 },
      { x: 330, y: 800, rx: 26, ry: 20 }, { x: 770, y: 530, rx: 30, ry: 22 }, { x: 150, y: 620, rx: 22, ry: 26 }
    ],
    // Маршруты чужих собак: от калитки по дорожкам и обратно
    gates: [{ x: 330, y: 995 }, { x: 995, y: 530 }],
    routes: [
      [{ x: 330, y: 995 }, { x: 330, y: 530 }, { x: 520, y: 530 }, { x: 900, y: 530 }, { x: 995, y: 530 }],
      [{ x: 995, y: 530 }, { x: 520, y: 530 }, { x: 330, y: 530 }, { x: 330, y: 995 }],
      [{ x: 330, y: 995 }, { x: 330, y: 530 }, { x: 720, y: 540 }, { x: 720, y: 640 }, { x: 720, y: 540 }, { x: 330, y: 530 }, { x: 330, y: 995 }],
      [{ x: 995, y: 530 }, { x: 720, y: 540 }, { x: 720, y: 660 }, { x: 720, y: 540 }, { x: 330, y: 530 }, { x: 330, y: 995 }]
    ],
    playgroundBounds: { x: 640, y: 660, w: 210, h: 190 },
    grandmaSpot: { x: 375, y: 235 },
    // Шкала газона для спавна: дальше от дома
    spawn: { x0: 140, y0: 180, x1: 985, y1: 985 }
  };

  // Места, которые Луи может пометить: деревья, столбы, кусты, углы машин и баков, столбики забора
  function buildMarkSpots() {
    var spots = [];
    WORLD.trees.forEach(function (t) { spots.push({ x: t.x, y: t.y, kind: 'tree' }); });
    WORLD.lamps.forEach(function (l) { spots.push({ x: l.x, y: l.y, kind: 'lamp' }); });
    WORLD.bushes.forEach(function (b) { spots.push({ x: b.x, y: b.y + b.r * 0.6, kind: 'bush' }); });
    WORLD.solids.forEach(function (s) {
      if (s.kind === 'car') spots.push({ x: s.x - 2, y: s.y + 20, kind: 'car' });
      if (s.kind === 'bins') spots.push({ x: s.x + 10, y: s.y + s.h + 2, kind: 'bins' });
    });
    [200, 450, 650, 850].forEach(function (x) { spots.push({ x: x, y: 997, kind: 'fence' }); });
    [220, 420, 700].forEach(function (y) { spots.push({ x: 997, y: y, kind: 'fence' }); });
    return spots;
  }

  /* ------------------------------ утилиты ------------------------------ */
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function dist(ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return Math.sqrt(dx * dx + dy * dy); }
  function d2(a, b) { return dist(a.x, a.y, b.x, b.y); }
  function rand(rng, a, b) { return a + rng() * (b - a); }
  function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
  function inRect(x, y, r) { return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h; }

  /** Направление на экране (dx, dy) в направление на земле двора. */
  function toWorldDir(sx, sy) {
    var a = sx / ISO.X, b = sy / ISO.Y;
    return { x: (a + b) / 2, y: (b - a) / 2 };
  }
  /** Смещение на земле в смещение на экране. */
  function toScreenDir(wx, wy) {
    return { x: (wx - wy) * ISO.X, y: (wx + wy) * ISO.Y };
  }

  function inSafeZone(x, y) { return dist(x, y, WORLD.safe.x, WORLD.safe.y) < CONFIG.SAFE_R; }

  function isLawn(x, y) {
    if (x < 125 || y < 115 || x > 1000 || y > 1000) return false;
    for (var i = 0; i < WORLD.paths.length; i++) if (inRect(x, y, WORLD.paths[i])) return false;
    if (inRect(x, y, WORLD.playground)) return false;
    return true;
  }

  /* ---------------------------- столкновения ---------------------------- */
  function pushOutOfRect(e, r, rect) {
    var cx = clamp(e.x, rect.x, rect.x + rect.w), cy = clamp(e.y, rect.y, rect.y + rect.h);
    var dx = e.x - cx, dy = e.y - cy, q = dx * dx + dy * dy;
    if (q >= r * r) return false;
    if (q > 1e-9) {
      var d = Math.sqrt(q), k = (r - d) / d;
      e.x += dx * k; e.y += dy * k;
      return true;
    }
    var left = e.x - rect.x, right = rect.x + rect.w - e.x, top = e.y - rect.y, bottom = rect.y + rect.h - e.y;
    var m = Math.min(left, right, top, bottom);
    if (m === left) e.x = rect.x - r; else if (m === right) e.x = rect.x + rect.w + r;
    else if (m === top) e.y = rect.y - r; else e.y = rect.y + rect.h + r;
    return true;
  }
  function pushOutOfCircle(e, r, c) {
    var dx = e.x - c.x, dy = e.y - c.y, min = r + c.r, q = dx * dx + dy * dy;
    if (q >= min * min) return false;
    var d = Math.sqrt(q);
    if (d < 1e-6) { e.y = c.y + min; return true; }
    var k = (min - d) / d;
    e.x += dx * k; e.y += dy * k;
    return true;
  }
  var CIRCLES = WORLD.trees.concat(WORLD.lamps, WORLD.pumpkins);

  function resolveCollisions(e, r) {
    var hit = false;
    for (var i = 0; i < WORLD.solids.length; i++) hit = pushOutOfRect(e, r, WORLD.solids[i]) || hit;
    for (var j = 0; j < CIRCLES.length; j++) hit = pushOutOfCircle(e, r, CIRCLES[j]) || hit;
    var lo = r, hi = WORLD.size - r;
    if (e.x < lo) { e.x = lo; hit = true; } else if (e.x > hi) { e.x = hi; hit = true; }
    if (e.y < lo) { e.y = lo; hit = true; } else if (e.y > hi) { e.y = hi; hit = true; }
    return hit;
  }
  function moveEntity(e, r, dx, dy) {
    var ox = e.x, oy = e.y;
    e.x += dx; e.y += dy;
    for (var i = 0; i < 4; i++) if (!resolveCollisions(e, r)) break;
    return dist(ox, oy, e.x, e.y);
  }
  function isFree(x, y, r) {
    if (x < r || y < r || x > WORLD.size - r || y > WORLD.size - r) return false;
    for (var i = 0; i < WORLD.solids.length; i++) {
      var s = WORLD.solids[i];
      if (dist(x, y, clamp(x, s.x, s.x + s.w), clamp(y, s.y, s.y + s.h)) < r) return false;
    }
    for (var j = 0; j < CIRCLES.length; j++) if (dist(x, y, CIRCLES[j].x, CIRCLES[j].y) < r + CIRCLES[j].r) return false;
    return true;
  }
  function randomPoint(rng, r, accept) {
    var a = WORLD.spawn;
    for (var i = 0; i < 500; i++) {
      var x = rand(rng, a.x0, a.x1), y = rand(rng, a.y0, a.y1);
      if (isFree(x, y, r) && (!accept || accept(x, y))) return { x: x, y: y };
    }
    return { x: 520, y: 600 };
  }
  function keepOutOfSafeZone(e) {
    var d = dist(e.x, e.y, WORLD.safe.x, WORLD.safe.y), min = CONFIG.SAFE_R + e.r;
    if (d >= min) return;
    if (d < 1e-6) { e.y = WORLD.safe.y + min; return; }
    e.x = WORLD.safe.x + (e.x - WORLD.safe.x) / d * min;
    e.y = WORLD.safe.y + (e.y - WORLD.safe.y) / d * min;
    resolveCollisions(e, e.r);
  }

  /** Двигает к точке; возвращает пройденное. Обновляет facing по экрану и застревание. */
  function moveToward(e, tx, ty, speed, dt) {
    var dx = tx - e.x, dy = ty - e.y, l = Math.sqrt(dx * dx + dy * dy);
    if (l < 1e-6) return 0;
    var step = Math.min(l, speed * dt);
    var moved = moveEntity(e, e.r, dx / l * step, dy / l * step);
    setFacing(e, dx, dy);
    e.phase = (e.phase || 0) + moved * 0.12;
    e.stuck = moved < step * 0.3 ? (e.stuck || 0) + dt : 0;
    return moved;
  }
  function setFacing(e, dx, dy) {
    var sx = (dx - dy) * ISO.X;
    if (Math.abs(sx) > 0.05) e.facing = sx > 0 ? 1 : -1;
  }

  /* ------------------------------ создание ------------------------------ */
  var BIG_DOGS = [
    { name: 'Рекс', look: 'shepherd' }, { name: 'Барон', look: 'rottweiler' },
    { name: 'Гром', look: 'husky' }, { name: 'Бакс', look: 'labrador' }, { name: 'Граф', look: 'doberman' }
  ];
  var SMALL_DOGS = [
    { name: 'Бусинка', look: 'bichon' }, { name: 'Тоша', look: 'terrier' }, { name: 'Кнопка', look: 'pug' },
    { name: 'Пиксель', look: 'chihuahua' }, { name: 'Ричи', look: 'dachshund' }, { name: 'Зефирка', look: 'pinkpoodle' },
    { name: 'Луна', look: 'spitz' }, { name: 'Чапа', look: 'corgi' }
  ];
  var PEOPLE_LOOKS = ['jacketBlue', 'jacketGreen', 'coatBeige', 'hoodieRed', 'parkaYellow', 'coatPlum'];
  var OWNERS = ['pink', 'coat']; // человек в розовой футболке или в длинном сером пальто

  var idSeq = 1;
  function nextId() { return idSeq++; }

  function makeItem(kind, x, y, extra) {
    var it = { id: nextId(), kind: kind, group: CONFIG.ITEMS[kind].group, x: x, y: y, z: 0,
      revealed: CONFIG.ITEMS[kind].group !== 'treat', ignoredUntil: -1, state: 'ground', fetches: 0, thrown: false };
    for (var k in extra) it[k] = extra[k];
    return it;
  }

  function spawnTreat(s, rng) {
    var L = s.louis;
    var p = randomPoint(rng, 10, function (x, y) {
      return isLawn(x, y) && !inSafeZone(x, y) && (!L || dist(x, y, L.x, L.y) > 160);
    });
    return makeItem(pick(rng, ['cookie', 'biscuit', 'biscuit', 'sausage']), p.x, p.y);
  }

  function spawnBad(s, rng, kind) {
    var L = s.louis, chest = WORLD.trees.filter(function (t) { return t.type === 'chestnut'; })[0];
    var p;
    if (kind === 'chestnut') {
      for (var i = 0; i < 40 && !p; i++) {
        var a = rng() * Math.PI * 2, r = rand(rng, 20, 75);
        var x = chest.x + Math.cos(a) * r, y = chest.y + Math.sin(a) * r;
        if (isFree(x, y, 8) && (!L || dist(x, y, L.x, L.y) > 90)) p = { x: x, y: y };
      }
    } else if (kind === 'mushroom') {
      for (var j = 0; j < 40 && !p; j++) {
        var t = pick(rng, WORLD.trees), b = rng() * Math.PI * 2;
        var mx = t.x + Math.cos(b) * 30, my = t.y + Math.sin(b) * 30;
        if (isFree(mx, my, 8) && isLawn(mx, my) && (!L || dist(mx, my, L.x, L.y) > 90)) p = { x: mx, y: my };
      }
    }
    if (!p) {
      p = randomPoint(rng, 8, function (x, y) {
        return !inSafeZone(x, y) && dist(x, y, WORLD.safe.x, WORLD.safe.y) > CONFIG.SAFE_R + 40 && (!L || dist(x, y, L.x, L.y) > 120);
      });
    }
    return makeItem(kind, p.x, p.y);
  }

  function rollCharacter(size, rng) {
    if (size === 'big') return rng() < CONFIG.BIG_ANGRY_CHANCE ? 'angry' : 'friendly';
    return rng() < CONFIG.SMALL_GRUMPY_CHANCE ? 'grumpy' : 'friendly';
  }

  function spawnPair(s, rng) {
    var used = s.pairs.map(function (p) { return p.dog.name; }).concat(s.pairNamesUsed);
    var big = rng() < 0.45;
    var roster = (big ? BIG_DOGS : SMALL_DOGS).filter(function (d) { return used.indexOf(d.name) < 0; });
    if (!roster.length) roster = big ? BIG_DOGS : SMALL_DOGS;
    var breed = pick(rng, roster);
    var route = pick(rng, WORLD.routes);
    var start = route[0];
    var owner = { x: start.x, y: start.y, r: CONFIG.OWNER_R, look: pick(rng, PEOPLE_LOOKS), facing: 1, phase: 0, speed: 0,
      route: route, ni: 1, wait: 0, stuck: 0 };
    var dog = { name: breed.name, look: breed.look, size: big ? 'big' : 'small', r: big ? 20 : 11,
      x: start.x + 20, y: start.y - 20, character: rollCharacter(big ? 'big' : 'small', rng),
      state: 'leash', t: 0, progress: 0, friend: false, invited: false, warned: false, cooldown: 2,
      facing: 1, phase: 0, speed: 0, wander: { x: start.x, y: start.y }, wanderT: 0, stuck: 0 };
    resolveCollisions(dog, dog.r);
    var pair = { id: nextId(), owner: owner, dog: dog, done: false };
    s.pairs.push(pair);
    s.pairNamesUsed.push(breed.name);
    return pair;
  }

  /**
   * Новая прогулка. opts: { rain, wind, evening, owner } - чтобы задать погоду явно (тесты).
   */
  function createWalk(rng, opts) {
    rng = rng || Math.random;
    opts = opts || {};
    var evening = opts.evening !== undefined ? opts.evening : rng() < CONFIG.EVENING_CHANCE;
    var rain = opts.rain !== undefined ? opts.rain : rng() < CONFIG.RAIN_CHANCE;
    var wind = opts.wind !== undefined ? opts.wind : rng() < CONFIG.WIND_CHANCE;
    var s = {
      t: 0, time: CONFIG.WALK_TIME, over: false, result: null,
      weather: { rain: rain, wind: wind, evening: evening },
      louis: { x: WORLD.safe.x + 20, y: WORLD.safe.y + 36, r: CONFIG.LOUIS_R, facing: 1, phase: 0, speed: 0,
        running: false, panic: 0, act: null, sniff: 0, sniffCd: 0, carry: null, tempt: null, fear: 0,
        dirty: false, inPuddle: false, jump: 0, leashMax: CONFIG.LEASH_MAX, taut: false, stuck: 0, temptT: 0 },
      owner: { x: WORLD.safe.x - 14, y: WORLD.safe.y + 4, r: CONFIG.OWNER_R, look: opts.owner || pick(rng, OWNERS),
        facing: 1, phase: 0, speed: 0, act: null, stuck: 0, detour: 0, detourDir: 1 },
      meters: { pee: 0, poop: 0, energy: 0, happy: 0 },
      items: [], piles: [], pairs: [], pairNamesUsed: [], poops: [],
      marks: buildMarkSpots().map(function (m) { return { x: m.x, y: m.y, kind: m.kind, marked: false, sniffed: false, scent: rng() < CONFIG.SCENT_CHANCE }; }),
      grandma: null, kids: [], janitor: null, flocks: [], cats: [],
      nextPairAt: CONFIG.FIRST_PAIR_AT, windAt: wind ? rand(rng, CONFIG.WIND_INTERVAL[0], CONFIG.WIND_INTERVAL[1]) : Infinity,
      chestnutAt: CONFIG.CHESTNUT_RESPAWN, playMult: 1, allDone: false, walked: 0, peeCd: 0, fuCalm: 0,
      stats: { friends: [], treats: 0, fetches: 0, fu: 0, ateBad: 0, scares: 0, piles: 0, pigeons: 0, cats: 0, puddles: 0, marks: 0, pets: 0 }
    };

    // Вещи
    for (var i = 0; i < CONFIG.TREATS; i++) s.items.push(spawnTreat(s, rng));
    var badKinds = ['chestnut', 'chestnut', 'chestnut', 'mushroom', 'wrapper', 'wrapper', 'chickenbone'];
    for (var b = 0; b < CONFIG.BAD_ITEMS; b++) s.items.push(spawnBad(s, rng, badKinds[b % badKinds.length]));
    s.items.push(makeItem('ball', 700, 620));
    var stickTree = pick(rng, WORLD.trees.filter(function (t) { return t.type !== 'chestnut'; }));
    var sp = randomPoint(rng, 10, function (x, y) { return dist(x, y, stickTree.x, stickTree.y) < 70 && isLawn(x, y); });
    s.items.push(makeItem('stick', sp.x, sp.y));

    // Кучи листьев
    s.piles = WORLD.piles.map(function (p) { return { x: p.x, y: p.y, size: rain ? 0.6 : 0.6 + rng() * 0.4 }; });

    // Люди
    if (!rain && rng() < (evening ? 0.5 : 0.9)) s.grandma = { x: 375, y: 197, cd: 0, progress: 0 };
    var kidN = rain ? 0 : evening ? (rng() < 0.4 ? 1 : 0) : 1 + Math.floor(rng() * 2);
    for (var k = 0; k < kidN; k++) {
      var kp = randomPoint(rng, 10, function (x, y) { return inRect(x, y, WORLD.playgroundBounds); });
      s.kids.push({ id: nextId(), x: kp.x, y: kp.y, r: 9, target: { x: kp.x, y: kp.y }, wait: rng() * 2, cd: 0, progress: 0,
        facing: 1, phase: 0, speed: 0, look: k % 2 ? 'kidA' : 'kidB', stuck: 0 });
    }
    if (!rain && !evening) {
      s.janitor = { x: 820, y: 330, r: 11, facing: 1, phase: 0, speed: 0, target: null, sweeping: false, wait: 0, stuck: 0 };
    }

    // Голуби и кошки
    var flockN = rain ? 1 : 2;
    var spots = WORLD.pigeonSpots.slice();
    for (var f = 0; f < flockN; f++) {
      var idx = Math.floor(rng() * spots.length), spot = spots.splice(idx, 1)[0];
      var birds = [];
      for (var n = 0; n < 4 + Math.floor(rng() * 3); n++) birds.push({ ox: rand(rng, -22, 22), oy: rand(rng, -16, 16), ph: rng() * 6 });
      s.flocks.push({ id: nextId(), x: spot.x, y: spot.y, state: 'ground', t: 0, from: null, to: null, birds: birds, cd: 0 });
    }
    var catN = rain ? 0 : 1 + (rng() < 0.4 ? 1 : 0);
    for (var c = 0; c < catN; c++) {
      var cs = WORLD.catSpots[c];
      s.cats.push({ id: nextId(), x: cs.x, y: cs.y, z: 0, home: { x: cs.x, y: cs.y }, state: 'sit', t: 0, perch: null,
        facing: -1, phase: 0, speed: 0, color: c ? 'ginger' : 'gray', rewarded: false });
    }
    return s;
  }

  /* ------------------------------ шкалы ------------------------------ */
  function addMeter(s, key, v) { s.meters[key] = clamp(s.meters[key] + v, 0, 100); }

  /* ------------------------------ Луи ------------------------------ */
  function cancelAct(s, events, why) {
    var L = s.louis;
    if (!L.act) return;
    var visible = L.act.type !== 'sniffPee' && L.act.type !== 'sniffPoop' || L.act.t > 0.35;
    L.act = null;
    if (visible) events.push({ type: 'abort', why: why, x: L.x, y: L.y });
  }

  function stepLouis(s, input, dt, events) {
    var L = s.louis, C = CONFIG;
    L.sniff = Math.max(0, L.sniff - dt);
    L.sniffCd = Math.max(0, L.sniffCd - dt);
    L.jump = Math.max(0, L.jump - dt);
    var mag = clamp(input && input.mag || 0, 0, 1);
    var il = input ? Math.sqrt(input.x * input.x + input.y * input.y) : 0;
    var moving = mag > C.DEADZONE && il > 1e-6;
    var dx = 0, dy = 0, speed = 0;
    L.running = false;

    if (L.panic > 0) {
      L.panic -= dt;
      var px = WORLD.safe.x - L.x, py = WORLD.safe.y - L.y, pl = Math.sqrt(px * px + py * py) || 1;
      dx = px / pl; dy = py / pl;
      speed = C.PANIC_SPEED;
      L.running = true;
      if (inSafeZone(L.x, L.y)) L.panic = 0;
    } else if (L.act) {
      if (moving) cancelAct(s, events, 'move');
    }

    if (L.panic <= 0 && !L.act) {
      if (moving) {
        dx = input.x / il; dy = input.y / il;
        L.running = mag >= C.RUN_DEFLECTION || !!input.run;
        speed = L.running ? C.RUN_SPEED : C.WALK_SPEED * (0.35 + 0.65 * Math.min(1, mag / C.RUN_DEFLECTION));
        if (L.sniff > 0) speed *= C.SNIFF_MOVE_FACTOR;
      }
      if (L.tempt) {
        var it = L.tempt, tx = it.x - L.x, ty = it.y - L.y, tl = Math.sqrt(tx * tx + ty * ty) || 1;
        L.temptT += dt;
        if (L.temptT < C.TEMPT_FREEZE) {
          speed = 0; // замер и принюхивается
          setFacing(L, tx, ty);
        } else if (moving) {
          var k = L.running ? C.TEMPT_PULL_RUN : C.TEMPT_PULL;
          var bx = dx * (1 - k) + tx / tl * k, by = dy * (1 - k) + ty / tl * k, bl = Math.sqrt(bx * bx + by * by) || 1;
          dx = bx / bl; dy = by / bl;
          speed = Math.min(speed, C.TEMPT_SPEED * 1.4);
        } else {
          dx = tx / tl; dy = ty / tl; speed = C.TEMPT_SPEED;
        }
      }
    }

    var moved = speed > 0 ? moveEntity(L, L.r, dx * speed * dt, dy * speed * dt) : 0;
    applyLeash(s, dt);
    L.speed = dt > 0 ? moved / dt : 0;
    L.phase += moved * 0.15;
    if (speed > 0) setFacing(L, dx, dy);
    var e = moved * (L.running ? C.ENERGY_RUN : C.ENERGY_WALK) * (L.running ? s.playMult : 1);
    if (L.panic <= 0) { addMeter(s, 'energy', e); s.walked += moved; }
    return moving;
  }

  function applyLeash(s, dt) {
    var L = s.louis, O = s.owner, C = CONFIG;
    var target = L.panic > 0 ? C.LEASH_PANIC : C.LEASH_MAX;
    if (L.leashMax < target) L.leashMax = target;
    else L.leashMax = Math.max(target, L.leashMax - C.LEASH_REEL_SPEED * dt);
    var d = d2(L, O);
    if (d > L.leashMax) {
      var k = L.leashMax / d;
      L.x = O.x + (L.x - O.x) * k;
      L.y = O.y + (L.y - O.y) * k;
      resolveCollisions(L, L.r);
      L.taut = true;
    } else {
      L.taut = d > L.leashMax * 0.96;
    }
  }

  function trySniff(s) {
    var L = s.louis;
    if (s.over || L.sniffCd > 0 || L.panic > 0) return false;
    L.sniff = CONFIG.SNIFF_DURATION;
    L.sniffCd = CONFIG.SNIFF_DURATION + CONFIG.SNIFF_COOLDOWN;
    return true;
  }

  /** «Фу!»: Луи бросает гадость, к которой тянулся. */
  function sayFu(s) {
    var L = s.louis;
    if (!L.tempt) return false;
    L.tempt.ignoredUntil = s.t + CONFIG.FU_IGNORE_TIME;
    L.tempt = null;
    s.fuCalm = CONFIG.FU_CALM_TIME;
    s.stats.fu++;
    return true;
  }

  /* ------------------------------ хозяин ------------------------------ */
  function stepOwner(s, dt, events) {
    var O = s.owner, L = s.louis, C = CONFIG;
    var moved = 0;
    if (O.act && O.act.type === 'pickup') {
      var p = O.act.target;
      if (d2(O, p) > 16) moved = steerOwner(O, p.x, p.y, C.OWNER_SPEED, dt);
      else {
        O.act.t += dt;
        if (O.act.t >= C.PICKUP_POOP_TIME) {
          s.poops = s.poops.filter(function (q) { return q !== p; });
          O.act = null;
          events.push({ type: 'cleaned', x: p.x, y: p.y });
        }
      }
    } else if (O.act && O.act.type === 'throw') {
      O.act.t -= dt;
      if (O.act.t <= 0) O.act = null;
    } else {
      var d = d2(O, L);
      if (!L.act && d > C.LEASH_SLACK) {
        var hurry = L.panic > 0 || d > L.leashMax * 0.8;
        var sp = hurry ? C.OWNER_HURRY_SPEED : C.OWNER_SPEED * Math.min(1.6, 0.6 + (d - C.LEASH_SLACK) / 80);
        moved = steerOwner(O, L.x, L.y, sp, dt);
      }
    }
    O.speed = dt > 0 ? moved / dt : 0;
  }

  /** Хозяин идёт к цели и обходит препятствия, если упёрся. */
  function steerOwner(O, tx, ty, speed, dt) {
    var dx = tx - O.x, dy = ty - O.y, l = Math.sqrt(dx * dx + dy * dy) || 1;
    dx /= l; dy /= l;
    if (O.detour > 0) {
      O.detour -= dt;
      var px = -dy * O.detourDir, py = dx * O.detourDir;
      dx = dx * 0.3 + px; dy = dy * 0.3 + py;
      var pl = Math.sqrt(dx * dx + dy * dy) || 1;
      dx /= pl; dy /= pl;
    }
    var step = Math.min(l, speed * dt);
    var moved = moveEntity(O, O.r, dx * step, dy * step);
    setFacing(O, dx, dy);
    O.phase += moved * 0.12;
    if (moved < step * 0.35) {
      O.stuck += dt;
      if (O.stuck > 0.25 && O.detour <= 0) { O.detour = 0.6; O.detourDir = -O.detourDir || 1; O.stuck = 0; }
    } else O.stuck = 0;
    return moved;
  }

  /* ------------------------------ туалет ------------------------------ */
  function nearestFreeMark(s) {
    var L = s.louis, best = null, bd = CONFIG.MARK_R + L.r;
    for (var i = 0; i < s.marks.length; i++) {
      var m = s.marks[i];
      if (m.marked || m.sniffed) continue;
      var d = d2(L, m);
      if (d < bd) { bd = d; best = m; }
    }
    return best;
  }

  /** Можно ли сейчас покакать: нагулялся, на газоне и рядом никого чужого. */
  function poopReady(s) {
    var L = s.louis, C = CONFIG;
    if (s.meters.poop >= 100 || s.walked < C.POOP_READY_WALK || !isLawn(L.x, L.y)) return false;
    var R = C.POOP_PRIVACY_R;
    var crowd = s.pairs.some(function (p) { return d2(p.dog, L) < R || d2(p.owner, L) < R; }) ||
      s.kids.some(function (k) { return d2(k, L) < R; }) ||
      (s.janitor && d2(s.janitor, L) < R) ||
      (s.grandma && d2(s.grandma, L) < R);
    return !crowd;
  }

  function stepToilet(s, dt, inputMoving, events) {
    var L = s.louis, C = CONFIG;
    if (s.peeCd > 0) s.peeCd -= dt;
    if (L.panic > 0) { if (L.act) cancelAct(s, events, 'panic'); return; }
    if (L.act && L.fear > C.DISTURB_FEAR) { cancelAct(s, events, 'fear'); return; }
    var still = !inputMoving && L.speed < C.STILL_SPEED && !L.tempt;
    if (!L.act) {
      if (!still || L.carry || s.owner.act) return;
      if (s.meters.pee < 100 && s.peeCd <= 0) {
        var m = nearestFreeMark(s);
        if (m) { L.act = { type: 'sniffPee', t: 0, spot: m }; setFacing(L, m.x - L.x, m.y - L.y); return; }
      }
      if (poopReady(s) && !nearestFreeMark(s)) L.act = { type: 'sniffPoop', t: 0 };
      return;
    }
    var a = L.act;
    a.t += dt;
    if (a.type === 'sniffPee' && a.t >= C.PEE_SNIFF_TIME) {
      if (a.spot.scent) { L.act = { type: 'pee', t: 0, spot: a.spot }; events.push({ type: 'peeStart', x: L.x, y: L.y }); }
      else { a.spot.sniffed = true; L.act = null; events.push({ type: 'notHere', x: a.spot.x, y: a.spot.y, kind: a.spot.kind }); }
    } else if (a.type === 'pee' && a.t >= C.PEE_TIME) {
      a.spot.marked = true;
      addMeter(s, 'pee', C.PEE_PER_MARK);
      s.stats.marks++;
      s.peeCd = C.PEE_COOLDOWN;
      L.act = null;
      events.push({ type: 'pee', x: a.spot.x, y: a.spot.y, kind: a.spot.kind, full: s.meters.pee >= 100 });
    } else if (a.type === 'sniffPoop' && a.t >= C.POOP_SNIFF_TIME) { L.act = { type: 'spin', t: 0 }; events.push({ type: 'poopStart', x: L.x, y: L.y }); }
    else if (a.type === 'spin' && a.t >= C.POOP_SPIN_TIME) L.act = { type: 'poop', t: 0 };
    else if (a.type === 'poop' && a.t >= C.POOP_TIME) {
      s.meters.poop = 100;
      var off = toWorldDir(-L.facing * 12, 0);
      var pile = { x: L.x + off.x, y: L.y + off.y };
      s.poops.push(pile);
      L.act = null;
      s.owner.act = { type: 'pickup', target: pile, t: 0 };
      events.push({ type: 'poop', x: pile.x, y: pile.y });
    }
  }

  /* ------------------------------ вещи ------------------------------ */
  function stepItems(s, dt, rng, events) {
    var L = s.louis, O = s.owner, C = CONFIG;
    var reveal = L.sniff > 0 ? C.SNIFF_REVEAL_R : C.REVEAL_R;
    if (s.fuCalm > 0) s.fuCalm -= dt;

    if (L.tempt && (s.items.indexOf(L.tempt) < 0 || d2(L, L.tempt) > C.TEMPT_R * 1.5 || L.panic > 0)) L.tempt = null;

    for (var i = s.items.length - 1; i >= 0; i--) {
      var it = s.items[i];
      if (it.state === 'flying') {
        it.t += dt;
        var k = Math.min(1, it.t / C.THROW_FLIGHT);
        it.x = it.from.x + (it.to.x - it.from.x) * k;
        it.y = it.from.y + (it.to.y - it.from.y) * k;
        it.z = Math.sin(k * Math.PI) * 60;
        if (k >= 1) { it.state = 'ground'; it.z = 0; it.thrown = true; events.push({ type: 'landed', x: it.x, y: it.y }); }
        continue;
      }
      if (it.state !== 'ground') continue;
      var d = d2(L, it);
      if (d < reveal) it.revealed = true;
      if (L.panic > 0 || L.act) continue;

      if (it.group === 'bad') {
        if (!L.tempt && !L.carry && s.fuCalm <= 0 && it.ignoredUntil < s.t && d < C.TEMPT_R) {
          L.tempt = it;
          L.temptT = 0;
          events.push({ type: 'tempt', kind: it.kind, x: it.x, y: it.y });
        }
        if (d < C.PICKUP_R && it.ignoredUntil < s.t && s.fuCalm <= 0) {
          s.items.splice(i, 1);
          L.tempt = null;
          addMeter(s, 'happy', C.HAPPY_BAD);
          s.meters.poop = Math.max(0, s.meters.poop - C.BAD_POOP_ROLLBACK);
          s.stats.ateBad++;
          events.push({ type: 'ateBad', kind: it.kind, x: it.x, y: it.y });
        }
      } else if (it.group === 'treat') {
        if (d < C.PICKUP_R) {
          s.items.splice(i, 1);
          addMeter(s, 'happy', C.ITEMS[it.kind].happy);
          s.stats.treats++;
          events.push({ type: 'treat', kind: it.kind, x: it.x, y: it.y });
          s.items.push(spawnTreat(s, rng));
        }
      } else if (it.group === 'toy') {
        if (!L.carry && d < C.PICKUP_R + 4) {
          it.state = 'carried';
          L.carry = it;
          if (it.thrown) {
            it.thrown = false;
            s.stats.fetches++;
            addMeter(s, 'energy', C.ENERGY_FETCH);
            addMeter(s, 'happy', C.HAPPY_FETCH);
            events.push({ type: 'fetch', kind: it.kind, x: it.x, y: it.y });
          } else events.push({ type: 'toy', kind: it.kind, x: it.x, y: it.y });
        }
      }
    }

    // Игрушка в зубах: поднёс хозяину - кинут
    if (L.carry) {
      var toy = L.carry;
      toy.x = L.x; toy.y = L.y;
      if (!O.act && d2(L, O) < C.GIVE_R && L.panic <= 0) {
        L.carry = null;
        toy.fetches++;
        if (toy.fetches > C.MAX_FETCHES) {
          s.items.splice(s.items.indexOf(toy), 1);
          events.push({ type: 'pocket', kind: toy.kind, x: O.x, y: O.y });
        } else {
          var target = randomPoint(rng, 10, function (x, y) {
            var dd = dist(x, y, O.x, O.y);
            return dd > C.THROW_MIN && dd < Math.min(C.THROW_MAX, C.LEASH_MAX * 0.9) && !inSafeZone(x, y);
          });
          toy.state = 'flying';
          toy.from = { x: O.x, y: O.y };
          toy.to = target;
          toy.t = 0;
          O.act = { type: 'throw', t: 0.45 };
          setFacing(O, target.x - O.x, target.y - O.y);
          events.push({ type: 'throw', kind: toy.kind, x: O.x, y: O.y });
        }
      }
    }

    // Каштаны падают снова
    s.chestnutAt -= dt;
    if (s.chestnutAt <= 0) {
      s.chestnutAt = C.CHESTNUT_RESPAWN;
      var n = s.items.filter(function (x) { return x.kind === 'chestnut'; }).length;
      if (n < 4) s.items.push(spawnBad(s, rng, 'chestnut'));
    }
  }

  /* ------------------------------ чужие собаки ------------------------------ */
  function stepPairOwner(pair, s, dt) {
    var o = pair.owner, dog = pair.dog;
    var holding = dog.state === 'greet' || dog.state === 'sniff' || dog.state === 'play' || dog.state === 'alert' || dog.state === 'chase' || dog.state === 'return';
    var moved = 0;
    if (!holding) {
      if (o.wait > 0) o.wait -= dt;
      else {
        var node = o.route[o.ni];
        moved = moveToward(o, node.x, node.y, CONFIG.PAIR_WALK_SPEED, dt);
        if (d2(o, node) < 8 || o.stuck > 2) {
          o.ni++;
          o.stuck = 0;
          if (o.ni >= o.route.length) pair.done = true;
          else if (Math.random() < 0.3) o.wait = 2 + Math.random() * 3;
        }
      }
    } else if (dog.state === 'play') {
      // Пока собаки играют, хозяин потихоньку идёт за своей
      if (d2(o, dog) > CONFIG.DOG_LEASH * 0.7) moved = moveToward(o, dog.x, dog.y, CONFIG.PAIR_WALK_SPEED, dt);
    }
    o.speed = dt > 0 ? moved / dt : 0;
  }

  function leashDog(dog, o) {
    var d = d2(dog, o);
    if (d > CONFIG.DOG_LEASH) {
      var k = CONFIG.DOG_LEASH / d;
      dog.x = o.x + (dog.x - o.x) * k;
      dog.y = o.y + (dog.y - o.y) * k;
      resolveCollisions(dog, dog.r);
    }
  }

  function stepPairDog(pair, s, dt, rng, events) {
    var dog = pair.dog, o = pair.owner, L = s.louis, C = CONFIG;
    var d = d2(dog, L), safe = inSafeZone(L.x, L.y), moved = 0;
    if (dog.cooldown > 0) dog.cooldown -= dt;
    var ev = function (type) { events.push({ type: type, name: dog.name, size: dog.size, character: dog.character, x: dog.x, y: dog.y, pair: pair.id }); };

    if (dog.character === 'friendly') {
      if (!dog.invited && d < C.INVITE_R) { dog.invited = true; ev('invite'); }
      if (dog.state === 'leash' && !dog.friend && d < C.GREET_R && L.panic <= 0) { dog.state = 'greet'; dog.progress = 0; }
      if (dog.state === 'greet') {
        if (d > C.GREET_R * 1.4 || L.panic > 0) dog.state = 'leash';
        else if (d > C.FRIEND_SNIFF_R) { moved = moveToward(dog, L.x, L.y, 80, dt); dog.progress = Math.max(0, dog.progress - dt * 0.5); }
        else {
          dog.progress += dt;
          setFacing(dog, L.x - dog.x, L.y - dog.y);
          if (dog.progress >= C.FRIEND_SNIFF_TIME) {
            dog.friend = true; dog.state = 'play'; dog.t = C.PLAY_TIME;
            addMeter(s, 'happy', C.HAPPY_FRIEND);
            if (s.stats.friends.indexOf(dog.name) < 0) s.stats.friends.push(dog.name);
            ev('friend');
          }
        }
      } else if (dog.state === 'play') {
        dog.t -= dt;
        moved = moveToward(dog, L.x, L.y, d > 40 ? 200 : 60, dt);
        if (dog.t <= 0) { dog.state = 'leash'; ev('playEnd'); }
      }
    } else if (dog.character === 'angry') {
      if (!dog.warned && d < C.WARN_R && dog.state === 'leash') { dog.warned = true; ev('warn'); }
      if (dog.state === 'leash' && !safe && L.panic <= 0 && dog.cooldown <= 0 && d < C.NOTICE_R) {
        dog.state = 'alert'; dog.t = C.ALERT_TIME; ev('notice');
      } else if (dog.state === 'alert') {
        setFacing(dog, L.x - dog.x, L.y - dog.y);
        moved = moveToward(dog, L.x, L.y, 60, dt);
        dog.t -= dt;
        if (safe) { dog.state = 'leash'; dog.cooldown = 2; }
        else if (dog.t <= 0) {
          if (d < C.NOTICE_R * 1.25 && rng() < C.BREAK_FREE_CHANCE) { dog.state = 'chase'; dog.t = C.CHASE_TIME; ev('chase'); }
          else { dog.state = 'leash'; dog.cooldown = 4; ev('held'); }
        }
      } else if (dog.state === 'chase') {
        dog.t -= dt;
        if (safe || d > C.LOSE_R || dog.t <= 0) { dog.state = 'return'; dog.cooldown = 4; ev('giveup'); }
        else {
          moved = moveToward(dog, L.x, L.y, C.CHASE_SPEED, dt);
          if (d2(dog, L) < dog.r + L.r + 2 && L.panic <= 0) {
            dog.state = 'return'; dog.cooldown = C.CATCH_COOLDOWN;
            L.panic = C.PANIC_TIME; L.act = null; L.tempt = null; L.sniff = 0;
            if (L.carry) { L.carry.state = 'ground'; L.carry.thrown = false; L.carry = null; }
            addMeter(s, 'happy', C.HAPPY_SCARE);
            s.stats.scares++;
            ev('catch');
          }
        }
        keepOutOfSafeZone(dog);
      } else if (dog.state === 'return') {
        moved = moveToward(dog, o.x, o.y, 150, dt);
        keepOutOfSafeZone(dog);
        if (d2(dog, o) < C.DOG_LEASH) { dog.state = 'leash'; ev('back'); }
      }
    } else if (dog.character === 'grumpy') {
      if (dog.state === 'leash' && dog.cooldown <= 0 && d < C.YAP_R && L.panic <= 0) {
        dog.cooldown = C.YAP_COOLDOWN; dog.yap = 1.2;
        L.fear = Math.min(1, L.fear + 0.6);
        addMeter(s, 'happy', C.HAPPY_YAP);
        ev('yap');
      }
      if (dog.yap > 0) { dog.yap -= dt; setFacing(dog, L.x - dog.x, L.y - dog.y); moved = moveToward(dog, L.x, L.y, 70, dt); }
    }

    // На поводке гуляет вокруг хозяина
    if (dog.state === 'leash' && !(dog.yap > 0)) {
      dog.wanderT -= dt;
      if (dog.wanderT <= 0 || d2(dog, dog.wander) < 6) {
        var a = rng() * Math.PI * 2, r = rng() * C.DOG_LEASH * 0.8;
        dog.wander = { x: o.x + Math.cos(a) * r, y: o.y + Math.sin(a) * r };
        dog.wanderT = 1.5 + rng() * 2;
      }
      var target = { x: dog.wander.x + (o.speed > 5 ? (o.route[o.ni] || o).x - o.x : 0) * 0.15, y: dog.wander.y + (o.speed > 5 ? (o.route[o.ni] || o).y - o.y : 0) * 0.15 };
      moved = moveToward(dog, target.x, target.y, Math.max(45, o.speed * 1.4), dt);
    }
    if (dog.state !== 'chase' && dog.state !== 'return') leashDog(dog, o);
    dog.speed = dt > 0 ? moved / dt : 0;
  }

  /* ------------------------------ люди и звери ------------------------------ */
  function petCheck(person, s, dt, cooldownTime, happyValue, events, type) {
    var L = s.louis, C = CONFIG;
    if (person.cd > 0) { person.cd -= dt; return; }
    var spot = person.spot || person;
    var near = d2(L, spot) < C.PET_R && L.speed < C.STILL_SPEED * 3 && L.panic <= 0;
    if (near) {
      person.progress += dt;
      if (person.progress >= C.PET_TIME) {
        person.progress = 0;
        person.cd = cooldownTime;
        addMeter(s, 'happy', happyValue);
        s.stats.pets++;
        if (type === 'grandma') s.stats.treats++;
        events.push({ type: type, x: person.x, y: person.y, id: person.id });
      }
    } else person.progress = Math.max(0, person.progress - dt);
  }

  function stepPeople(s, dt, rng, events) {
    var L = s.louis, C = CONFIG;
    if (s.grandma) {
      s.grandma.spot = WORLD.grandmaSpot;
      petCheck(s.grandma, s, dt, C.GRANDMA_COOLDOWN, C.HAPPY_GRANDMA, events, 'grandma');
    }
    s.kids.forEach(function (kid) {
      var moved = 0;
      var d = d2(kid, L);
      if (kid.cd <= 0 && d < C.KID_RUN_R && d > C.PET_R * 0.6 && L.panic <= 0) moved = moveToward(kid, L.x, L.y, 75, dt);
      else {
        if (kid.wait > 0) kid.wait -= dt;
        else {
          moved = moveToward(kid, kid.target.x, kid.target.y, 40, dt);
          if (d2(kid, kid.target) < 6 || kid.stuck > 1) {
            kid.target = randomPoint(rng, 10, function (x, y) { return inRect(x, y, WORLD.playgroundBounds); });
            kid.wait = 1 + rng() * 3;
          }
        }
      }
      kid.speed = dt > 0 ? moved / dt : 0;
      petCheck(kid, s, dt, C.KID_COOLDOWN, C.HAPPY_KID, events, 'kid');
    });

    // Дворник сгребает листья
    var J = s.janitor;
    if (J) {
      var moved = 0;
      J.sweeping = false;
      if (!J.target || J.target.size >= 1) {
        var low = s.piles.filter(function (p) { return p.size < 0.8; });
        J.target = low.length ? low.sort(function (a, b) { return d2(J, a) - d2(J, b); })[0] : null;
      }
      if (J.target) {
        var spot = { x: J.target.x + 22, y: J.target.y + 10 };
        if (d2(J, spot) > 8 && J.stuck < 2) moved = moveToward(J, spot.x, spot.y, C.JANITOR_SPEED, dt);
        else {
          J.sweeping = true; J.stuck = 0;
          J.target.size = Math.min(1, J.target.size + C.SWEEP_RATE * dt);
          setFacing(J, J.target.x - J.x, J.target.y - J.y);
        }
      }
      J.speed = dt > 0 ? moved / dt : 0;
    }
  }

  function stepAnimals(s, dt, rng, events) {
    var L = s.louis, C = CONFIG;
    s.flocks.forEach(function (f) {
      if (f.state === 'ground') {
        if (f.cd > 0) f.cd -= dt;
        if (d2(L, f) < C.PIGEON_FLEE_R && L.speed > 50 && f.cd <= 0) {
          var others = WORLD.pigeonSpots.filter(function (p) { return dist(p.x, p.y, f.x, f.y) > 50; });
          f.state = 'fly'; f.t = 0; f.from = { x: f.x, y: f.y }; f.to = pick(rng, others);
          s.stats.pigeons++;
          if (L.running) { addMeter(s, 'energy', C.ENERGY_PIGEONS); addMeter(s, 'happy', C.HAPPY_PIGEONS); }
          events.push({ type: 'pigeons', x: f.x, y: f.y, chased: L.running });
        }
      } else {
        f.t += dt;
        var k = Math.min(1, f.t / C.PIGEON_FLY_TIME);
        f.x = f.from.x + (f.to.x - f.from.x) * k;
        f.y = f.from.y + (f.to.y - f.from.y) * k;
        if (k >= 1) { f.state = 'ground'; f.cd = 3; }
      }
    });

    s.cats.forEach(function (c) {
      var moved = 0;
      if (c.state === 'sit') {
        if (d2(L, c) < C.CAT_FLEE_R && L.panic <= 0) {
          var cars = WORLD.solids.filter(function (x) { return x.kind === 'car'; });
          var car = cars.sort(function (a, b) { return dist(a.x + 30, a.y + 50, c.x, c.y) - dist(b.x + 30, b.y + 50, c.x, c.y); })[0];
          c.perch = { x: car.x + car.w / 2, y: car.y + car.h / 2 };
          c.state = 'flee';
          c.rewarded = false;
          if (L.running) { c.rewarded = true; addMeter(s, 'energy', C.ENERGY_CAT); addMeter(s, 'happy', C.HAPPY_CAT); }
          s.stats.cats++;
          events.push({ type: 'cat', x: c.x, y: c.y, chased: L.running });
        }
      } else if (c.state === 'flee') {
        var dx = c.perch.x - c.x, dy = c.perch.y - c.y, l = Math.sqrt(dx * dx + dy * dy);
        var step = Math.min(l, C.CAT_SPEED * dt);
        if (l > 1) { c.x += dx / l * step; c.y += dy / l * step; moved = step; setFacing(c, dx, dy); }
        c.z = Math.max(0, 1 - l / 40) * 36;
        if (l < 2) { c.state = 'perch'; c.t = C.CAT_PERCH_TIME; c.z = 36; }
      } else if (c.state === 'perch') {
        c.t -= dt;
        if (c.t <= 0 && d2(L, c) > C.CAT_FLEE_R * 1.3) { c.state = 'down'; c.z = 0; }
      } else if (c.state === 'down') {
        var hx = c.home.x - c.x, hy = c.home.y - c.y, hl = Math.sqrt(hx * hx + hy * hy);
        if (hl > 2) { var st = Math.min(hl, 50 * dt); c.x += hx / hl * st; c.y += hy / hl * st; moved = st; setFacing(c, hx, hy); }
        else c.state = 'sit';
      }
      c.phase += moved * 0.2;
      c.speed = dt > 0 ? moved / dt : 0;
    });
  }

  function stepPilesAndPuddles(s, dt, rng, events) {
    var L = s.louis, C = CONFIG;
    s.piles.forEach(function (p) {
      if (p.size < C.PILE_MIN_SIZE || L.act || L.panic > 0) return;
      if (d2(L, p) < C.PILE_R * (0.6 + p.size * 0.4) + L.r * 0.5 && L.speed > C.PILE_JUMP_SPEED) {
        var size = p.size;
        p.size = 0;
        L.jump = 0.5;
        addMeter(s, 'energy', C.ENERGY_PILE * size);
        addMeter(s, 'happy', C.HAPPY_PILE);
        s.stats.piles++;
        events.push({ type: 'pile', x: p.x, y: p.y, size: size });
        if (s.janitor && d2(s.janitor, p) < C.SCOLD_R) {
          addMeter(s, 'happy', C.HAPPY_SCOLD);
          events.push({ type: 'scold', x: s.janitor.x, y: s.janitor.y });
        }
      }
    });
    if (s.weather.wind) {
      s.windAt -= dt;
      if (s.windAt <= 0) {
        s.windAt = rand(rng, C.WIND_INTERVAL[0], C.WIND_INTERVAL[1]);
        s.piles.forEach(function (p) { p.size = Math.max(0, p.size - C.WIND_PILE_LOSS); });
        events.push({ type: 'wind' });
      }
    }
    if (s.weather.rain) {
      var inside = WORLD.puddles.some(function (q) {
        var nx = (L.x - q.x) / q.rx, ny = (L.y - q.y) / q.ry;
        return nx * nx + ny * ny < 1;
      });
      if (inside && !L.inPuddle) {
        L.inPuddle = true;
        L.dirty = true;
        addMeter(s, 'energy', C.ENERGY_PUDDLE);
        s.stats.puddles++;
        events.push({ type: 'puddle', x: L.x, y: L.y, first: s.stats.puddles === 1 });
      } else if (!inside) L.inPuddle = false;
    }
  }

  function computeFear(s) {
    var L = s.louis, fear = 0, C = CONFIG;
    if (inSafeZone(L.x, L.y)) return 0;
    s.pairs.forEach(function (p) {
      var dog = p.dog;
      if (dog.character !== 'angry') return;
      var k = clamp(1 - (d2(dog, L) - dog.r - L.r) / C.FEAR_R, 0, 1);
      if (dog.state === 'leash' || dog.state === 'return') k *= 0.3;
      if (k > fear) fear = k;
    });
    return fear;
  }

  /** Чего Луи хочет прямо сейчас: для пузыря-мысли над ним. */
  function currentWish(s) {
    var m = s.meters, L = s.louis;
    if (L.panic > 0) return 'home';
    if (L.tempt) return L.tempt.kind;
    if (L.carry) return 'give';
    if (m.pee < 100 && s.peeCd <= 0) return 'tree';
    if (m.poop < 100 && s.walked >= CONFIG.POOP_READY_WALK) return 'grass';
    if (m.energy < 100) return 'ball';
    if (m.happy < 100) return 'heart';
    return 'home';
  }

  /* ------------------------------ шаг прогулки ------------------------------ */
  function stepWalk(s, input, dt, rng) {
    rng = rng || Math.random;
    var events = [];
    if (s.over) return events;
    var C = CONFIG, L = s.louis;
    s.t += dt;
    s.time = Math.max(0, s.time - dt);

    stepOwner(s, dt, events);
    var moving = stepLouis(s, input || { x: 0, y: 0, mag: 0 }, dt, events);
    stepItems(s, dt, rng, events);
    stepToilet(s, dt, moving, events);

    // Пары с собаками
    if (s.t >= s.nextPairAt) {
      s.nextPairAt = s.t + rand(rng, C.PAIR_INTERVAL[0], C.PAIR_INTERVAL[1]);
      if (s.pairs.length < C.MAX_PAIRS) {
        var p = spawnPair(s, rng);
        events.push({ type: 'pairEnter', name: p.dog.name, size: p.dog.size, character: p.dog.character, x: p.owner.x, y: p.owner.y });
      }
    }
    s.playMult = 1;
    s.pairs.forEach(function (pair) {
      stepPairOwner(pair, s, dt);
      stepPairDog(pair, s, dt, rng, events);
      if (pair.dog.state === 'play' && d2(pair.dog, L) < 100) s.playMult = C.PLAY_ENERGY_MULT;
    });
    s.pairs = s.pairs.filter(function (p) { return !p.done; });

    stepPeople(s, dt, rng, events);
    stepAnimals(s, dt, rng, events);
    stepPilesAndPuddles(s, dt, rng, events);

    var fearTarget = computeFear(s);
    L.fear += (fearTarget - L.fear) * Math.min(1, dt * 4);

    var m = s.meters;
    if (!s.allDone && m.pee >= 100 && m.poop >= 100 && m.energy >= 100 && m.happy >= 100) {
      s.allDone = true;
      events.push({ type: 'allDone' });
    }
    if (s.allDone && inSafeZone(L.x, L.y) && !s.poops.length) {
      s.over = true; s.result = finishWalk(s, 'done'); events.push({ type: 'end', reason: 'done' });
    } else if (s.time <= 0) {
      s.over = true; s.result = finishWalk(s, 'timeout'); events.push({ type: 'end', reason: 'timeout' });
    }
    return events;
  }

  /** Двор без Луи: соседи, звери и дворник живут сами (фон меню). */
  function stepAmbient(s, dt, rng) {
    rng = rng || Math.random;
    var events = [];
    s.t += dt;
    if (s.t >= s.nextPairAt) {
      s.nextPairAt = s.t + rand(rng, CONFIG.PAIR_INTERVAL[0] * 0.5, CONFIG.PAIR_INTERVAL[1] * 0.5);
      if (s.pairs.length < CONFIG.MAX_PAIRS) spawnPair(s, rng);
    }
    s.pairs.forEach(function (pair) { stepPairOwner(pair, s, dt); stepPairDog(pair, s, dt, rng, events); });
    s.pairs = s.pairs.filter(function (p) { return !p.done; });
    stepPeople(s, dt, rng, events);
    stepAnimals(s, dt, rng, events);
    return events;
  }

  /* ------------------------------ итоги ------------------------------ */
  /** reason: done - всё сделал и пришёл домой, timeout - время вышло, quit - вышел из игры. */
  function finishWalk(s, reason) {
    var m = s.meters, C = CONFIG;
    var done = { pee: m.pee >= 100, poop: m.poop >= 100, energy: m.energy >= 100, happy: m.happy >= 100 };
    var count = (done.pee ? 1 : 0) + (done.poop ? 1 : 0) + (done.energy ? 1 : 0) + (done.happy ? 1 : 0);
    var stars = reason === 'quit' ? 0 : count === 4 ? 3 : count === 3 ? 2 : count === 2 ? 1 : 0;
    var meterScore = Math.round(Math.min(m.pee, 100) + Math.min(m.poop, 100) + Math.min(m.energy, 100) + Math.min(m.happy, 100));
    var timeBonus = reason === 'done' ? Math.round(s.time * C.TIME_BONUS) : 0;
    var extra = s.stats.friends.length * C.FRIEND_SCORE + s.stats.treats * C.TREAT_SCORE + s.stats.ateBad * C.BAD_SCORE;
    var score = reason === 'quit' ? 0 : Math.max(0, meterScore + timeBonus + extra);
    return {
      reason: reason, done: done, count: count, stars: stars, score: score,
      meterScore: meterScore, timeBonus: timeBonus, dirty: s.louis.dirty,
      meters: { pee: Math.round(m.pee), poop: Math.round(m.poop), energy: Math.round(m.energy), happy: Math.round(m.happy) },
      friends: s.stats.friends.slice(), stats: JSON.parse(JSON.stringify(s.stats)), weather: s.weather, timeLeft: Math.round(s.time)
    };
  }

  /* ------------------------------ прогресс ------------------------------ */
  var STORAGE_KEY = 'louis-walk-v1';
  function emptyProgress() { return { best: 0, bestStars: 0, walks: 0, perfect: 0, friends: [] }; }
  function loadProgress(storage) {
    var p = emptyProgress();
    try {
      var raw = JSON.parse(storage.getItem(STORAGE_KEY));
      if (!raw || typeof raw !== 'object') return p;
      ['best', 'walks', 'perfect'].forEach(function (k) { if (isFinite(raw[k]) && raw[k] > 0) p[k] = Math.floor(raw[k]); });
      if (isFinite(raw.bestStars)) p.bestStars = clamp(Math.floor(raw.bestStars), 0, 3);
      if (Array.isArray(raw.friends)) p.friends = raw.friends.filter(function (f) { return typeof f === 'string'; });
    } catch (e) { /* пустое, битое или недоступное хранилище */ }
    return p;
  }
  function saveProgress(storage, p) {
    try { storage.setItem(STORAGE_KEY, JSON.stringify(p)); return true; } catch (e) { return false; }
  }
  function recordWalk(p, result) {
    var next = JSON.parse(JSON.stringify(p));
    var isBest = result.score > next.best;
    next.best = Math.max(next.best, result.score);
    next.bestStars = Math.max(next.bestStars, result.stars);
    next.walks += 1;
    if (result.stars === 3) next.perfect += 1;
    var newFriends = result.friends.filter(function (f) { return next.friends.indexOf(f) < 0; });
    next.friends = next.friends.concat(newFriends);
    return { progress: next, isBest: isBest, newFriends: newFriends };
  }
  function allDogNames() { return BIG_DOGS.concat(SMALL_DOGS).map(function (d) { return d.name; }); }

  return {
    CONFIG: CONFIG, WORLD: WORLD, ISO: ISO, STORAGE_KEY: STORAGE_KEY, BIG_DOGS: BIG_DOGS, SMALL_DOGS: SMALL_DOGS,
    clamp: clamp, dist: dist, toWorldDir: toWorldDir, toScreenDir: toScreenDir,
    inSafeZone: inSafeZone, isLawn: isLawn, isFree: isFree, moveEntity: moveEntity, randomPoint: randomPoint,
    resolveCollisions: resolveCollisions, keepOutOfSafeZone: keepOutOfSafeZone,
    createWalk: createWalk, spawnPair: spawnPair, stepWalk: stepWalk, stepAmbient: stepAmbient, trySniff: trySniff, sayFu: sayFu,
    computeFear: computeFear, currentWish: currentWish, poopReady: poopReady, finishWalk: finishWalk, buildMarkSpots: buildMarkSpots,
    emptyProgress: emptyProgress, loadProgress: loadProgress, saveProgress: saveProgress, recordWalk: recordWalk,
    allDogNames: allDogNames
  };
});
