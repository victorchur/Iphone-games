/*
 * Neon Runner - ядро игры: настройки баланса и чистые функции
 * (скорость, генерация рядов, столкновения, очки, рекорд).
 *
 * Файл не зависит от DOM и Canvas, поэтому его одинаково загружает
 * браузер (window.NeonLogic) и Node.js (require) для автотестов.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.NeonLogic = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ================================================================
   *  БАЛАНС - все параметры игры в одном месте.
   *
   *  Единицы: вертикальные расстояния и скорости измеряются в долях
   *  высоты экрана (1.0 = один экран), время в секундах. Так игра
   *  ведёт себя одинаково на любом разрешении и частоте кадров.
   * ================================================================ */
  var CONFIG = {
    LANES: 3,

    // Скорость падения объектов, экранов в секунду
    BASE_SPEED: 0.55,     // стартовая
    SPEED_GROWTH: 0.012,  // прирост за каждую секунду игры
    MAX_SPEED: 1.4,       // потолок

    // Расстояние между рядами объектов, доли высоты экрана
    ROW_GAP_START: 0.45,
    ROW_GAP_MIN: 0.30,
    ROW_GAP_SHRINK: 0.0025, // уменьшение за секунду

    // Шанс, что в ряду два препятствия (остаётся одна свободная полоса)
    DOUBLE_START: 0.15,
    DOUBLE_MAX: 0.60,
    DOUBLE_GROWTH: 0.006,   // прирост шанса за секунду

    COIN_CHANCE: 0.50,      // шанс монеты в каждой свободной полосе
    COIN_ROW_CHANCE: 0.12,  // шанс ряда без препятствий, только монеты

    // Очки
    SCORE_PER_SECOND: 10,
    COIN_SCORE: 25,

    // Игрок
    PLAYER_Y: 0.80,          // вертикальная позиция, доля высоты экрана
    LANE_SWITCH_TIME: 0.11,  // время перестроения между полосами, с
    HITBOX_SHRINK: 0.78,     // хитбокс игрока меньше спрайта, касания краёв прощаются

    // Размеры объектов
    PLAYER_W: 0.58,    // доля ширины полосы
    PLAYER_H: 0.075,   // доля высоты экрана
    OBSTACLE_W: 0.74,  // доля ширины полосы
    OBSTACLE_H: 0.055, // доля высоты экрана
    COIN_R: 0.024,     // радиус, доля высоты экрана

    // Управление
    SWIPE_THRESHOLD: 28, // px, меньше - считается тапом

    // Эффекты
    DEATH_DELAY: 0.9,    // пауза между столкновением и экраном результата, с
    SHAKE_TIME: 0.45,    // тряска экрана при столкновении, с
    VIBRATE_PATTERN: [40, 30, 70], // navigator.vibrate при ударе, мс
    MAX_DT: 0.05         // потолок delta time, защита от рывков после пауз
  };

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  /** Скорость падения в момент времени elapsed (с от начала игры). */
  function speedAt(elapsed, cfg) {
    return Math.min(cfg.MAX_SPEED, cfg.BASE_SPEED + cfg.SPEED_GROWTH * elapsed);
  }

  /** Расстояние до следующего ряда в долях экрана. */
  function rowGapAt(elapsed, cfg) {
    return Math.max(cfg.ROW_GAP_MIN, cfg.ROW_GAP_START - cfg.ROW_GAP_SHRINK * elapsed);
  }

  /** Шанс ряда с двумя препятствиями. */
  function doubleChanceAt(elapsed, cfg) {
    return Math.min(cfg.DOUBLE_MAX, cfg.DOUBLE_START + cfg.DOUBLE_GROWTH * elapsed);
  }

  /** Очки: время + монеты. */
  function computeScore(elapsed, coins, cfg) {
    return Math.floor(elapsed * cfg.SCORE_PER_SECOND) + coins * cfg.COIN_SCORE;
  }

  /** Центр полосы по X в пикселях. */
  function laneCenter(lane, laneWidth) {
    return (lane + 0.5) * laneWidth;
  }

  /* ----------------------------- геометрия ----------------------------- */

  function rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  /** Уменьшает прямоугольник вокруг центра на коэффициент f (0..1]. */
  function shrinkRect(r, f) {
    var w = r.w * f;
    var h = r.h * f;
    return { x: r.x + (r.w - w) / 2, y: r.y + (r.h - h) / 2, w: w, h: h };
  }

  /** Пересечение окружности {x,y,r} и прямоугольника {x,y,w,h}. */
  function circleRectHit(c, r) {
    var cx = clamp(c.x, r.x, r.x + r.w);
    var cy = clamp(c.y, r.y, r.y + r.h);
    var dx = c.x - cx;
    var dy = c.y - cy;
    return dx * dx + dy * dy <= c.r * c.r;
  }

  /* --------------------------- генерация рядов -------------------------- */

  /**
   * Собирает очередной ряд объектов.
   *
   * prevFree - свободные полосы предыдущего ряда. Гарантия честности:
   * из любой свободной полосы предыдущего ряда до свободной полосы нового
   * можно добраться одним перестроением (или вообще не двигаться).
   *
   * Возвращает { obstacles: [lanes], coins: [lanes], free: [lanes] }.
   */
  function pickRow(prevFree, elapsed, cfg, rng) {
    rng = rng || Math.random;
    var lanes = [];
    for (var i = 0; i < cfg.LANES; i++) lanes.push(i);
    if (!prevFree || !prevFree.length) prevFree = lanes;

    // Ряд-передышка: только монеты
    if (rng() < cfg.COIN_ROW_CHANCE) {
      var coinLanes = lanes.filter(function () { return rng() < 0.85; });
      if (!coinLanes.length) coinLanes = [Math.floor(rng() * cfg.LANES)];
      return { obstacles: [], coins: coinLanes, free: lanes };
    }

    var obstacles;
    if (rng() < doubleChanceAt(elapsed, cfg)) {
      // Два препятствия: единственная свободная полоса должна быть достижима
      // из каждой свободной полосы предыдущего ряда за один шаг.
      var reachable = lanes.filter(function (l) {
        return prevFree.every(function (p) { return Math.abs(p - l) <= 1; });
      });
      if (!reachable.length) {
        reachable = lanes.filter(function (l) {
          return prevFree.some(function (p) { return Math.abs(p - l) <= 1; });
        });
      }
      var free = reachable[Math.floor(rng() * reachable.length)];
      obstacles = lanes.filter(function (l) { return l !== free; });
    } else {
      obstacles = [Math.floor(rng() * cfg.LANES)];
    }

    var freeLanes = lanes.filter(function (l) { return obstacles.indexOf(l) < 0; });
    var coins = freeLanes.filter(function () { return rng() < cfg.COIN_CHANCE; });
    return { obstacles: obstacles, coins: coins, free: freeLanes };
  }

  /* ------------------------------- рекорд ------------------------------- */

  /** Читает рекорд из хранилища (localStorage или совместимый объект). */
  function loadBest(storage, key) {
    try {
      var v = parseInt(storage.getItem(key), 10);
      return isFinite(v) && v > 0 ? v : 0;
    } catch (e) {
      return 0;
    }
  }

  /** Сохраняет рекорд, если score его побил. Возвращает { best, isNew }. */
  function saveBest(storage, key, score) {
    var best = loadBest(storage, key);
    if (score > best) {
      try { storage.setItem(key, String(score)); } catch (e) { /* приватный режим */ }
      return { best: score, isNew: true };
    }
    return { best: best, isNew: false };
  }

  return {
    CONFIG: CONFIG,
    clamp: clamp,
    speedAt: speedAt,
    rowGapAt: rowGapAt,
    doubleChanceAt: doubleChanceAt,
    computeScore: computeScore,
    laneCenter: laneCenter,
    rectsOverlap: rectsOverlap,
    shrinkRect: shrinkRect,
    circleRectHit: circleRectHit,
    pickRow: pickRow,
    loadBest: loadBest,
    saveBest: saveBest
  };
});
