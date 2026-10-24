/*
 * Выгуляй Луи - ядро игры: баланс, карта района и вся симуляция прогулки.
 * Без DOM и Canvas: работает в браузере (window.WalkLogic) и в Node.js для тестов.
 *
 * Координаты мира - плоскость земли: x и y от 0 до WORLD.size.
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
   *  Расстояния в единицах двора, время в секундах.
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
    LEASH_PANIC: 900,           // при испуге рулетка разматывается
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

    // Шкала «покакать»: один раз на траве или на собачьей площадке
    POOP_SNIFF_TIME: 1.3,
    POOP_SPIN_TIME: 1.3,
    POOP_TIME: 1.6,
    POOP_READY_WALK: 800,       // покакать захочется, когда Луи нагуляется (путь в единицах двора)
    POOP_PRIVACY_R: 100,        // рядом не должно быть чужих людей и собак
    DISTURB_FEAR: 0.35,         // при таком страхе Луи передумывает

    // Шкала «сбросить энергию»
    ENERGY_RUN: 0.014,          // за единицу пути бегом
    ENERGY_WALK: 0.005,         // за единицу пути шагом
    ENERGY_PILE: 12,            // прыжок в полную кучу листьев
    ENERGY_FETCH: 10,           // принёс брошенную игрушку
    ENERGY_PIGEONS: 8,
    ENERGY_CAT: 10,
    ENERGY_DUCKS: 6,
    ENERGY_COURT_BALL: 6,       // погонял мяч у детей на спортплощадке
    ENERGY_HURDLE: 5,           // перепрыгнул барьер на собачьей площадке
    PLAY_ENERGY_MULT: 2.5,      // бег рядом с подружившейся собакой

    // Шкала «зарядить счастье»
    HAPPY_FRIEND: 22,
    HAPPY_GRANDMA: 12,
    HAPPY_SITTER: 8,            // погладили на лавочке в парке
    HAPPY_KID: 8,
    HAPPY_PILE: 4,
    HAPPY_FETCH: 4,
    HAPPY_PIGEONS: 3,
    HAPPY_CAT: 3,
    HAPPY_DUCKS: 4,
    HAPPY_COURT_BALL: 3,
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
    TREATS: 18,
    CHESTNUT_RESPAWN: 18,       // каштаны падают снова
    KIOSK_DROP_TIME: 22,        // продавец шаурмы иногда бросает кусочек

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
    MAX_PAIRS: 4,               // гуляющих пар одновременно (без собачьей площадки)
    START_PAIRS: 1,
    FIRST_PAIR_AT: 12,
    PAIR_INTERVAL: [14, 26],
    BUSY_SPAWN_DELAY: 6,        // пока Луи занят делом, новые соседи не приходят
    PAIR_WALK_SPEED: 52,
    DOG_LEASH: 55,
    BIG_ANGRY_CHANCE: 0.55,     // большая собака злая, иначе добрая
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
    SITTER_COOLDOWN: 25,
    KID_COOLDOWN: 16,
    KID_RUN_R: 150,

    // Голуби, кошки, утки, дворники, кучи
    FLOCKS: 4,                  // стай голубей в районе
    PIGEON_FLEE_R: 95,          // голуби взлетают сразу, как Луи подошёл
    PIGEON_FLY_TIME: 2.6,
    CAT_FLEE_R: 95,
    CAT_SPEED: 240,
    CAT_PERCH_TIME: 14,
    DUCK_SCARE_R: 120,
    DUCK_COOLDOWN: 6,
    PILE_R: 32,
    PILE_MIN_SIZE: 0.35,
    PILE_JUMP_SPEED: 50,
    SWEEP_RATE: 0.22,
    SCOLD_R: 170,
    JANITOR_SPEED: 45,
    HURDLE_COOLDOWN: 3,
    COURT_BALL_COOLDOWN: 4,
    WIND_INTERVAL: [14, 26],
    WIND_PILE_LOSS: 0.3,

    // Погода (каждая прогулка случайная, дождя нет)
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
   *  КАРТА РАЙОНА: четыре квартала вокруг перекрёстка двух проездов.
   *  Дальние края - дома, ближние - забор с калитками.
   *    Двор Луи (x<1300, y<1300): подъезд, детская площадка, фонтан.
   *    Магазин (x>1400, y<1300): «Продукты», ларёк с шаурмой, площадка для собак.
   *    Спорт (x<1300, y>1400): спортплощадка с детьми и мячом, гаражи с котами на крышах.
   *    Парк (x>1400, y>1400): аллеи, пруд с утками, беседка.
   * ================================================================ */
  var S = 2450;

  function rect(x, y, w, h, kind, extra) {
    var r = { x: x, y: y, w: w, h: h, kind: kind };
    for (var k in extra) r[k] = extra[k];
    return r;
  }

  var WORLD = {
    size: S,
    door: { x: 700, y: 120 },
    safe: { x: 700, y: 165 },
    buildings: [
      { x: 160, y: 0, w: 1140, h: 120, height: 230, face: 'y', doors: [{ at: 420 }, { at: 700, home: true }, { at: 1000 }] },
      { x: 0, y: 0, w: 160, h: 1300, height: 230, face: 'x', doors: [{ at: 450 }, { at: 950 }] },
      { x: 1450, y: 0, w: 1000, h: 120, height: 200, face: 'y', doors: [{ at: 1650, shop: true }, { at: 2150 }] },
      { x: 0, y: 1450, w: 160, h: 1000, height: 200, face: 'x', doors: [{ at: 1800 }, { at: 2200 }] }
    ],
    // Покрытия земли: всё остальное - газон
    paths: [
      rect(0, 1300, S, 100, 'road'), rect(1300, 0, 100, S, 'road'),
      rect(160, 1270, S - 160, 30, 'sidewalk'), rect(160, 1400, S - 160, 30, 'sidewalk'),
      rect(1270, 120, 30, S - 120, 'sidewalk'), rect(1400, 120, 30, S - 120, 'sidewalk'),
      // Двор Луи
      rect(160, 120, 1110, 60, 'sidewalk'), rect(160, 180, 60, 1090, 'sidewalk'),
      rect(670, 180, 60, 520, 'tile', { lamps: true }), rect(220, 680, 1050, 60, 'tile', { lamps: true }),
      rect(950, 740, 40, 110, 'tile'), rect(430, 740, 40, 140, 'tile'),
      rect(330, 880, 240, 240, 'tile'),
      rect(800, 850, 350, 350, 'rubber'),
      // Магазин
      rect(1430, 120, 1020, 60, 'sidewalk'), rect(1430, 420, 1020, 50, 'tile', { lamps: true }),
      rect(1600, 180, 50, 1090, 'tile', { lamps: true }), rect(1650, 860, 150, 60, 'tile'),
      rect(1850, 180, 200, 240, 'tile'),
      rect(1806, 606, 488, 538, 'dirt'),
      // Спорт и гаражи
      rect(160, 1430, 60, 1020, 'sidewalk'), rect(700, 1430, 50, 1020, 'tile', { lamps: true }),
      rect(220, 2150, 1050, 50, 'tile', { lamps: true }), rect(220, 2295, 1050, 90, 'asphalt'),
      rect(800, 1530, 420, 420, 'court'),
      // Парк
      rect(1430, 1600, 1020, 50, 'gravel', { lamps: true }), rect(1600, 1430, 50, 1020, 'gravel', { lamps: true }),
      rect(1925, 1650, 50, 95, 'gravel')
    ],
    ponds: [{ x: 1950, y: 1960, rx: 230, ry: 170, ring: 55 }],
    playground: { x: 800, y: 850, w: 350, h: 350 },
    sandbox: { x: 880, y: 900, w: 90, h: 80 },
    court: { x: 800, y: 1530, w: 420, h: 420 },
    dogPark: { x: 1806, y: 606, w: 488, h: 538 },
    kiosk: { x: 1900, y: 250, w: 90, h: 70, drop: { x: 1945, y: 345 } },
    solids: [
      rect(160, 0, 1140, 120, 'building'), rect(0, 0, 160, 1300, 'building'),
      rect(1450, 0, 1000, 120, 'building'), rect(0, 1450, 160, 1000, 'building'),
      rect(1300, 0, 150, 16, 'barrier'), rect(0, 1300, 16, 150, 'barrier'),
      // Двор Луи
      rect(560, 196, 70, 22, 'bench', { sitter: 'grandma' }), rect(800, 196, 70, 22, 'bench'),
      rect(345, 1090, 60, 20, 'bench'), rect(495, 1090, 60, 20, 'bench'),
      rect(1180, 190, 70, 36, 'bins'),
      rect(1000, 900, 70, 12, 'swings'), rect(870, 1050, 24, 70, 'slide'),
      // Магазин
      rect(1900, 250, 90, 70, 'kiosk'), rect(2080, 200, 70, 36, 'bins'),
      rect(1700, 480, 70, 20, 'bench'),
      rect(1800, 600, 500, 6, 'fence'), rect(1800, 1144, 500, 6, 'fence'),
      rect(1800, 600, 6, 260, 'fence'), rect(1800, 920, 6, 230, 'fence'), rect(2294, 600, 6, 550, 'fence'),
      // Машины у проездов
      rect(300, 1306, 100, 44, 'car', { color: '#c0392b' }), rect(560, 1306, 100, 44, 'car', { color: '#ecf0f1' }),
      rect(900, 1350, 100, 44, 'car', { color: '#2c3e50' }), rect(1600, 1306, 100, 44, 'car', { color: '#27ae60' }),
      rect(1900, 1350, 100, 44, 'car', { color: '#f1c40f' }), rect(2200, 1306, 100, 44, 'car', { color: '#8e44ad' }),
      rect(1306, 300, 44, 100, 'car', { color: '#2980b9' }), rect(1350, 650, 44, 100, 'car', { color: '#ecf0f1' }),
      rect(1306, 1650, 44, 100, 'car', { color: '#d35400' }), rect(1350, 2050, 44, 100, 'car', { color: '#7f8c8d' }),
      // Спорт и гаражи
      rect(1004, 1535, 12, 12, 'hoop'), rect(1004, 1933, 12, 12, 'hoop'),
      rect(260, 2215, 400, 80, 'garages'), rect(800, 2215, 400, 80, 'garages'),
      // Парк
      rect(2250, 1480, 90, 90, 'gazebo'),
      rect(1700, 1660, 70, 20, 'bench'), rect(2000, 1660, 70, 20, 'bench', { sitter: 'reader' }),
      rect(1450, 2050, 70, 20, 'bench')
    ],
    // Барьеры на собачьей площадке: проходимые, перепрыгивает бегом
    hurdles: [rect(1950, 700, 12, 70, 'hurdle'), rect(2100, 850, 12, 70, 'hurdle'), rect(1950, 1000, 12, 70, 'hurdle')],
    fountain: { x: 450, y: 1000, r: 50 },
    pumpkins: [{ x: 630, y: 128, r: 8 }, { x: 771, y: 127, r: 7 }, { x: 785, y: 126, r: 6 }],
    // Точки маршрутов соседей с собаками
    nodes: {
      g1: { x: 1415, y: 2440, gate: true }, g2: { x: 2440, y: 1415, gate: true }, g3: { x: 2440, y: 1625, gate: true },
      g4: { x: 725, y: 2440, gate: true }, g5: { x: 2440, y: 445, gate: true }, g6: { x: 1625, y: 2440, gate: true },
      cNW: { x: 1285, y: 1285 }, cNE: { x: 1415, y: 1285 }, cSW: { x: 1285, y: 1415 }, cSE: { x: 1415, y: 1415 },
      q1a: { x: 700, y: 710 }, q1b: { x: 250, y: 710 }, q1c: { x: 1285, y: 710 }, q1d: { x: 970, y: 800 }, q1e: { x: 450, y: 820 },
      q2a: { x: 1625, y: 445 }, q2c: { x: 1625, y: 890 }, q2d: { x: 1625, y: 1285 }, q2p: { x: 1760, y: 890 },
      q3a: { x: 725, y: 1415 }, q3b: { x: 725, y: 2175 }, q3d: { x: 250, y: 2175 }, q3e: { x: 1285, y: 2175 },
      q4a: { x: 1625, y: 1415 }, q4b: { x: 1625, y: 1625 }, q4c: { x: 1950, y: 1625 }, q4e: { x: 1690, y: 1960 }
    },
    edges: [
      ['g1', 'cSE'], ['cSE', 'cNE'], ['cSE', 'cSW'], ['cSE', 'q4a'], ['cSE', 'g2'], ['cNE', 'q2d'], ['cNE', 'cNW'],
      ['cNW', 'q1c'], ['cNW', 'cSW'], ['cSW', 'q3a'], ['q1c', 'q1a'], ['q1a', 'q1b'], ['q1a', 'q1d'], ['q1a', 'q1e'],
      ['q2d', 'q2c'], ['q2c', 'q2a'], ['q2a', 'g5'], ['q2c', 'q2p'], ['q3a', 'q3b'], ['q3b', 'q3d'], ['q3b', 'q3e'],
      ['q3b', 'g4'], ['q3e', 'cSW'], ['q4a', 'q4b'], ['q4b', 'g3'], ['q4b', 'q4c'], ['q4b', 'q4e'], ['q4e', 'g6']
    ],
    // Проёмы в ближнем заборе (по краю y = S и x = S)
    fenceGaps: [
      { edge: 'y', a: 1290, b: 1440 }, { edge: 'y', a: 695, b: 755 }, { edge: 'y', a: 1595, b: 1655 },
      { edge: 'x', a: 1290, b: 1440 }, { edge: 'x', a: 1595, b: 1655 }, { edge: 'x', a: 415, b: 475 }
    ],
    sitters: [
      { kind: 'grandma', look: 'grandma', x: 595, y: 207, spot: { x: 595, y: 248 } },
      { kind: 'reader', look: 'coatPlum', x: 2035, y: 1670, spot: { x: 2035, y: 1712 } }
    ],
    playgroundBounds: { x: 820, y: 870, w: 310, h: 310 },
    courtBounds: { x: 815, y: 1545, w: 390, h: 390 },
    dogParkBounds: { x: 1830, y: 630, w: 440, h: 490 },
    pigeonSpots: [{ x: 1700, y: 300 }, { x: 2100, y: 445 }, { x: 650, y: 255 }, { x: 1010, y: 1470 },
      { x: 1800, y: 1625 }, { x: 450, y: 1160 }, { x: 1000, y: 2175 }, { x: 2200, y: 1430 }],
    catSpots: [{ x: 450, y: 2335 }, { x: 1000, y: 2335 }, { x: 1150, y: 250 }, { x: 1250, y: 700 }],
    spawn: { x0: 180, y0: 140, x1: S - 20, y1: S - 20 },
    trees: [], bushes: [], lamps: [], piles: []
  };

  /* ------------------------------ утилиты ------------------------------ */
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function dist(ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return Math.sqrt(dx * dx + dy * dy); }
  function d2(a, b) { return dist(a.x, a.y, b.x, b.y); }
  function rand(rng, a, b) { return a + rng() * (b - a); }
  function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
  function inRect(x, y, r) { return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h; }
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Направление на экране (dx, dy) в направление на земле двора. */
  function toWorldDir(sx, sy) {
    var a = sx / ISO.X, b = sy / ISO.Y;
    return { x: (a + b) / 2, y: (b - a) / 2 };
  }
  /** Смещение на земле в смещение на экране. */
  function toScreenDir(wx, wy) { return { x: (wx - wy) * ISO.X, y: (wx + wy) * ISO.Y }; }

  function inSafeZone(x, y) { return dist(x, y, WORLD.safe.x, WORLD.safe.y) < CONFIG.SAFE_R; }

  function pondValue(x, y, p, extra) {
    var nx = (x - p.x) / (p.rx + extra), ny = (y - p.y) / (p.ry + extra);
    return nx * nx + ny * ny;
  }
  function inWater(x, y) { return WORLD.ponds.some(function (p) { return pondValue(x, y, p, 0) < 1; }); }

  function isLawn(x, y) {
    if (x < 0 || y < 0 || x > S || y > S) return false;
    for (var i = 0; i < WORLD.paths.length; i++) if (inRect(x, y, WORLD.paths[i])) return false;
    for (var j = 0; j < WORLD.ponds.length; j++) if (pondValue(x, y, WORLD.ponds[j], WORLD.ponds[j].ring) < 1) return false;
    for (var k = 0; k < WORLD.buildings.length; k++) if (inRect(x, y, WORLD.buildings[k])) return false;
    return true;
  }
  /** Где можно покакать: газон или собачья площадка. */
  function isPoopGround(x, y) { return isLawn(x, y) || inRect(x, y, WORLD.dogPark); }

  /* ---------------------------- столкновения ---------------------------- */
  function pushOutOfRect(e, r, rc) {
    var cx = clamp(e.x, rc.x, rc.x + rc.w), cy = clamp(e.y, rc.y, rc.y + rc.h);
    var dx = e.x - cx, dy = e.y - cy, q = dx * dx + dy * dy;
    if (q >= r * r) return false;
    if (q > 1e-9) {
      var d = Math.sqrt(q), k = (r - d) / d;
      e.x += dx * k; e.y += dy * k;
      return true;
    }
    var left = e.x - rc.x, right = rc.x + rc.w - e.x, top = e.y - rc.y, bottom = rc.y + rc.h - e.y;
    var m = Math.min(left, right, top, bottom);
    if (m === left) e.x = rc.x - r; else if (m === right) e.x = rc.x + rc.w + r;
    else if (m === top) e.y = rc.y - r; else e.y = rc.y + rc.h + r;
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
  /** Пруд: выталкиваем на берег, эллипс расширен на радиус. */
  function pushOutOfPond(e, r, p) {
    var v = pondValue(e.x, e.y, p, r);
    if (v >= 1) return false;
    var dx = e.x - p.x, dy = e.y - p.y;
    if (Math.abs(dx) + Math.abs(dy) < 1e-6) dy = 1;
    var k = 1 / Math.sqrt(pondValue(p.x + dx, p.y + dy, p, r));
    e.x = p.x + dx * k * 1.001;
    e.y = p.y + dy * k * 1.001;
    return true;
  }
  var CIRCLES = []; // деревья, фонари, тыквы, фонтан: заполняется после генерации

  function resolveCollisions(e, r) {
    var hit = false;
    for (var i = 0; i < WORLD.solids.length; i++) hit = pushOutOfRect(e, r, WORLD.solids[i]) || hit;
    for (var j = 0; j < CIRCLES.length; j++) hit = pushOutOfCircle(e, r, CIRCLES[j]) || hit;
    for (var k = 0; k < WORLD.ponds.length; k++) hit = pushOutOfPond(e, r, WORLD.ponds[k]) || hit;
    var lo = r, hi = S - r;
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
    if (x < r || y < r || x > S - r || y > S - r) return false;
    for (var i = 0; i < WORLD.solids.length; i++) {
      var s = WORLD.solids[i];
      if (dist(x, y, clamp(x, s.x, s.x + s.w), clamp(y, s.y, s.y + s.h)) < r) return false;
    }
    for (var j = 0; j < CIRCLES.length; j++) if (dist(x, y, CIRCLES[j].x, CIRCLES[j].y) < r + CIRCLES[j].r) return false;
    for (var k = 0; k < WORLD.ponds.length; k++) if (pondValue(x, y, WORLD.ponds[k], r) < 1) return false;
    return true;
  }
  function randomPoint(rng, r, accept) {
    var a = WORLD.spawn;
    for (var i = 0; i < 800; i++) {
      var x = rand(rng, a.x0, a.x1), y = rand(rng, a.y0, a.y1);
      if (isFree(x, y, r) && (!accept || accept(x, y))) return { x: x, y: y };
    }
    return { x: 700, y: 710 };
  }
  function keepOutOfSafeZone(e) {
    var d = dist(e.x, e.y, WORLD.safe.x, WORLD.safe.y), min = CONFIG.SAFE_R + e.r;
    if (d >= min) return;
    if (d < 1e-6) { e.y = WORLD.safe.y + min; return; }
    e.x = WORLD.safe.x + (e.x - WORLD.safe.x) / d * min;
    e.y = WORLD.safe.y + (e.y - WORLD.safe.y) / d * min;
    resolveCollisions(e, e.r);
  }
  function setFacing(e, dx, dy) {
    var sx = (dx - dy) * ISO.X;
    if (Math.abs(sx) > 0.05) e.facing = sx > 0 ? 1 : -1;
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

  /* ------------------- раскладка деревьев, кустов, фонарей ------------------- */
  (function generateWorld() {
    var rng = mulberry32(20241024);
    var solidsAndPaths = function (x, y, pad) {
      if (!isLawn(x, y)) return false;
      for (var i = 0; i < WORLD.paths.length; i++) {
        var p = WORLD.paths[i];
        if (dist(x, y, clamp(x, p.x, p.x + p.w), clamp(y, p.y, p.y + p.h)) < pad) return false;
      }
      for (var j = 0; j < WORLD.solids.length; j++) {
        var s = WORLD.solids[j];
        if (dist(x, y, clamp(x, s.x, s.x + s.w), clamp(y, s.y, s.y + s.h)) < pad + 30) return false;
      }
      if (dist(x, y, WORLD.safe.x, WORLD.safe.y) < CONFIG.SAFE_R + 60) return false;
      if (inRect(x, y, WORLD.dogPark)) return false;
      // Зазор до края больше диаметра большой собаки: иначе в щели можно застрять
      return x > 220 && y > 180 && x < S - 70 && y < S - 70;
    };
    var trees = WORLD.trees;
    var types = ['maple', 'maple', 'birch', 'linden', 'linden', 'maple', 'birch'];
    // Каштаны: у них падают каштаны (фу!)
    trees.push({ x: 400, y: 420, r: 11, type: 'chestnut' }, { x: 2250, y: 2260, r: 11, type: 'chestnut' });
    var quotas = [
      { x0: 200, y0: 180, x1: 1260, y1: 1260, n: 16 },
      { x0: 1440, y0: 180, x1: 2430, y1: 1260, n: 10 },
      { x0: 200, y0: 1440, x1: 1260, y1: 2430, n: 12 },
      { x0: 1440, y0: 1440, x1: 2430, y1: 2430, n: 30 }
    ];
    quotas.forEach(function (q) {
      var placed = 0;
      for (var tries = 0; tries < 4000 && placed < q.n; tries++) {
        var x = rand(rng, q.x0, q.x1), y = rand(rng, q.y0, q.y1);
        if (!solidsAndPaths(x, y, 30)) continue;
        if (trees.some(function (t) { return dist(x, y, t.x, t.y) < 95; })) continue;
        trees.push({ x: Math.round(x), y: Math.round(y), r: 10, type: pick(rng, types) });
        placed++;
      }
    });
    for (var b = 0, tries2 = 0; b < 34 && tries2 < 6000; tries2++) {
      var bx = rand(rng, 200, S - 40), by = rand(rng, 160, S - 40), br = 24 + Math.round(rng() * 10);
      if (!solidsAndPaths(bx, by, br + 6)) continue;
      if (trees.some(function (t) { return dist(bx, by, t.x, t.y) < br + 30; })) continue;
      if (WORLD.bushes.some(function (o) { return dist(bx, by, o.x, o.y) < br + o.r + 40; })) continue;
      WORLD.bushes.push({ x: Math.round(bx), y: Math.round(by), r: br });
      b++;
    }
    // Фонари вдоль дорожек
    var lampAlong = function (p, step) {
      if (p.w >= p.h) for (var x = p.x + 60; x < p.x + p.w - 30; x += step) WORLD.lamps.push({ x: x, y: p.y - 9, r: 5 });
      else for (var y = p.y + 60; y < p.y + p.h - 30; y += step) WORLD.lamps.push({ x: p.x - 9, y: y, r: 5 });
    };
    WORLD.paths.filter(function (p) { return p.lamps; }).forEach(function (p) { lampAlong(p, 260); });
    WORLD.lamps = WORLD.lamps.filter(function (l) {
      if (!isLawn(l.x, l.y)) return false;
      for (var j = 0; j < WORLD.solids.length; j++) {
        var s = WORLD.solids[j];
        if (dist(l.x, l.y, clamp(l.x, s.x, s.x + s.w), clamp(l.y, s.y, s.y + s.h)) < 40) return false;
      }
      return !trees.some(function (t) { return dist(l.x, l.y, t.x, t.y) < 60; }) && !inSafeZone(l.x, l.y);
    });
    // Кучи листьев на газонах
    for (var n = 0, tries3 = 0; n < 16 && tries3 < 6000; tries3++) {
      var px = rand(rng, 220, S - 60), py = rand(rng, 200, S - 60);
      if (!solidsAndPaths(px, py, 40)) continue;
      if (trees.concat(WORLD.bushes).some(function (t) { return dist(px, py, t.x, t.y) < 60; })) continue;
      if (WORLD.lamps.some(function (l) { return dist(px, py, l.x, l.y) < 50; })) continue;
      if (WORLD.piles.some(function (o) { return dist(px, py, o.x, o.y) < 260; })) continue;
      WORLD.piles.push({ x: Math.round(px), y: Math.round(py) });
      n++;
    }
    CIRCLES = WORLD.trees.concat(WORLD.lamps, WORLD.pumpkins, [WORLD.fountain]);
  })();

  // Места, которые Луи может пометить
  function buildMarkSpots() {
    var spots = [];
    WORLD.trees.forEach(function (t) { spots.push({ x: t.x, y: t.y, kind: 'tree' }); });
    WORLD.lamps.forEach(function (l) { spots.push({ x: l.x, y: l.y, kind: 'lamp' }); });
    WORLD.bushes.forEach(function (b) { spots.push({ x: b.x, y: b.y + b.r * 0.6, kind: 'bush' }); });
    WORLD.solids.forEach(function (s) {
      if (s.kind === 'car') spots.push(s.w > s.h ? { x: s.x + 15, y: s.y + s.h + 2, kind: 'car' } : { x: s.x + s.w + 2, y: s.y + 15, kind: 'car' });
      if (s.kind === 'bins') spots.push({ x: s.x + 10, y: s.y + s.h + 2, kind: 'bins' });
      if (s.kind === 'kiosk') spots.push({ x: s.x + s.w + 2, y: s.y + s.h - 6, kind: 'kiosk' });
      if (s.kind === 'garages') spots.push({ x: s.x + 20, y: s.y + s.h + 2, kind: 'garage' }, { x: s.x + s.w - 20, y: s.y + s.h + 2, kind: 'garage' });
      if (s.kind === 'gazebo') spots.push({ x: s.x + s.w + 2, y: s.y + s.h + 2, kind: 'gazebo' });
    });
    [400, 1000, 1900, 2250].forEach(function (x) { spots.push({ x: x, y: S - 3, kind: 'fence' }); });
    [250, 800, 1900, 2250].forEach(function (y) { spots.push({ x: S - 3, y: y, kind: 'fence' }); });
    [700, 1000].forEach(function (y) { spots.push({ x: 1797, y: y, kind: 'fence' }); });
    return spots;
  }

  /* ------------------------------ маршруты ------------------------------ */
  var ADJ = {};
  WORLD.edges.forEach(function (e) {
    (ADJ[e[0]] = ADJ[e[0]] || []).push(e[1]);
    (ADJ[e[1]] = ADJ[e[1]] || []).push(e[0]);
  });
  var GATES = Object.keys(WORLD.nodes).filter(function (k) { return WORLD.nodes[k].gate; });

  function shortestPath(a, b) {
    var prev = {}, queue = [a], seen = {};
    seen[a] = true;
    while (queue.length) {
      var n = queue.shift();
      if (n === b) break;
      (ADJ[n] || []).forEach(function (m) { if (!seen[m]) { seen[m] = true; prev[m] = n; queue.push(m); } });
    }
    var path = [b];
    while (path[0] !== a) { path.unshift(prev[path[0]]); if (path[0] === undefined) return [a, b]; }
    return path;
  }
  /** Маршрут: от узла start случайно по дорожкам, потом к случайной калитке. */
  function makeRoute(rng, start) {
    var names = [start], cur = start, prevN = null;
    var steps = 3 + Math.floor(rng() * 5);
    for (var i = 0; i < steps; i++) {
      var opts = (ADJ[cur] || []).filter(function (m) { return m !== prevN && !WORLD.nodes[m].gate; });
      if (!opts.length) break;
      prevN = cur; cur = pick(rng, opts); names.push(cur);
    }
    var exit = pick(rng, GATES);
    names = names.concat(shortestPath(cur, exit).slice(1));
    return names.map(function (k) { return { x: Math.min(WORLD.nodes[k].x, S - 12), y: Math.min(WORLD.nodes[k].y, S - 12) }; });
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
  /** Гадость рядом с точкой (cx, cy) в радиусе rad или где угодно. */
  function spawnBad(s, rng, kind, near) {
    var L = s.louis, p = null;
    var okBase = function (x, y) {
      return isFree(x, y, 8) && !inSafeZone(x, y) && dist(x, y, WORLD.safe.x, WORLD.safe.y) > CONFIG.SAFE_R + 40 &&
        (!L || dist(x, y, L.x, L.y) > 100);
    };
    if (near) {
      for (var i = 0; i < 60 && !p; i++) {
        var a = rng() * Math.PI * 2, r = rand(rng, near.r0 || 20, near.r1 || 80);
        var x = near.x + Math.cos(a) * r, y = near.y + Math.sin(a) * r;
        if (okBase(x, y) && (!near.lawn || isLawn(x, y))) p = { x: x, y: y };
      }
    }
    if (!p) p = randomPoint(rng, 8, okBase);
    return makeItem(kind, p.x, p.y);
  }
  function badPlan(rng) {
    var chest = WORLD.trees.filter(function (t) { return t.type === 'chestnut'; });
    var park = WORLD.trees.filter(function (t) { return t.x > 1440 && t.y > 1440 && t.type !== 'chestnut'; });
    var k = WORLD.kiosk;
    var plan = [];
    chest.forEach(function (t) { for (var i = 0; i < 3; i++) plan.push({ kind: 'chestnut', near: { x: t.x, y: t.y, r0: 20, r1: 75 } }); });
    for (var m = 0; m < 3; m++) { var t = pick(rng, park); plan.push({ kind: 'mushroom', near: { x: t.x, y: t.y, r0: 22, r1: 40, lawn: true } }); }
    plan.push({ kind: 'wrapper', near: { x: k.x + 45, y: k.y + 110, r0: 30, r1: 120 } });
    plan.push({ kind: 'wrapper', near: { x: k.x + 45, y: k.y + 110, r0: 30, r1: 120 } });
    plan.push({ kind: 'chickenbone', near: { x: k.x + 45, y: k.y + 110, r0: 40, r1: 140 } });
    plan.push({ kind: 'chickenbone', near: { x: 1215, y: 260, r0: 20, r1: 90 } });
    plan.push({ kind: 'wrapper', near: { x: 1010, y: 1470, r0: 10, r1: 90 } });
    plan.push({ kind: 'wrapper' });
    plan.push({ kind: 'chickenbone' });
    return plan;
  }

  function rollCharacter(size, rng) {
    if (size === 'big') return rng() < CONFIG.BIG_ANGRY_CHANCE ? 'angry' : 'friendly';
    return rng() < CONFIG.SMALL_GRUMPY_CHANCE ? 'grumpy' : 'friendly';
  }

  function makeDog(breed, big, x, y, character) {
    return { name: breed.name, look: breed.look, size: big ? 'big' : 'small', r: big ? 20 : 11, x: x, y: y,
      character: character, state: 'leash', t: 0, progress: 0, friend: false, invited: false, warned: false, cooldown: 2,
      facing: 1, phase: 0, speed: 0, wander: { x: x, y: y }, wanderT: 0, stuck: 0, yap: 0 };
  }

  function pickBreed(s, rng, big) {
    var used = s.pairs.map(function (p) { return p.dog.name; }).concat(s.pairNamesUsed);
    var roster = (big ? BIG_DOGS : SMALL_DOGS).filter(function (d) { return used.indexOf(d.name) < 0; });
    if (!roster.length) roster = big ? BIG_DOGS : SMALL_DOGS;
    var breed = pick(rng, roster);
    s.pairNamesUsed.push(breed.name);
    return breed;
  }

  /** Пара «хозяин и собака». startNode - узел маршрута (по умолчанию калитка). */
  function spawnPair(s, rng, startNode) {
    var big = rng() < 0.45;
    var breed = pickBreed(s, rng, big);
    var start = startNode || pick(rng, GATES);
    var route = makeRoute(rng, start);
    var p0 = route[0];
    var owner = { x: p0.x, y: p0.y, r: CONFIG.OWNER_R, look: pick(rng, PEOPLE_LOOKS), facing: 1, phase: 0, speed: 0,
      route: route, ni: 1, wait: 0, stuck: 0 };
    var dog = makeDog(breed, big, p0.x + 18, p0.y - 18, rollCharacter(big ? 'big' : 'small', rng));
    resolveCollisions(dog, dog.r);
    var pair = { id: nextId(), owner: owner, dog: dog, done: false };
    s.pairs.push(pair);
    return pair;
  }

  /** Собаки на собачьей площадке гуляют без поводка, хозяева стоят у калитки. */
  function spawnDogParkPair(s, rng, i) {
    var big = i === 0 ? rng() < 0.5 : rng() < 0.3;
    var breed = pickBreed(s, rng, big);
    var b = WORLD.dogParkBounds;
    var owner = { x: b.x + 30, y: b.y + 230 + i * 70, r: CONFIG.OWNER_R, look: pick(rng, PEOPLE_LOOKS), facing: 1, phase: 0, speed: 0,
      route: [], ni: 0, wait: 0, stuck: 0, stay: true };
    var pos = randomPoint(rng, 12, function (x, y) { return inRect(x, y, b); });
    var dog = makeDog(breed, big, pos.x, pos.y, 'friendly');
    var pair = { id: nextId(), owner: owner, dog: dog, done: false, offLeash: true, area: b };
    s.pairs.push(pair);
    return pair;
  }

  /**
   * Новая прогулка. opts: { wind, evening, owner } - чтобы задать погоду явно (тесты).
   */
  function createWalk(rng, opts) {
    rng = rng || Math.random;
    opts = opts || {};
    var evening = opts.evening !== undefined ? opts.evening : rng() < CONFIG.EVENING_CHANCE;
    var wind = opts.wind !== undefined ? opts.wind : rng() < CONFIG.WIND_CHANCE;
    var s = {
      t: 0, time: CONFIG.WALK_TIME, over: false, result: null,
      weather: { wind: wind, evening: evening, rain: false },
      louis: { x: WORLD.safe.x + 20, y: WORLD.safe.y + 36, r: CONFIG.LOUIS_R, facing: 1, phase: 0, speed: 0,
        running: false, panic: 0, act: null, sniff: 0, sniffCd: 0, carry: null, tempt: null, fear: 0,
        jump: 0, leashMax: CONFIG.LEASH_MAX, taut: false, stuck: 0, temptT: 0 },
      owner: { x: WORLD.safe.x - 14, y: WORLD.safe.y + 4, r: CONFIG.OWNER_R, look: opts.owner || pick(rng, OWNERS),
        facing: 1, phase: 0, speed: 0, act: null, stuck: 0, detour: 0, detourDir: 1 },
      trail: [],
      meters: { pee: 0, poop: 0, energy: 0, happy: 0 },
      items: [], piles: [], pairs: [], pairNamesUsed: [], poops: [],
      marks: buildMarkSpots().map(function (m) { return { x: m.x, y: m.y, kind: m.kind, marked: false, sniffed: false, scent: rng() < CONFIG.SCENT_CHANCE }; }),
      sitters: [], kids: [], janitors: [], flocks: [], cats: [], ducks: [], court: null,
      nextPairAt: CONFIG.FIRST_PAIR_AT, windAt: wind ? rand(rng, CONFIG.WIND_INTERVAL[0], CONFIG.WIND_INTERVAL[1]) : Infinity,
      chestnutAt: CONFIG.CHESTNUT_RESPAWN, kioskAt: CONFIG.KIOSK_DROP_TIME * 0.5, playMult: 1, allDone: false,
      walked: 0, peeCd: 0, fuCalm: 0, duckCd: 0,
      stats: { friends: [], treats: 0, fetches: 0, fu: 0, ateBad: 0, scares: 0, piles: 0, pigeons: 0, cats: 0, ducks: 0, marks: 0, pets: 0, goals: 0, hurdles: 0 }
    };

    // Вещи
    for (var i = 0; i < CONFIG.TREATS; i++) s.items.push(spawnTreat(s, rng));
    badPlan(rng).forEach(function (b) { s.items.push(spawnBad(s, rng, b.kind, b.near)); });
    s.items.push(makeItem('ball', 1080, 1150));
    s.items.push(makeItem('ball', 2150, 1060));
    var parkTree = pick(rng, WORLD.trees.filter(function (t) { return t.x > 1440 && t.y > 1440 && t.type !== 'chestnut'; }));
    var sp = randomPoint(rng, 10, function (x, y) { return dist(x, y, parkTree.x, parkTree.y) < 80 && isLawn(x, y); });
    s.items.push(makeItem('stick', sp.x, sp.y));

    s.piles = WORLD.piles.map(function (p) { return { x: p.x, y: p.y, size: 0.65 + rng() * 0.35 }; });

    // Люди
    WORLD.sitters.forEach(function (st) {
      var chance = st.kind === 'grandma' ? (evening ? 0.5 : 0.9) : (evening ? 0.4 : 0.8);
      if (rng() < chance) s.sitters.push({ id: nextId(), kind: st.kind, look: st.look, x: st.x, y: st.y, spot: st.spot, cd: 0, progress: 0 });
    });
    var addKids = function (n, area, court) {
      for (var k = 0; k < n; k++) {
        var kp = randomPoint(rng, 10, function (x, y) { return inRect(x, y, area); });
        s.kids.push({ id: nextId(), x: kp.x, y: kp.y, r: 9, target: { x: kp.x, y: kp.y }, wait: rng() * 2, cd: 0, progress: 0,
          facing: 1, phase: 0, speed: 0, look: k % 2 ? 'kidA' : 'kidB', stuck: 0, area: area, court: court });
      }
    };
    addKids(evening ? (rng() < 0.4 ? 1 : 0) : 1 + Math.floor(rng() * 2), WORLD.playgroundBounds, false);
    var courtKids = evening ? (rng() < 0.5 ? 2 : 0) : 2 + Math.floor(rng() * 2);
    addKids(courtKids, WORLD.courtBounds, true);
    if (courtKids) {
      var cb = WORLD.courtBounds;
      s.court = { ball: { x: cb.x + cb.w / 2, y: cb.y + cb.h / 2, vx: 60, vy: 40 }, cd: 0, kickT: 1 };
    }
    if (!evening) {
      s.janitors.push({ x: 1000, y: 400, r: 11, facing: 1, phase: 0, speed: 0, target: null, sweeping: false, stuck: 0, region: { x: 0, y: 0, w: 1350, h: 1350 } });
      s.janitors.push({ x: 1800, y: 1800, r: 11, facing: 1, phase: 0, speed: 0, target: null, sweeping: false, stuck: 0, region: { x: 1350, y: 1350, w: 1100, h: 1100 } });
    }

    // Голуби, кошки, утки
    var spots = WORLD.pigeonSpots.slice();
    for (var f = 0; f < CONFIG.FLOCKS; f++) {
      var spot = spots.splice(Math.floor(rng() * spots.length), 1)[0];
      var birds = [];
      for (var n = 0; n < 4 + Math.floor(rng() * 4); n++) birds.push({ ox: rand(rng, -24, 24), oy: rand(rng, -18, 18), ph: rng() * 6, dx: rand(rng, -1, 1), dy: rand(rng, -1, 1) });
      s.flocks.push({ id: nextId(), x: spot.x, y: spot.y, state: 'ground', t: 0, from: null, to: null, birds: birds, cd: 0 });
    }
    WORLD.catSpots.forEach(function (cs, c) {
      if (rng() < 0.75) s.cats.push({ id: nextId(), x: cs.x, y: cs.y, z: 0, home: { x: cs.x, y: cs.y }, state: 'sit', t: 0, perch: null,
        facing: -1, phase: 0, speed: 0, color: c % 2 ? 'ginger' : 'gray' });
    });
    var pond = WORLD.ponds[0];
    for (var dk = 0; dk < 5; dk++) {
      var a = rng() * Math.PI * 2, rr = Math.sqrt(rng()) * 0.7;
      var dx = pond.x + Math.cos(a) * pond.rx * rr, dy = pond.y + Math.sin(a) * pond.ry * rr;
      s.ducks.push({ id: nextId(), x: dx, y: dy, tx: dx, ty: dy, ph: rng() * 6, facing: 1, calm: rng() * 3 });
    }

    // Соседи: двое уже гуляют, двое на собачьей площадке
    var inner = Object.keys(WORLD.nodes).filter(function (k) { return !WORLD.nodes[k].gate && k !== 'q1a' && k !== 'q1c'; });
    for (var pp = 0; pp < CONFIG.START_PAIRS; pp++) spawnPair(s, rng, pick(rng, inner));
    spawnDogParkPair(s, rng, 0);
    spawnDogParkPair(s, rng, 1);
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
  /** Хозяин идёт по следу Луи: так он обходит заборы и машины там же, где прошёл Луи. */
  function recordTrail(s) {
    var L = s.louis, tr = s.trail, last = tr[tr.length - 1];
    if (!last || d2(L, last) > 14) {
      if (last && d2(L, last) > 200) tr.length = 0;
      tr.push({ x: L.x, y: L.y });
      if (tr.length > 300) tr.shift();
    }
  }

  function stepOwner(s, dt, events) {
    var O = s.owner, L = s.louis, C = CONFIG;
    var moved = 0;
    recordTrail(s);
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
        var tr = s.trail;
        while (tr.length > 1 && d2(O, tr[0]) < 16) tr.shift();
        // Точки следа, до которых хозяин уже ближе, чем до Луи по прямой, можно пропустить
        while (tr.length > 1 && d2(O, tr[1]) < d2(O, tr[0])) tr.shift();
        var target = tr.length ? tr[0] : L;
        moved = steerOwner(O, target.x, target.y, sp, dt);
      } else if (d <= C.LEASH_SLACK * 0.8) {
        s.trail = [{ x: L.x, y: L.y }];
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
      if (Math.abs(m.x - L.x) > bd || Math.abs(m.y - L.y) > bd) continue;
      var d = d2(L, m);
      if (d < bd) { bd = d; best = m; }
    }
    return best;
  }

  /** Можно ли сейчас покакать: нагулялся, на траве и рядом никого чужого. */
  function poopReady(s) {
    var L = s.louis, C = CONFIG;
    if (s.meters.poop >= 100 || s.walked < C.POOP_READY_WALK || !isPoopGround(L.x, L.y)) return false;
    var R = C.POOP_PRIVACY_R;
    var crowd = s.pairs.some(function (p) { return d2(p.dog, L) < R || d2(p.owner, L) < R; }) ||
      s.kids.some(function (k) { return d2(k, L) < R; }) ||
      s.janitors.some(function (j) { return d2(j, L) < R; }) ||
      s.sitters.some(function (st) { return d2(st, L) < R; });
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
      var off = toWorldDir(-L.facing * 16, 0);
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
      if (Math.abs(it.x - L.x) > reveal + 10 || Math.abs(it.y - L.y) > reveal + 10) continue;
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
          if (!it.kiosk) s.items.push(spawnTreat(s, rng));
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
          var target = null;
          for (var tries = 0; tries < 60 && !target; tries++) {
            var ang = rng() * Math.PI * 2, rad = rand(rng, C.THROW_MIN, Math.min(C.THROW_MAX, C.LEASH_MAX * 0.9));
            var tx = O.x + Math.cos(ang) * rad, ty = O.y + Math.sin(ang) * rad;
            if (isFree(tx, ty, 10) && !inSafeZone(tx, ty) && !inWater(tx, ty)) target = { x: tx, y: ty };
          }
          if (!target) target = { x: L.x, y: L.y };
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
      if (s.items.filter(function (x) { return x.kind === 'chestnut'; }).length < 6) {
        var t = pick(rng, WORLD.trees.filter(function (x) { return x.type === 'chestnut'; }));
        s.items.push(spawnBad(s, rng, 'chestnut', { x: t.x, y: t.y, r0: 20, r1: 75 }));
      }
    }
    // Ларёк: продавец бросает кусочек
    s.kioskAt -= dt;
    if (s.kioskAt <= 0) {
      s.kioskAt = C.KIOSK_DROP_TIME;
      var kd = WORLD.kiosk.drop;
      if (!s.items.some(function (x) { return x.kiosk; })) {
        s.items.push(makeItem(rng() < 0.6 ? 'sausage' : 'biscuit', kd.x + rand(rng, -20, 20), kd.y + rand(rng, 0, 20), { kiosk: true, revealed: true }));
        events.push({ type: 'kiosk', x: kd.x, y: kd.y });
      }
    }
  }

  /* ------------------------------ чужие собаки ------------------------------ */
  function stepPairOwner(pair, s, dt) {
    var o = pair.owner, dog = pair.dog;
    if (o.stay) { o.speed = 0; o.facing = 1; return; }
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
      // Пока Луи делает дела, добрые собаки ждут и не лезут знакомиться
      if (dog.state === 'leash' && !dog.friend && d < C.GREET_R && L.panic <= 0 && !L.act) { dog.state = 'greet'; dog.progress = 0; }
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
      } else if (dog.state === 'leash' && dog.friend && pair.offLeash && d < 120 && L.running) {
        dog.state = 'play'; dog.t = 3; // на площадке друг снова играет, если Луи бегает рядом
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

    // Гуляет вокруг хозяина или бегает по площадке
    if (dog.state === 'leash' && !(dog.yap > 0)) {
      dog.wanderT -= dt;
      if (dog.wanderT <= 0 || d2(dog, dog.wander) < 6) {
        if (pair.offLeash) {
          var ar = pair.area;
          dog.wander = { x: ar.x + 20 + rng() * (ar.w - 40), y: ar.y + 20 + rng() * (ar.h - 40) };
          dog.wanderT = 1.5 + rng() * 2.5;
        } else {
          var a = rng() * Math.PI * 2, r = rng() * C.DOG_LEASH * 0.8;
          dog.wander = { x: o.x + Math.cos(a) * r, y: o.y + Math.sin(a) * r };
          dog.wanderT = 1.5 + rng() * 2;
        }
      }
      var next = o.route && o.route[o.ni];
      var lead = !pair.offLeash && o.speed > 5 && next;
      var target = { x: dog.wander.x + (lead ? (next.x - o.x) * 0.15 : 0), y: dog.wander.y + (lead ? (next.y - o.y) * 0.15 : 0) };
      moved = moveToward(dog, target.x, target.y, pair.offLeash ? 110 : Math.max(45, o.speed * 1.4), dt);
    }
    if (pair.offLeash) {
      var b = pair.area;
      dog.x = clamp(dog.x, b.x + dog.r, b.x + b.w - dog.r);
      dog.y = clamp(dog.y, b.y + dog.r, b.y + b.h - dog.r);
    } else if (dog.state !== 'chase' && dog.state !== 'return') leashDog(dog, o);
    dog.speed = dt > 0 ? moved / dt : 0;
  }

  /* ------------------------------ люди ------------------------------ */
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
    s.sitters.forEach(function (st) {
      if (st.kind === 'grandma') petCheck(st, s, dt, C.GRANDMA_COOLDOWN, C.HAPPY_GRANDMA, events, 'grandma');
      else petCheck(st, s, dt, C.SITTER_COOLDOWN, C.HAPPY_SITTER, events, 'sitter');
    });
    var ball = s.court && s.court.ball;
    s.kids.forEach(function (kid) {
      var moved = 0;
      var d = d2(kid, L);
      if (kid.cd <= 0 && d < C.KID_RUN_R && d > C.PET_R * 0.6 && L.panic <= 0 && !L.act) moved = moveToward(kid, L.x, L.y, 75, dt);
      else if (kid.court && ball) {
        // Дети на спортплощадке бегают за мячом
        var nearest = s.kids.filter(function (k) { return k.court; }).sort(function (a, b) { return d2(a, ball) - d2(b, ball); })[0];
        if (nearest === kid) moved = moveToward(kid, ball.x, ball.y, 70, dt);
        else if (kid.wait > 0) kid.wait -= dt;
        else {
          moved = moveToward(kid, kid.target.x, kid.target.y, 40, dt);
          if (d2(kid, kid.target) < 6 || kid.stuck > 1) { kid.target = randomPoint(rng, 10, function (x, y) { return inRect(x, y, kid.area); }); kid.wait = 1 + rng() * 2; }
        }
      } else {
        if (kid.wait > 0) kid.wait -= dt;
        else {
          moved = moveToward(kid, kid.target.x, kid.target.y, 40, dt);
          if (d2(kid, kid.target) < 6 || kid.stuck > 1) {
            kid.target = randomPoint(rng, 10, function (x, y) { return inRect(x, y, kid.area); });
            kid.wait = 1 + rng() * 3;
          }
        }
      }
      kid.speed = dt > 0 ? moved / dt : 0;
      petCheck(kid, s, dt, C.KID_COOLDOWN, C.HAPPY_KID, events, 'kid');
    });
    stepCourtBall(s, dt, rng, events);

    // Дворники сгребают листья в своих кварталах
    s.janitors.forEach(function (J) {
      var moved = 0;
      J.sweeping = false;
      if (!J.target || J.target.size >= 1) {
        var low = s.piles.filter(function (p) { return p.size < 0.8 && inRect(p.x, p.y, J.region); });
        J.target = low.length ? low.sort(function (a, b) { return d2(J, a) - d2(J, b); })[0] : null;
      }
      if (J.target) {
        var spot = { x: J.target.x + 26, y: J.target.y + 12 };
        if (d2(J, spot) > 8 && J.stuck < 2) moved = moveToward(J, spot.x, spot.y, C.JANITOR_SPEED, dt);
        else {
          J.sweeping = true; J.stuck = 0;
          J.target.size = Math.min(1, J.target.size + C.SWEEP_RATE * dt);
          setFacing(J, J.target.x - J.x, J.target.y - J.y);
        }
      }
      J.speed = dt > 0 ? moved / dt : 0;
    });
  }

  function stepCourtBall(s, dt, rng, events) {
    var court = s.court;
    if (!court) return;
    var b = court.ball, cb = WORLD.courtBounds, L = s.louis, C = CONFIG;
    if (court.cd > 0) court.cd -= dt;
    // Пинают дети
    s.kids.forEach(function (k) {
      if (k.court && d2(k, b) < 14 && Math.hypot(b.vx, b.vy) < 50) {
        var tx = cb.x + 30 + rng() * (cb.w - 60), ty = cb.y + 30 + rng() * (cb.h - 60);
        var l = dist(tx, ty, b.x, b.y) || 1;
        b.vx = (tx - b.x) / l * 170; b.vy = (ty - b.y) / l * 170;
      }
    });
    // Пинает Луи
    if (d2(L, b) < L.r + 7 && L.speed > 30) {
      var dx = b.x - L.x, dy = b.y - L.y, dl = Math.sqrt(dx * dx + dy * dy) || 1;
      var v = Math.max(150, L.speed * 1.3);
      b.vx = dx / dl * v; b.vy = dy / dl * v;
      if (L.running && court.cd <= 0) {
        court.cd = C.COURT_BALL_COOLDOWN;
        addMeter(s, 'energy', C.ENERGY_COURT_BALL);
        addMeter(s, 'happy', C.HAPPY_COURT_BALL);
        s.stats.goals++;
        events.push({ type: 'courtBall', x: b.x, y: b.y });
      }
    }
    b.x += b.vx * dt; b.y += b.vy * dt;
    var f = Math.max(0, 1 - 1.3 * dt);
    b.vx *= f; b.vy *= f;
    if (b.x < cb.x) { b.x = cb.x; b.vx = Math.abs(b.vx); } else if (b.x > cb.x + cb.w) { b.x = cb.x + cb.w; b.vx = -Math.abs(b.vx); }
    if (b.y < cb.y) { b.y = cb.y; b.vy = Math.abs(b.vy); } else if (b.y > cb.y + cb.h) { b.y = cb.y + cb.h; b.vy = -Math.abs(b.vy); }
  }

  /* ------------------------------ звери ------------------------------ */
  function stepAnimals(s, dt, rng, events) {
    var L = s.louis, C = CONFIG;
    s.flocks.forEach(function (f) {
      if (f.state === 'ground') {
        if (f.cd > 0) f.cd -= dt;
        var d = d2(L, f);
        // Взлетают сразу, как Луи подошёл, даже шагом
        if (f.cd <= 0 && d < C.PIGEON_FLEE_R && (L.speed > 15 || d < 50) && L.panic <= 0) {
          var others = WORLD.pigeonSpots.filter(function (p) { return dist(p.x, p.y, f.x, f.y) > 300; });
          others.sort(function (a, b) { return d2(a, f) - d2(b, f); });
          f.state = 'fly'; f.t = 0; f.from = { x: f.x, y: f.y }; f.to = pick(rng, others.slice(0, 3));
          f.away = { x: f.x - L.x, y: f.y - L.y };
          s.stats.pigeons++;
          if (L.running) { addMeter(s, 'energy', C.ENERGY_PIGEONS); addMeter(s, 'happy', C.HAPPY_PIGEONS); }
          events.push({ type: 'pigeons', x: f.x, y: f.y, chased: L.running });
        }
      } else {
        f.t += dt;
        var k = Math.min(1, f.t / C.PIGEON_FLY_TIME);
        var e = k * k * (3 - 2 * k);
        f.x = f.from.x + (f.to.x - f.from.x) * e;
        f.y = f.from.y + (f.to.y - f.from.y) * e;
        if (k >= 1) { f.state = 'ground'; f.cd = 3; }
      }
    });

    s.cats.forEach(function (c) {
      var moved = 0;
      if (c.state === 'sit') {
        if (d2(L, c) < C.CAT_FLEE_R && L.panic <= 0) {
          var perches = WORLD.solids.filter(function (x) { return x.kind === 'car' || x.kind === 'garages'; });
          var best = perches.sort(function (a, b) { return dist(a.x + a.w / 2, a.y + a.h / 2, c.x, c.y) - dist(b.x + b.w / 2, b.y + b.h / 2, c.x, c.y); })[0];
          c.perch = { x: best.x + best.w / 2 + (best.kind === 'garages' ? clamp(c.x - (best.x + best.w / 2), -best.w / 2 + 20, best.w / 2 - 20) : 0), y: best.y + best.h / 2, z: best.kind === 'garages' ? 48 : 36 };
          c.state = 'flee';
          if (L.running) { addMeter(s, 'energy', C.ENERGY_CAT); addMeter(s, 'happy', C.HAPPY_CAT); }
          s.stats.cats++;
          events.push({ type: 'cat', x: c.x, y: c.y, chased: L.running });
        }
      } else if (c.state === 'flee') {
        var dx = c.perch.x - c.x, dy = c.perch.y - c.y, l = Math.sqrt(dx * dx + dy * dy);
        var step = Math.min(l, C.CAT_SPEED * dt);
        if (l > 1) { c.x += dx / l * step; c.y += dy / l * step; moved = step; setFacing(c, dx, dy); }
        c.z = Math.max(0, 1 - l / 40) * c.perch.z;
        if (l < 2) { c.state = 'perch'; c.t = C.CAT_PERCH_TIME; c.z = c.perch.z; }
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

    // Утки уплывают от Луи на другой край пруда
    var pond = WORLD.ponds[0];
    if (s.duckCd > 0) s.duckCd -= dt;
    var scared = false;
    if (s.duckCd <= 0 && L.speed > 50 && L.panic <= 0) {
      scared = s.ducks.some(function (dk) { return d2(dk, L) < C.DUCK_SCARE_R; });
    }
    if (scared) {
      s.duckCd = C.DUCK_COOLDOWN;
      s.stats.ducks++;
      if (L.running) { addMeter(s, 'energy', C.ENERGY_DUCKS); addMeter(s, 'happy', C.HAPPY_DUCKS); }
      var ax = pond.x - L.x, ay = pond.y - L.y, al = Math.sqrt(ax * ax + ay * ay) || 1;
      s.ducks.forEach(function (dk) {
        dk.tx = pond.x + ax / al * pond.rx * 0.55 + rand(rng, -40, 40);
        dk.ty = pond.y + ay / al * pond.ry * 0.55 + rand(rng, -30, 30);
      });
      events.push({ type: 'ducks', x: s.ducks[0].x, y: s.ducks[0].y, chased: L.running });
    }
    s.ducks.forEach(function (dk) {
      dk.calm -= dt;
      if (dk.calm <= 0 && d2(dk, { x: dk.tx, y: dk.ty }) < 5) {
        var a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * 0.65;
        dk.tx = pond.x + Math.cos(a) * pond.rx * r; dk.ty = pond.y + Math.sin(a) * pond.ry * r;
        dk.calm = 2 + rng() * 4;
      }
      var dx = dk.tx - dk.x, dy = dk.ty - dk.y, l = Math.sqrt(dx * dx + dy * dy);
      if (l > 1) {
        var sp = s.duckCd > C.DUCK_COOLDOWN - 2 ? 90 : 18;
        var st = Math.min(l, sp * dt);
        dk.x += dx / l * st; dk.y += dy / l * st;
        setFacing(dk, dx, dy);
      }
    });
  }

  function stepPilesAndHurdles(s, dt, rng, events) {
    var L = s.louis, C = CONFIG;
    s.piles.forEach(function (p) {
      if (p.size < C.PILE_MIN_SIZE || L.act || L.panic > 0) return;
      if (Math.abs(p.x - L.x) > 60 || Math.abs(p.y - L.y) > 60) return;
      if (d2(L, p) < C.PILE_R * (0.6 + p.size * 0.4) + L.r * 0.5 && L.speed > C.PILE_JUMP_SPEED) {
        var size = p.size;
        p.size = 0;
        L.jump = 0.5;
        addMeter(s, 'energy', C.ENERGY_PILE * size);
        addMeter(s, 'happy', C.HAPPY_PILE);
        s.stats.piles++;
        events.push({ type: 'pile', x: p.x, y: p.y, size: size });
        var J = s.janitors.filter(function (j) { return d2(j, p) < C.SCOLD_R; })[0];
        if (J) {
          addMeter(s, 'happy', C.HAPPY_SCOLD);
          events.push({ type: 'scold', x: J.x, y: J.y, janitor: s.janitors.indexOf(J) });
        }
      }
    });
    // Барьеры на собачьей площадке
    WORLD.hurdles.forEach(function (h, i) {
      s.hurdleCd = s.hurdleCd || {};
      if (s.hurdleCd[i] > 0) { s.hurdleCd[i] -= dt; return; }
      if (L.running && L.panic <= 0 && inRect(L.x, L.y, { x: h.x - 6, y: h.y, w: h.w + 12, h: h.h })) {
        s.hurdleCd[i] = C.HURDLE_COOLDOWN;
        L.jump = 0.5;
        addMeter(s, 'energy', C.ENERGY_HURDLE);
        s.stats.hurdles++;
        events.push({ type: 'hurdle', x: L.x, y: L.y });
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

    if (s.t >= s.nextPairAt && L.act) s.nextPairAt = s.t + C.BUSY_SPAWN_DELAY;
    if (s.t >= s.nextPairAt) {
      s.nextPairAt = s.t + rand(rng, C.PAIR_INTERVAL[0], C.PAIR_INTERVAL[1]);
      if (s.pairs.filter(function (p) { return !p.offLeash; }).length < C.MAX_PAIRS) {
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
    stepPilesAndHurdles(s, dt, rng, events);

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

  /** Район без Луи: соседи, звери и дворники живут сами (фон меню). */
  function stepAmbient(s, dt, rng) {
    rng = rng || Math.random;
    var events = [];
    s.t += dt;
    if (s.t >= s.nextPairAt) {
      s.nextPairAt = s.t + rand(rng, CONFIG.PAIR_INTERVAL[0], CONFIG.PAIR_INTERVAL[1]);
      if (s.pairs.filter(function (p) { return !p.offLeash; }).length < CONFIG.MAX_PAIRS) spawnPair(s, rng);
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
      meterScore: meterScore, timeBonus: timeBonus,
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
    clamp: clamp, dist: dist, toWorldDir: toWorldDir, toScreenDir: toScreenDir, mulberry32: mulberry32,
    inSafeZone: inSafeZone, isLawn: isLawn, isPoopGround: isPoopGround, inWater: inWater, isFree: isFree,
    moveEntity: moveEntity, randomPoint: randomPoint, resolveCollisions: resolveCollisions, keepOutOfSafeZone: keepOutOfSafeZone,
    makeRoute: makeRoute, createWalk: createWalk, spawnPair: spawnPair, stepWalk: stepWalk, stepAmbient: stepAmbient,
    trySniff: trySniff, sayFu: sayFu, computeFear: computeFear, currentWish: currentWish, poopReady: poopReady,
    finishWalk: finishWalk, buildMarkSpots: buildMarkSpots,
    emptyProgress: emptyProgress, loadProgress: loadProgress, saveProgress: saveProgress, recordWalk: recordWalk,
    allDogNames: allDogNames
  };
});
