'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../public/louis-walk/logic.js');

const C = G.CONFIG;
const W = G.WORLD;

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
const idle = { x: 0, y: 0, mag: 0 };
const toward = (from, to, mag = 0.75) => ({ x: to.x - from.x, y: to.y - from.y, mag });
const run = (s, input, secs, dt = 1 / 30, rng) => {
  const ev = [];
  for (let t = 0; t < secs && !s.over; t += dt) ev.push(...G.stepWalk(s, typeof input === 'function' ? input(s) : input, dt, rng));
  return ev;
};
const has = (ev, type) => ev.some((e) => e.type === type);
/** Шагает, пока не случится событие type (или не выйдет время). */
const runUntil = (s, input, type, secs, dt = 1 / 30) => {
  const ev = [];
  for (let t = 0; t < secs && !s.over; t += dt) {
    const e = G.stepWalk(s, typeof input === 'function' ? input(s) : input, dt);
    ev.push(...e);
    if (has(e, type)) break;
  }
  return ev;
};
/** Пустой район: без соседей, людей, зверей и вещей - чтобы проверять одно правило. */
function quietWalk(seed, opts) {
  const s = G.createWalk(makeRng(seed), Object.assign({ evening: false, wind: false }, opts));
  s.items = []; s.pairs = []; s.kids = []; s.sitters = []; s.janitors = []; s.flocks = []; s.cats = []; s.ducks = [];
  s.court = null; s.kioskAt = Infinity; s.chestnutAt = Infinity;
  s.nextPairAt = Infinity;
  s.marks.forEach((m) => { m.scent = false; });
  return s;
}
// Открытая лужайка во дворе Луи недалеко от подъезда и пустая собачья площадка
const LAWN = { x: 960, y: 400 };
const PARK = W.dogPark;
function place(s, x, y) { s.louis.x = x; s.louis.y = y; s.owner.x = x + 30; s.owner.y = y + 20; }
function fakeStorage(initial) {
  const data = Object.assign({}, initial);
  return { getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); }, data };
}

/* --------------------------- изометрия и карта --------------------------- */

test('экранное направление переводится в направление по двору и обратно', () => {
  for (const [sx, sy] of [[1, 0], [0, 1], [-3, 2], [0.5, -4]]) {
    const w = G.toWorldDir(sx, sy), back = G.toScreenDir(w.x, w.y);
    assert.ok(Math.abs(back.x - sx) < 1e-9 && Math.abs(back.y - sy) < 1e-9);
  }
  const up = G.toWorldDir(0, -1);
  assert.ok(up.x < 0 && up.y < 0, 'вверх по экрану - вглубь двора к дому');
});

test('район в 6 раз больше двора 1000 на 1000, четыре квартала', () => {
  assert.ok(W.size * W.size >= 6 * 1000 * 1000);
  assert.equal(W.buildings.length, 4);
  assert.ok(W.ponds.length && W.dogPark && W.court && W.kiosk, 'пруд, собачья и спортивная площадки, ларёк');
});

test('раскладка: деревья и кусты на газоне, кучи свободны, лужайки для тестов открыты', () => {
  for (const t of W.trees) assert.ok(G.isLawn(t.x, t.y), `дерево ${t.x},${t.y}`);
  for (const b of W.bushes) assert.ok(G.isLawn(b.x, b.y), `куст ${b.x},${b.y}`);
  for (const p of W.piles) assert.ok(G.isLawn(p.x, p.y) && G.isFree(p.x, p.y, 10), `куча ${p.x},${p.y}`);
  assert.ok(W.piles.length >= 12, 'куч листьев много');
  for (const p of W.pigeonSpots) assert.ok(G.isFree(p.x, p.y, 6), `голуби ${p.x},${p.y}`);
  for (const c of W.catSpots) assert.ok(G.isFree(c.x, c.y, 8), `кот ${c.x},${c.y}`);
  for (const st of W.sitters) assert.ok(G.isFree(st.spot.x, st.spot.y, 13), `у лавочки ${st.kind}`);
  assert.ok(G.inSafeZone(W.safe.x, W.safe.y));
  for (let x = LAWN.x - 90; x <= LAWN.x + 90; x += 15) for (let y = LAWN.y - 50; y <= LAWN.y + 50; y += 15) assert.ok(G.isFree(x, y, 22) && G.isLawn(x, y), `лужайка ${x},${y}`);
  for (let x = PARK.x + 25; x <= PARK.x + PARK.w - 25; x += 20) for (let y = PARK.y + 25; y <= PARK.y + PARK.h - 25; y += 20) assert.ok(G.isFree(x, y, 20), `площадка ${x},${y}`);
});

test('в пруд не зайти, а утки в воде', () => {
  const pd = W.ponds[0];
  assert.ok(G.inWater(pd.x, pd.y) && !G.isFree(pd.x, pd.y, 5));
  const e = { x: pd.x - pd.rx - 60, y: pd.y };
  for (let i = 0; i < 60; i++) G.moveEntity(e, 13, 6, 0);
  assert.ok(!G.inWater(e.x, e.y), 'остановился на берегу');
  const s = G.createWalk(makeRng(3));
  for (const d of s.ducks) assert.ok(G.inWater(d.x, d.y));
});

test('маршруты соседей ведут по дорожкам и уходят в калитку', () => {
  const rng = makeRng(5);
  for (let i = 0; i < 60; i++) {
    const r = G.makeRoute(rng, 'q1a');
    assert.ok(r.length >= 2);
    for (const n of r) { assert.ok(!G.inSafeZone(n.x, n.y), 'маршрут не ведёт к подъезду'); assert.ok(G.isFree(n.x, n.y, 12), `узел ${n.x},${n.y}`); }
    const last = r[r.length - 1];
    assert.ok(last.x > W.size - 40 || last.y > W.size - 40, 'в конце калитка');
  }
});

test('прогулки создаются корректно днём и вечером, дождя нет', () => {
  for (let seed = 1; seed <= 30; seed++) {
    for (const opts of [{}, { evening: true }, { evening: false, wind: true }]) {
      const s = G.createWalk(makeRng(seed), opts);
      assert.equal(s.weather.rain, false);
      assert.ok(G.inSafeZone(s.louis.x, s.louis.y), 'старт у подъезда');
      assert.ok(G.isFree(s.louis.x, s.louis.y, s.louis.r) && G.isFree(s.owner.x, s.owner.y, s.owner.r));
      assert.equal(s.time, C.WALK_TIME);
      for (const it of s.items) {
        assert.ok(G.isFree(it.x, it.y, 6), `${it.kind} в препятствии`);
        assert.ok(!G.inSafeZone(it.x, it.y), `${it.kind} у подъезда`);
        if (it.group === 'treat') { assert.ok(G.isLawn(it.x, it.y)); assert.equal(it.revealed, false, 'вкусняшки спрятаны'); }
      }
      assert.equal(s.items.filter((i) => i.group === 'treat').length, C.TREATS);
      assert.ok(s.items.filter((i) => i.group === 'bad').length >= 10, 'гадости есть');
      assert.ok(s.marks.some((m) => m.scent), 'есть места с запахом');
      assert.equal(s.pairs.filter((p) => p.offLeash).length, 2, 'на собачьей площадке гуляют двое');
      for (const p of s.pairs.filter((q) => q.offLeash)) assert.ok(p.dog.x >= PARK.x && p.dog.x <= PARK.x + PARK.w && p.dog.y >= PARK.y && p.dog.y <= PARK.y + PARK.h);
      if (s.weather.evening) assert.equal(s.janitors.length, 0, 'вечером дворники ушли');
      else assert.equal(s.janitors.length, 2);
    }
  }
});

/* --------------------------- движение и поводок --------------------------- */

test('Луи не уходит дальше рулетки, хозяин идёт следом', () => {
  const s = quietWalk(2);
  place(s, PARK.x + 30, PARK.y + 260);
  run(s, { x: 1, y: 0, mag: 1 }, 2.2);
  assert.ok(G.dist(s.louis.x, s.louis.y, s.owner.x, s.owner.y) <= s.louis.leashMax + 0.5);
  assert.ok(s.owner.x > PARK.x + 200, 'хозяин пошёл за Луи');
  assert.ok(s.meters.energy > 4, 'бег тратит энергию');
});

test('бег тратит энергию быстрее шага', () => {
  const a = quietWalk(3), b = quietWalk(3);
  place(a, PARK.x + 30, PARK.y + 100); place(b, PARK.x + 30, PARK.y + 100);
  run(a, { x: 1, y: 0, mag: 0.5 }, 1.5);
  run(b, { x: 1, y: 0, mag: 1 }, 1.5);
  assert.ok(b.meters.energy > a.meters.energy * 2);
});

test('хозяин идёт по следу Луи и проходит за ним в калитку', () => {
  const s = quietWalk(27);
  const gateY = 890;
  place(s, PARK.x - 70, gateY); s.owner.x = PARK.x - 130; s.owner.y = gateY;
  const path = [{ x: PARK.x + 60, y: gateY }, { x: PARK.x + 160, y: gateY + 120 }, { x: PARK.x + 260, y: gateY + 200 }];
  let i = 0;
  run(s, (st) => { if (i < path.length && G.dist(st.louis.x, st.louis.y, path[i].x, path[i].y) < 12) i++; return i < path.length ? toward(st.louis, path[i], 0.7) : idle; }, 8);
  run(s, idle, 3);
  assert.equal(i, path.length, 'Луи дошёл');
  const O = s.owner;
  assert.ok(O.x > PARK.x && O.x < PARK.x + PARK.w && O.y > PARK.y && O.y < PARK.y + PARK.h, `хозяин на площадке: ${O.x | 0},${O.y | 0}`);
});

/* ------------------------------- туалет ------------------------------- */

function nearSpot(s, kind) {
  const m = s.marks.find((q) => q.kind === kind);
  place(s, m.x + 24, m.y + 8);
  return m;
}

test('у места с запахом Луи нюхает и метит, если стоять спокойно', () => {
  const s = quietWalk(4);
  const m = nearSpot(s, 'tree');
  m.scent = true;
  const ev = run(s, idle, C.PEE_SNIFF_TIME + C.PEE_TIME + 0.3);
  assert.ok(has(ev, 'peeStart') && has(ev, 'pee'));
  assert.equal(s.meters.pee, C.PEE_PER_MARK);
  assert.ok(m.marked);
});

test('место без запаха - «не то», а метки идут с паузой', () => {
  const s = quietWalk(5);
  const m = nearSpot(s, 'lamp');
  m.scent = false;
  const ev = run(s, idle, C.PEE_SNIFF_TIME + 0.2);
  assert.ok(has(ev, 'notHere'));
  assert.equal(s.meters.pee, 0);
  assert.ok(m.sniffed);
  // Пометил одно - соседнее сразу не метит
  const t = s.marks.find((q) => q.kind === 'tree');
  t.scent = true;
  place(s, t.x + 24, t.y + 8);
  run(s, idle, C.PEE_SNIFF_TIME + C.PEE_TIME + 0.3);
  const t2 = s.marks.find((q) => q.kind === 'tree' && q !== t);
  t2.scent = true;
  place(s, t2.x + 24, t2.y + 8);
  const ev2 = run(s, idle, 1);
  assert.ok(!has(ev2, 'peeStart'), 'пауза между метками');
  run(s, idle, C.PEE_COOLDOWN + C.PEE_SNIFF_TIME + C.PEE_TIME);
  assert.equal(s.meters.pee, C.PEE_PER_MARK * 2);
});

test('если дёрнуть Луи во время дела, он передумывает', () => {
  const s = quietWalk(6);
  const m = nearSpot(s, 'tree');
  m.scent = true;
  run(s, idle, C.PEE_SNIFF_TIME + 0.3);
  assert.equal(s.louis.act.type, 'pee');
  const ev = run(s, { x: 1, y: 1, mag: 0.8 }, 0.1);
  assert.ok(has(ev, 'abort'));
  assert.equal(s.meters.pee, 0);
  assert.ok(!m.marked);
});

test('покакать: только нагулявшись, на траве и без свидетелей, потом хозяин убирает', () => {
  const s = quietWalk(7);
  s.walked = C.POOP_READY_WALK + 1;
  place(s, 700, 400);
  assert.ok(!G.isPoopGround(700, 400), 'на плитке нельзя');
  run(s, idle, 2);
  assert.equal(s.louis.act, null, 'на дорожке не хочет');
  s.walked = 0;
  place(s, LAWN.x, LAWN.y);
  run(s, idle, 3);
  assert.equal(s.louis.act, null, 'не нагулялся - не хочет');
  s.walked = C.POOP_READY_WALK + 1;
  s.kids.push({ id: 1, x: LAWN.x + 10, y: LAWN.y + 20, r: 9, target: { x: LAWN.x + 10, y: LAWN.y + 20 }, wait: 100, cd: 0, progress: 0, facing: 1, phase: 0, speed: 0, look: 'kidA', stuck: 0, area: { x: 0, y: 0, w: 1, h: 1 } });
  run(s, idle, 1);
  assert.equal(s.louis.act, null, 'рядом ребёнок - стесняется');
  s.kids.length = 0;
  const ev = run(s, idle, C.POOP_SNIFF_TIME + C.POOP_SPIN_TIME + C.POOP_TIME + 0.4);
  assert.ok(has(ev, 'poopStart') && has(ev, 'poop'));
  assert.equal(s.meters.poop, 100);
  assert.equal(s.poops.length, 1);
  assert.equal(s.owner.act.type, 'pickup');
  const ev2 = run(s, idle, 5);
  assert.ok(has(ev2, 'cleaned'));
  assert.equal(s.poops.length, 0);
});

/* --------------------------------- Фу --------------------------------- */

function badNear(s, kind = 'chestnut', dx = 55) {
  const it = { id: 999, kind, group: 'bad', x: LAWN.x, y: LAWN.y, z: 0, revealed: true, ignoredUntil: -1, state: 'ground', fetches: 0, thrown: false };
  s.items.push(it);
  place(s, it.x + dx, it.y);
  return it;
}

test('рядом с гадостью Луи замирает, потом тянется к ней сам', () => {
  const s = quietWalk(8);
  const it = badNear(s);
  const ev = run(s, idle, 0.1);
  assert.ok(has(ev, 'tempt'));
  const x0 = s.louis.x;
  run(s, idle, C.TEMPT_FREEZE * 0.8);
  assert.ok(Math.abs(s.louis.x - x0) < 1, 'сначала замер');
  run(s, idle, 0.6);
  assert.ok(s.louis.x < x0 - 10, 'потом тянется');
  assert.ok(G.dist(s.louis.x, s.louis.y, it.x, it.y) > C.PICKUP_R, 'ещё не съел: есть время нажать Фу');
});

test('«Фу» спасает и успокаивает Луи на пару секунд', () => {
  const s = quietWalk(9);
  const it = badNear(s);
  const other = { id: 998, kind: 'chestnut', group: 'bad', x: LAWN.x - 10, y: LAWN.y + 20, z: 0, revealed: true, ignoredUntil: -1, state: 'ground', fetches: 0, thrown: false };
  s.items.push(other);
  run(s, idle, 0.8);
  assert.ok(s.louis.tempt);
  assert.ok(G.sayFu(s));
  assert.equal(s.louis.tempt, null);
  const ev = run(s, idle, C.FU_CALM_TIME * 0.8);
  assert.ok(!has(ev, 'tempt'), 'соседний каштан не манит сразу');
  assert.equal(s.stats.fu, 1);
  assert.ok(s.items.includes(it) && s.items.includes(other), 'ничего не съел');
  assert.equal(G.sayFu(s), false, 'без гадости «Фу» ничего не меняет');
});

test('съел гадость - болит живот: счастье падает, шкала «покакать» откатывается', () => {
  const s = quietWalk(10);
  s.meters.poop = 100; s.meters.happy = 50;
  badNear(s, 'chickenbone');
  const ev = run(s, idle, 4);
  assert.ok(has(ev, 'ateBad'));
  assert.equal(s.meters.poop, 0);
  assert.equal(s.meters.happy, 50 + C.HAPPY_BAD);
  assert.equal(s.stats.ateBad, 1);
});

test('если тянуть прочь бегом, от гадости можно увести', () => {
  const s = quietWalk(11);
  const it = badNear(s, 'wrapper', 60);
  const ev = run(s, { x: 1, y: 0, mag: 1 }, 3);
  assert.ok(!has(ev, 'ateBad'));
  assert.ok(G.dist(s.louis.x, s.louis.y, it.x, it.y) > C.TEMPT_R);
});

/* ------------------------------ вещи и игры ------------------------------ */

test('вкусняшка в листьях: видна вблизи или по нюху, радует, появляется новая', () => {
  const s = quietWalk(12);
  s.piles.forEach((p) => { p.size = 0; });
  s.items.push({ id: 5, kind: 'sausage', group: 'treat', x: LAWN.x - 60, y: LAWN.y, z: 0, revealed: false, ignoredUntil: -1, state: 'ground' });
  place(s, LAWN.x - 60 + C.REVEAL_R + 40, LAWN.y);
  run(s, idle, 0.1);
  assert.equal(s.items[0].revealed, false);
  assert.ok(G.trySniff(s));
  run(s, idle, 0.1);
  assert.equal(s.items[0].revealed, true, 'нюх показал');
  const ev = run(s, (st) => toward(st.louis, { x: LAWN.x - 60, y: LAWN.y }), 3);
  assert.ok(has(ev, 'treat'));
  assert.equal(s.meters.happy, C.ITEMS.sausage.happy);
  assert.equal(s.items.filter((i) => i.group === 'treat').length, 1, 'новая вкусняшка');
});

test('мячик: принёс хозяину - его кидают, принёс снова - энергия и радость', () => {
  const s = quietWalk(13);
  const ball = { id: 7, kind: 'ball', group: 'toy', x: PARK.x + 200, y: PARK.y + 260, z: 0, revealed: true, ignoredUntil: -1, state: 'ground', fetches: 0, thrown: false };
  s.items.push(ball);
  place(s, ball.x + 5, ball.y - 10);
  s.owner.x = ball.x + 110; s.owner.y = ball.y + 50;
  let ev = run(s, idle, 0.2);
  assert.ok(has(ev, 'toy'));
  assert.equal(s.louis.carry, ball);
  ev = runUntil(s, (st) => toward(st.louis, st.owner), 'throw', 4);
  assert.ok(has(ev, 'throw'));
  assert.equal(ball.state, 'flying');
  ev = runUntil(s, idle, 'landed', C.THROW_FLIGHT + 0.2);
  assert.ok(has(ev, 'landed'));
  assert.equal(ball.thrown, true);
  const e0 = s.meters.energy;
  ev = run(s, (st) => toward(st.louis, ball, 1), 5);
  assert.ok(has(ev, 'fetch'));
  assert.ok(s.meters.energy >= e0 + C.ENERGY_FETCH);
  assert.equal(s.stats.fetches, 1);
});

test('прыжок в кучу листьев: энергия, куча разлетается, дворник ругается', () => {
  const s = quietWalk(14);
  const pile = s.piles[1];
  pile.size = 1;
  s.janitors = [{ x: pile.x + 60, y: pile.y + 20, r: 11, facing: 1, phase: 0, speed: 0, target: null, sweeping: false, stuck: 0, region: { x: 0, y: 0, w: W.size, h: W.size } }];
  place(s, pile.x - 90, pile.y);
  const ev = run(s, (st) => toward(st.louis, pile, 1), 2);
  assert.ok(has(ev, 'pile') && has(ev, 'scold'));
  assert.ok(s.meters.energy >= C.ENERGY_PILE * 0.9);
  assert.ok(pile.size < 0.5, 'дворник уже начал сгребать заново');
});

test('голуби взлетают сразу, даже если подойти шагом', () => {
  const s = quietWalk(15);
  const fx = PARK.x + 300, fy = PARK.y + 260;
  s.flocks.push({ id: 1, x: fx, y: fy, state: 'ground', t: 0, from: null, to: null, birds: [{ ox: 0, oy: 0, ph: 0, dx: 1, dy: 0 }], cd: 0 });
  place(s, fx - 200, fy);
  let flewAt = null;
  for (let t = 0; t < 4 && flewAt === null; t += 1 / 30) {
    G.stepWalk(s, toward(s.louis, { x: fx, y: fy }, 0.35), 1 / 30);
    if (s.flocks[0].state === 'fly') flewAt = G.dist(s.louis.x, s.louis.y, fx, fy);
  }
  assert.ok(flewAt !== null, 'взлетели');
  assert.ok(flewAt > C.PIGEON_FLEE_R - 10, `взлетели издалека: ${flewAt | 0}`);
  // Бегом - ещё и энергия
  const r = quietWalk(15);
  r.flocks.push({ id: 2, x: fx, y: fy, state: 'ground', t: 0, from: null, to: null, birds: [{ ox: 0, oy: 0, ph: 0, dx: 1, dy: 0 }], cd: 0 });
  place(r, fx - 200, fy);
  const ev = run(r, (st) => toward(st.louis, { x: fx, y: fy }, 1), 1.5);
  assert.ok(ev.some((e) => e.type === 'pigeons' && e.chased));
  assert.ok(r.meters.energy >= C.ENERGY_PIGEONS);
});

test('коты удирают на машину или гараж', () => {
  const s = quietWalk(16);
  const car = W.solids.find((q) => q.kind === 'car');
  const cx = car.x + car.w / 2, cy = car.y + car.h + 90;
  s.cats.push({ id: 2, x: cx, y: cy, z: 0, home: { x: cx, y: cy }, state: 'sit', t: 0, perch: null, facing: -1, phase: 0, speed: 0, color: 'gray' });
  place(s, cx, cy + 140);
  const ev = run(s, (st) => toward(st.louis, { x: cx, y: cy }, 1), 2);
  assert.ok(has(ev, 'cat'));
  run(s, idle, 1.5);
  assert.equal(s.cats[0].state, 'perch');
  assert.ok(s.cats[0].z > 30, 'сидит наверху');
});

test('утки уплывают от бегущего по берегу Луи', () => {
  const s = quietWalk(17);
  const pd = W.ponds[0];
  s.ducks = [{ id: 1, x: pd.x - pd.rx + 50, y: pd.y, tx: pd.x - pd.rx + 50, ty: pd.y, ph: 0, facing: 1, calm: 5 }];
  place(s, pd.x - pd.rx - 25, pd.y - 90);
  s.owner.x = s.louis.x - 40; s.owner.y = s.louis.y - 40;
  const ev = run(s, { x: 0, y: 1, mag: 1 }, 1.2);
  assert.ok(ev.some((e) => e.type === 'ducks' && e.chased));
  assert.ok(s.ducks[0].tx > pd.x, 'поплыли на другой край');
  assert.ok(s.meters.energy >= C.ENERGY_DUCKS);
});

test('на собачьей площадке Луи прыгает через барьеры', () => {
  const s = quietWalk(18);
  const h = W.hurdles[0];
  place(s, h.x - 60, h.y + h.h / 2);
  const ev = run(s, { x: 1, y: 0, mag: 1 }, 0.8);
  assert.ok(has(ev, 'hurdle'));
  assert.ok(s.louis.jump > 0 || s.meters.energy >= C.ENERGY_HURDLE);
});

test('погонял мяч на спортплощадке: энергия и радость', () => {
  const s = quietWalk(19);
  const cb = W.courtBounds;
  s.court = { ball: { x: cb.x + cb.w / 2, y: cb.y + cb.h / 2, vx: 0, vy: 0 }, cd: 0 };
  place(s, s.court.ball.x - 90, s.court.ball.y);
  const ev = run(s, (st) => toward(st.louis, st.court.ball, 1), 1.5);
  assert.ok(has(ev, 'courtBall'));
  assert.ok(s.meters.energy >= C.ENERGY_COURT_BALL && s.meters.happy >= C.HAPPY_COURT_BALL);
  assert.ok(Math.hypot(s.court.ball.vx, s.court.ball.vy) > 20 || G.dist(s.court.ball.x, s.court.ball.y, cb.x + cb.w / 2, cb.y + cb.h / 2) > 20, 'мяч покатился');
});

test('продавец шаурмы бросает кусочек, и он не повторяется сразу', () => {
  const s = quietWalk(20);
  s.kioskAt = 0.01;
  let ev = run(s, idle, 0.1);
  assert.ok(has(ev, 'kiosk'));
  const piece = s.items.find((i) => i.kiosk);
  assert.ok(piece && piece.group === 'treat' && piece.revealed);
  ev = run(s, idle, C.KIOSK_DROP_TIME + 0.5);
  assert.ok(!has(ev, 'kiosk'), 'пока лежит прежний, новый не бросает');
  place(s, piece.x + 20, piece.y);
  ev = run(s, (st) => toward(st.louis, piece), 2);
  assert.ok(has(ev, 'treat'));
  assert.equal(s.items.filter((i) => i.group === 'treat').length, 0, 'кусочек от ларька не заменяется новой вкусняшкой');
});

/* ------------------------------ люди ------------------------------ */

test('бабушка угощает, если постоять рядом, потом не сразу снова; в парке тоже гладят', () => {
  const s = quietWalk(21);
  const gm = W.sitters.find((x) => x.kind === 'grandma'), rd = W.sitters.find((x) => x.kind === 'reader');
  s.sitters = [{ id: 1, kind: 'grandma', look: 'grandma', x: gm.x, y: gm.y, spot: gm.spot, cd: 0, progress: 0 },
    { id: 2, kind: 'reader', look: 'coatPlum', x: rd.x, y: rd.y, spot: rd.spot, cd: 0, progress: 0 }];
  place(s, gm.spot.x, gm.spot.y);
  let ev = run(s, idle, C.PET_TIME + 0.2);
  assert.ok(has(ev, 'grandma'));
  assert.equal(s.meters.happy, C.HAPPY_GRANDMA);
  ev = run(s, idle, 3);
  assert.ok(!has(ev, 'grandma'));
  place(s, rd.spot.x, rd.spot.y);
  ev = run(s, idle, C.PET_TIME + 0.2);
  assert.ok(has(ev, 'sitter'));
  assert.equal(s.meters.happy, C.HAPPY_GRANDMA + C.HAPPY_SITTER);
});

test('дети сами бегут к Луи и гладят', () => {
  const s = quietWalk(22);
  const pg = W.playgroundBounds;
  s.kids.push({ id: 3, x: pg.x + 60, y: pg.y + 60, r: 9, target: { x: pg.x + 60, y: pg.y + 60 }, wait: 5, cd: 0, progress: 0, facing: 1, phase: 0, speed: 0, look: 'kidA', stuck: 0, area: pg });
  place(s, pg.x + 150, pg.y + 40);
  const ev = run(s, idle, 4);
  assert.ok(has(ev, 'kid'));
  assert.equal(s.meters.happy, C.HAPPY_KID);
});

/* ------------------------------ собаки ------------------------------ */

function pairNear(s, character, size = 'big') {
  const p = G.spawnPair(s, makeRng(1));
  p.dog.character = character; p.dog.size = size; p.dog.r = size === 'big' ? 20 : 11;
  p.dog.cooldown = 0; p.dog.state = 'leash';
  p.owner.x = LAWN.x - 60; p.owner.y = LAWN.y + 30; p.owner.wait = 999;
  p.dog.x = LAWN.x - 60; p.dog.y = LAWN.y;
  return p;
}

test('с доброй собакой понюхались: счастье и догонялки', () => {
  const s = quietWalk(23);
  const p = pairNear(s, 'friendly');
  place(s, LAWN.x + 20, LAWN.y + 10);
  const ev = run(s, idle, 4);
  assert.ok(has(ev, 'invite') && has(ev, 'friend'));
  assert.equal(s.meters.happy, C.HAPPY_FRIEND);
  assert.deepEqual(s.stats.friends, [p.dog.name]);
  assert.equal(p.dog.state, 'play');
  const e0 = s.meters.energy;
  run(s, { x: -1, y: 0, mag: 1 }, 0.5);
  const withFriend = s.meters.energy - e0;
  const solo = quietWalk(23);
  place(solo, LAWN.x + 20, LAWN.y + 10);
  run(solo, { x: -1, y: 0, mag: 1 }, 0.5);
  assert.ok(withFriend > solo.meters.energy * 1.5, 'вместе бегать веселее');
});

test('злая собака: рычит, срывается, пугает, Луи бежит к подъезду', () => {
  const s = quietWalk(24);
  const p = pairNear(s, 'angry');
  place(s, LAWN.x + 40, LAWN.y + 20);
  s.owner.x = LAWN.x + 90; s.owner.y = LAWN.y + 40;
  const always = () => 0; // хозяин не удержал
  const ev = run(s, idle, 6, 1 / 30, always);
  assert.ok(has(ev, 'warn') && has(ev, 'notice') && has(ev, 'chase') && has(ev, 'catch'));
  assert.equal(s.stats.scares, 1);
  assert.ok(s.meters.happy === 0, 'испуг забрал счастье');
  run(s, idle, C.PANIC_TIME);
  assert.ok(G.dist(s.louis.x, s.louis.y, W.safe.x, W.safe.y) < 260, 'убегает к подъезду');
  assert.notEqual(p.dog.state, 'chase');
});

test('у подъезда безопасно: злая собака туда не заходит и бросает погоню', () => {
  const s = quietWalk(25);
  const p = pairNear(s, 'angry');
  place(s, W.safe.x, W.safe.y + 10);
  p.dog.state = 'chase'; p.dog.t = 100; p.dog.x = W.safe.x + 30; p.dog.y = W.safe.y + 140;
  const ev = run(s, idle, 2, 1 / 30, () => 0);
  assert.ok(has(ev, 'giveup'));
  assert.ok(!has(ev, 'catch'));
  assert.equal(G.computeFear(s), 0);
  for (let i = 0; i < 200; i++) {
    p.dog.state = 'chase'; p.dog.t = 100;
    G.stepWalk(s, idle, 1 / 30, () => 0);
    assert.ok(G.dist(p.dog.x, p.dog.y, W.safe.x, W.safe.y) >= C.SAFE_R + p.dog.r - 0.5);
  }
});

test('если хозяин удержал поводок, погони нет', () => {
  const s = quietWalk(26);
  pairNear(s, 'angry');
  place(s, LAWN.x + 40, LAWN.y + 20);
  const ev = run(s, idle, 3, 1 / 30, () => 0.99);
  assert.ok(has(ev, 'notice') && has(ev, 'held'));
  assert.ok(!has(ev, 'chase'));
});

test('вредная мелкая тявкает: страшно и немного обидно', () => {
  const s = quietWalk(28);
  pairNear(s, 'grumpy', 'small');
  s.meters.happy = 50;
  place(s, LAWN.x - 10, LAWN.y + 10);
  const ev = run(s, idle, 1);
  assert.ok(has(ev, 'yap'));
  assert.equal(s.meters.happy, 50 + C.HAPPY_YAP);
});

/* ------------------------------ финал ------------------------------ */

test('всё сделал и пришёл к подъезду - отличная прогулка с бонусом за время', () => {
  const s = quietWalk(29);
  for (const k in s.meters) s.meters[k] = 100;
  place(s, 700, 420);
  const ev = run(s, (st) => toward(st.louis, W.safe, 0.7), 10);
  assert.ok(has(ev, 'allDone') && has(ev, 'end'));
  assert.equal(s.result.reason, 'done');
  assert.equal(s.result.stars, 3);
  assert.ok(s.result.timeBonus > 0);
});

test('время вышло - звёзды по числу выполненных шкал', () => {
  const cases = [[['pee', 'poop', 'energy', 'happy'], 3], [['pee', 'poop', 'energy'], 2], [['pee', 'poop'], 1], [['pee'], 0], [[], 0]];
  for (const [done, stars] of cases) {
    const s = quietWalk(30);
    place(s, LAWN.x, LAWN.y);
    for (const k of done) s.meters[k] = 100;
    s.time = 0.05;
    const ev = run(s, idle, 0.2);
    assert.ok(has(ev, 'end'));
    assert.equal(s.result.reason, done.length === 4 ? s.result.reason : 'timeout');
    assert.equal(s.result.stars, stars, done.join(','));
    assert.equal(s.result.timeBonus, 0);
  }
});

test('чего хочет Луи: по порядку шкал', () => {
  const s = quietWalk(31);
  place(s, LAWN.x, LAWN.y);
  assert.equal(G.currentWish(s), 'tree');
  s.meters.pee = 100; s.walked = C.POOP_READY_WALK;
  assert.equal(G.currentWish(s), 'grass');
  s.meters.poop = 100;
  assert.equal(G.currentWish(s), 'ball');
  s.meters.energy = 100;
  assert.equal(G.currentWish(s), 'heart');
  s.meters.happy = 100;
  assert.equal(G.currentWish(s), 'home');
});

test('целые случайные прогулки с честным ботом проходят без ошибок', () => {
  for (let seed = 1; seed <= 12; seed++) {
    const rng = makeRng(seed);
    const s = G.createWalk(rng);
    let wp = null;
    const bot = (st) => {
      const L = st.louis;
      if (L.tempt && rng() < 0.1) G.sayFu(st);
      if (L.act) return idle;
      if (st.allDone) return toward(L, W.safe, 0.8);
      if (L.carry) return toward(L, st.owner);
      if (rng() < 0.01) G.trySniff(st);
      if (!wp || G.dist(wp.x, wp.y, L.x, L.y) < 30) wp = G.randomPoint(rng, 13);
      return rng() < 0.15 ? idle : toward(L, wp, rng() < 0.5 ? 1 : 0.6);
    };
    run(s, bot, C.WALK_TIME + 5, 1 / 30, rng);
    assert.ok(s.over, 'прогулка закончилась');
    assert.ok(Number.isFinite(s.result.score) && s.result.score >= 0);
    for (const k in s.meters) assert.ok(s.meters[k] >= 0 && s.meters[k] <= 100);
    assert.ok(G.isFree(s.louis.x, s.louis.y, s.louis.r - 0.5), 'Луи не застрял в препятствии');
  }
});

/* ------------------------------ прогресс ------------------------------ */

test('прогресс: рекорд, звёзды, альбом и битое хранилище', () => {
  assert.deepEqual(G.loadProgress(fakeStorage({})), G.emptyProgress());
  assert.deepEqual(G.loadProgress(fakeStorage({ [G.STORAGE_KEY]: '{bad' })), G.emptyProgress());
  const broken = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } };
  assert.deepEqual(G.loadProgress(broken), G.emptyProgress());
  assert.equal(G.saveProgress(broken, G.emptyProgress()), false);
  const st = fakeStorage({});
  let r = G.recordWalk(G.loadProgress(st), { score: 400, stars: 2, friends: ['Бакс'] });
  assert.ok(r.isBest);
  assert.deepEqual(r.newFriends, ['Бакс']);
  r = G.recordWalk(r.progress, { score: 300, stars: 3, friends: ['Бакс', 'Тоша'] });
  assert.ok(!r.isBest);
  assert.deepEqual(r.progress, { best: 400, bestStars: 3, walks: 2, perfect: 1, friends: ['Бакс', 'Тоша'] });
  G.saveProgress(st, r.progress);
  assert.deepEqual(G.loadProgress(st), r.progress);
  assert.equal(G.allDogNames().length, G.BIG_DOGS.length + G.SMALL_DOGS.length);
});
