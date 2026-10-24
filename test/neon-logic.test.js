'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../public/neon-runner/logic.js');

const cfg = L.CONFIG;

/** Детерминированный генератор (mulberry32) для воспроизводимых тестов. */
function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fakeStorage(initial) {
  const data = Object.assign({}, initial);
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    data
  };
}

test('скорость растёт линейно и упирается в потолок', () => {
  assert.equal(L.speedAt(0, cfg), cfg.BASE_SPEED);
  assert.ok(L.speedAt(10, cfg) > L.speedAt(5, cfg));
  assert.equal(L.speedAt(10000, cfg), cfg.MAX_SPEED);
});

test('расстояние между рядами уменьшается до минимума', () => {
  assert.equal(L.rowGapAt(0, cfg), cfg.ROW_GAP_START);
  assert.ok(L.rowGapAt(30, cfg) < cfg.ROW_GAP_START);
  assert.equal(L.rowGapAt(100000, cfg), cfg.ROW_GAP_MIN);
});

test('очки: время плюс монеты', () => {
  assert.equal(L.computeScore(0, 0, cfg), 0);
  assert.equal(L.computeScore(10, 0, cfg), 10 * cfg.SCORE_PER_SECOND);
  assert.equal(L.computeScore(10.05, 0, cfg), 10 * cfg.SCORE_PER_SECOND);
  assert.equal(L.computeScore(3, 4, cfg), 3 * cfg.SCORE_PER_SECOND + 4 * cfg.COIN_SCORE);
});

test('столкновение прямоугольников', () => {
  const a = { x: 0, y: 0, w: 10, h: 10 };
  assert.ok(L.rectsOverlap(a, { x: 5, y: 5, w: 10, h: 10 }));
  assert.ok(!L.rectsOverlap(a, { x: 10, y: 0, w: 10, h: 10 }), 'касание краями не считается');
  assert.ok(!L.rectsOverlap(a, { x: 0, y: 11, w: 10, h: 10 }));
  assert.ok(L.rectsOverlap(a, { x: -5, y: -5, w: 20, h: 20 }), 'полное поглощение');
});

test('уменьшение хитбокса сохраняет центр', () => {
  const r = L.shrinkRect({ x: 10, y: 20, w: 100, h: 50 }, 0.5);
  assert.deepEqual(r, { x: 35, y: 32.5, w: 50, h: 25 });
});

test('хитбокс прощает касание краёв', () => {
  const player = L.shrinkRect({ x: 0, y: 0, w: 100, h: 100 }, cfg.HITBOX_SHRINK);
  const grazing = { x: 95, y: 0, w: 50, h: 50 }; // перекрывает спрайт на 5px
  assert.ok(L.rectsOverlap({ x: 0, y: 0, w: 100, h: 100 }, grazing));
  assert.ok(!L.rectsOverlap(player, grazing));
});

test('окружность и прямоугольник', () => {
  const r = { x: 0, y: 0, w: 10, h: 10 };
  assert.ok(L.circleRectHit({ x: 5, y: 5, r: 1 }, r), 'центр внутри');
  assert.ok(L.circleRectHit({ x: 12, y: 5, r: 2.5 }, r), 'край касается');
  assert.ok(!L.circleRectHit({ x: 13, y: 5, r: 2.5 }, r), 'не достаёт');
  assert.ok(!L.circleRectHit({ x: 12, y: 12, r: 2.5 }, r), 'угол по диагонали');
  assert.ok(L.circleRectHit({ x: 12, y: 12, r: 3 }, r), 'угол по диагонали, радиус больше');
});

test('центр полосы', () => {
  assert.equal(L.laneCenter(0, 100), 50);
  assert.equal(L.laneCenter(2, 100), 250);
});

test('ряд всегда оставляет свободную полосу и не больше LANES-1 препятствий', () => {
  const rng = makeRng(42);
  let prevFree = null;
  for (let i = 0; i < 5000; i++) {
    const elapsed = (i / 5000) * 300;
    const row = L.pickRow(prevFree, elapsed, cfg, rng);
    assert.ok(row.free.length >= 1, 'есть свободная полоса');
    assert.ok(row.obstacles.length <= cfg.LANES - 1);
    for (const l of row.obstacles) assert.ok(l >= 0 && l < cfg.LANES);
    for (const l of row.coins) {
      assert.ok(!row.obstacles.includes(l), 'монета не внутри препятствия');
      assert.ok(row.free.includes(l));
    }
    assert.equal(new Set(row.obstacles).size, row.obstacles.length, 'без дублей');
    prevFree = row.free;
  }
});

test('из любой свободной полосы предыдущего ряда новый ряд проходим за один шаг', () => {
  const rng = makeRng(7);
  let prevFree = null;
  for (let i = 0; i < 5000; i++) {
    const row = L.pickRow(prevFree, 400, cfg, rng); // 400с: максимальная сложность
    if (prevFree) {
      for (const p of prevFree) {
        const ok = row.free.some((f) => Math.abs(f - p) <= 1);
        assert.ok(ok, `из полосы ${p} нельзя попасть в ${JSON.stringify(row.free)}`);
      }
    }
    prevFree = row.free;
  }
});

test('на поздней стадии встречаются ряды с двумя препятствиями и ряды только с монетами', () => {
  const rng = makeRng(99);
  let doubles = 0, coinRows = 0, prevFree = null;
  for (let i = 0; i < 2000; i++) {
    const row = L.pickRow(prevFree, 400, cfg, rng);
    if (row.obstacles.length === 2) doubles++;
    if (row.obstacles.length === 0) coinRows++;
    prevFree = row.free;
  }
  assert.ok(doubles > 500, `двойных: ${doubles}`);
  assert.ok(coinRows > 100, `монетных: ${coinRows}`);
});

test('рекорд: чтение из пустого и повреждённого хранилища', () => {
  assert.equal(L.loadBest(fakeStorage({}), 'best'), 0);
  assert.equal(L.loadBest(fakeStorage({ best: 'abc' }), 'best'), 0);
  assert.equal(L.loadBest(fakeStorage({ best: '-5' }), 'best'), 0);
  assert.equal(L.loadBest(fakeStorage({ best: '120' }), 'best'), 120);
});

test('рекорд: сохраняется только при улучшении', () => {
  const s = fakeStorage({ best: '100' });
  assert.deepEqual(L.saveBest(s, 'best', 50), { best: 100, isNew: false });
  assert.equal(s.data.best, '100');
  assert.deepEqual(L.saveBest(s, 'best', 100), { best: 100, isNew: false });
  assert.deepEqual(L.saveBest(s, 'best', 150), { best: 150, isNew: true });
  assert.equal(s.data.best, '150');
});

test('рекорд: хранилище бросает исключения (приватный режим)', () => {
  const broken = {
    getItem() { throw new Error('denied'); },
    setItem() { throw new Error('denied'); }
  };
  assert.equal(L.loadBest(broken, 'best'), 0);
  assert.deepEqual(L.saveBest(broken, 'best', 10), { best: 10, isNew: true });
});
