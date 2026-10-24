'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../public/louis/logic.js');

const CFG = G.CONFIG;
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

function fakeStorage(initial) {
  const data = Object.assign({}, initial);
  return { getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); }, data };
}

const idle = { x: 0, y: 0, mag: 0 };
const toward = (from, to, mag = 0.8) => ({ x: to.x - from.x, y: to.y - from.y, mag });

/* ------------------------------ столкновения ------------------------------ */

test('круг выталкивается из прямоугольника снаружи и изнутри', () => {
  const rect = { x: 0, y: 0, w: 100, h: 50 };
  const e = { x: 110, y: 25 };
  assert.ok(G.pushOutOfRect(e, 16, rect));
  assert.equal(e.x, 116);
  const inside = { x: 95, y: 25 };
  assert.ok(G.pushOutOfRect(inside, 10, rect));
  assert.equal(inside.x, 110, 'по кратчайшей оси вправо');
  const far = { x: 200, y: 200 };
  assert.ok(!G.pushOutOfRect(far, 10, rect));
});

test('круг выталкивается из круга', () => {
  const e = { x: 5, y: 0 };
  assert.ok(G.pushOutOfCircle(e, 10, { x: 0, y: 0, r: 10 }));
  assert.ok(Math.abs(Math.hypot(e.x, e.y) - 20) < 1e-9);
});

test('Луи не проходит сквозь машины, дом и деревья', () => {
  const s = G.createWalk(0, makeRng(1));
  const L = s.louis;
  const car = W.solids.find((x) => x.kind === 'car');
  L.x = car.x + car.w / 2; L.y = car.y - 40;
  for (let i = 0; i < 200; i++) G.stepLouis(s, { x: 0, y: 1, mag: 0.8 }, 1 / 60);
  assert.ok(L.y <= car.y - L.r + 0.01, `Луи заехал в машину: y=${L.y}`);

  L.x = 300; L.y = 330;
  for (let i = 0; i < 300; i++) G.stepLouis(s, { x: 0, y: -1, mag: 1 }, 1 / 60);
  assert.ok(L.y >= 205 + L.r - 0.01, 'не залезает в дом');

  for (let i = 0; i < 2000; i++) {
    G.stepLouis(s, { x: Math.cos(i * 0.01), y: Math.sin(i * 0.013), mag: 1 }, 1 / 30);
    assert.ok(G.isFree(L.x, L.y, L.r - 0.5), `застрял в препятствии в (${L.x}, ${L.y})`);
  }
});

/* ------------------------------ создание прогулки ------------------------------ */

test('все объекты прогулки появляются в свободных местах', () => {
  for (let seed = 1; seed <= 60; seed++) {
    for (let li = 0; li < G.LEVELS.length; li++) {
      const s = G.createWalk(li, makeRng(seed));
      assert.ok(G.inSafeZone(s.louis.x, s.louis.y), 'Луи стартует у подъезда');
      assert.equal(s.bigDogs.length, G.LEVELS[li].bigDogs.length);
      assert.equal(s.smallDogs.length, G.LEVELS[li].smallDogs.length);
      assert.equal(s.items.length, G.LEVELS[li].treats + G.LEVELS[li].toys);
      for (const d of s.bigDogs) {
        assert.ok(G.isFree(d.x, d.y, d.r), 'большая собака в препятствии');
        assert.ok(G.dist(d.x, d.y, s.louis.x, s.louis.y) >= 560, 'большая собака слишком близко к старту');
      }
      for (const d of s.smallDogs) assert.ok(G.isFree(d.x, d.y, d.r));
      for (const it of s.items) {
        assert.ok(G.isFree(it.x, it.y, 10), 'вещь в препятствии');
        assert.ok(!G.inSafeZone(it.x, it.y), 'вещь у подъезда');
        assert.ok(it.x > 0 && it.x < W.width && it.y > 205 && it.y < W.height, 'вещь внутри двора');
      }
    }
  }
});

test('выбор вещи учитывает группу и веса', () => {
  const rng = makeRng(5);
  const counts = {};
  for (let i = 0; i < 6000; i++) {
    const k = G.pickItemKind('treat', rng);
    assert.equal(CFG.ITEMS[k].group, 'treat');
    counts[k] = (counts[k] || 0) + 1;
  }
  assert.ok(counts.bone > counts.sausage, 'косточки чаще сосисок');
  assert.equal(CFG.ITEMS[G.pickItemKind('toy', rng)].group, 'toy');
});

/* ------------------------------ вещи и нюх ------------------------------ */

test('подбор вещи даёт очки, настроение и новую вещь через время', () => {
  const s = G.createWalk(0, makeRng(3));
  const L = s.louis;
  const it = s.items[0];
  const def = CFG.ITEMS[it.kind];
  L.x = it.x; L.y = it.y; L.mood = 50;
  const ev = G.stepWalk(s, idle, 0.01, makeRng(4));
  const pick = ev.find((e) => e.type === 'pickup');
  assert.ok(pick, 'есть событие подбора');
  assert.equal(s.stats.score, def.score);
  assert.ok(L.mood > 50 + def.mood - 1);
  const before = s.items.length;
  for (let i = 0; i < Math.ceil(CFG.ITEM_RESPAWN / 0.1) + 1; i++) G.stepWalk(s, idle, 0.1, makeRng(i + 10));
  assert.ok(s.items.length >= before + 1, 'вещь появилась снова');
});

test('вещи видны вблизи, а нюх открывает дальние и перезаряжается', () => {
  const s = G.createWalk(0, makeRng(8));
  const L = s.louis;
  s.items = [G.spawnItem('treat', makeRng(9), null, 0)];
  const it = s.items[0];
  const place = (d) => { L.x = it.x; L.y = it.y - d; if (!G.isFree(L.x, L.y, L.r)) { L.x = it.x - d; L.y = it.y; } };
  place(CFG.REVEAL_RADIUS + 60);
  if (G.dist(L.x, L.y, it.x, it.y) < CFG.REVEAL_RADIUS) return; // редкий случай у края двора
  G.stepWalk(s, idle, 0.01);
  assert.equal(it.revealed, false, 'издалека вещь не видна');
  assert.ok(G.trySniff(s));
  assert.ok(!G.trySniff(s), 'повторно нюх сразу не включается');
  G.stepWalk(s, idle, 0.01);
  assert.equal(it.revealed, true, 'нюх открыл вещь');
  const near = G.nearestItems(s, 3);
  assert.equal(near[0].item, it);
  for (let i = 0; i < (CFG.SNIFF_DURATION + CFG.SNIFF_COOLDOWN) * 10 + 2; i++) G.stepLouis(s, idle, 0.1);
  assert.ok(G.trySniff(s), 'нюх перезарядился');
});

/* ------------------------------ выносливость ------------------------------ */

test('бег расходует силы, без сил Луи идёт шагом', () => {
  const s = G.createWalk(0, makeRng(2));
  const L = s.louis;
  L.x = 500; L.y = 1240; // горизонтальная дорожка, впереди простор
  G.stepLouis(s, { x: 1, y: 0, mag: 1 }, 0.1);
  assert.ok(L.sprinting);
  assert.ok(L.speed > CFG.WALK_SPEED + 10, 'бежит быстрее шага');
  for (let i = 0; i < 60; i++) { L.x = 500; G.stepLouis(s, { x: 1, y: 0, mag: 1 }, 0.1); }
  assert.ok(L.stamina < CFG.STAMINA_MIN_TO_SPRINT, 'силы кончились');
  assert.equal(L.sprinting, false);
  L.x = 500;
  G.stepLouis(s, { x: 1, y: 0, mag: 1 }, 0.1);
  assert.ok(L.speed <= CFG.WALK_SPEED + CFG.FEAR_SPEED_BONUS + 1, 'устал и идёт шагом');
  for (let i = 0; i < 10; i++) G.stepLouis(s, idle, 0.1);
  assert.ok(L.stamina > 0.2, 'силы восстанавливаются');
});

/* ------------------------------ большие собаки ------------------------------ */

function bigDogScene(seed) {
  const s = G.createWalk(1, makeRng(seed));
  const dog = s.bigDogs[0];
  s.bigDogs = [dog];
  s.smallDogs = [];
  s.items = [];
  dog.x = 500; dog.y = 1240; dog.home = { x: 500, y: 1240 }; dog.cooldown = 0; dog.state = 'wander'; dog.wait = 0;
  s.louis.x = 500 + CFG.BIG_NOTICE_RADIUS - 40; s.louis.y = 1240;
  return { s, dog, L: s.louis };
}

test('большая собака замечает, лает и гонится, потом догоняет', () => {
  const { s, dog } = bigDogScene(11);
  const rng = makeRng(12);
  assert.equal(G.stepBigDog(dog, s, 0.01, rng), 'notice');
  assert.equal(dog.state, 'alert');
  let ev = null;
  for (let i = 0; i < 100 && ev !== 'chase'; i++) ev = G.stepBigDog(dog, s, 0.05, rng);
  assert.equal(ev, 'chase');
  for (let i = 0; i < 200 && ev !== 'catch'; i++) ev = G.stepBigDog(dog, s, 0.05, rng);
  assert.equal(ev, 'catch', 'стоящего Луи догоняют');
  assert.equal(dog.state, 'wander');
  assert.ok(dog.cooldown > 0, 'после испуга собака отстаёт');
});

test('после испуга Луи паникует, теряет настроение и бежит к подъезду', () => {
  const { s, L } = bigDogScene(13);
  L.mood = 80;
  let caught = false;
  for (let i = 0; i < 400 && !caught; i++) caught = G.stepWalk(s, idle, 0.05, makeRng(i)).some((e) => e.type === 'catch');
  assert.ok(caught);
  assert.ok(L.mood <= 80 - CFG.MOOD_SCARE + 1);
  assert.ok(L.panic > 0);
  const d0 = G.dist(L.x, L.y, W.door.x, W.door.y);
  for (let i = 0; i < 10; i++) G.stepWalk(s, { x: 0, y: 1, mag: 1 }, 0.05);
  assert.ok(G.dist(L.x, L.y, W.door.x, W.door.y) < d0 - 50, 'игнорирует управление и бежит к двери');
  assert.equal(s.stats.scares, 1);
});

test('у подъезда Луи в безопасности: собаки туда не заходят и бросают погоню', () => {
  const s = G.createWalk(2, makeRng(21));
  const L = s.louis;
  L.x = W.door.x; L.y = W.door.y + 40;
  const rng = makeRng(22);
  for (const d of s.bigDogs) { d.state = 'chase'; d.timer = 100; d.cooldown = 0; d.x = W.door.x + 60; d.y = W.door.y + 160; }
  const events = [];
  for (let i = 0; i < 50; i++) for (const d of s.bigDogs) events.push(G.stepBigDog(d, s, 0.05, rng));
  assert.ok(events.includes('giveup'));
  assert.ok(!events.includes('catch'));
  for (let i = 0; i < 400; i++) {
    for (const d of s.bigDogs) {
      d.state = 'chase'; d.timer = 100;
      G.stepBigDog(d, s, 0.05, rng);
      assert.ok(G.dist(d.x, d.y, W.door.x, W.door.y) >= CFG.SAFE_RADIUS + d.r - 0.5, 'собака в зоне подъезда');
    }
  }
  assert.equal(G.computeFear(s), 0, 'у подъезда не страшно');
});

test('если сразу бежать к подъезду, большая собака не догоняет', () => {
  const { s, dog, L } = bigDogScene(31);
  L.x = 500; L.y = 560;          // на дорожке к подъезду
  dog.x = 500; dog.y = 760;      // в 200 позади
  dog.state = 'chase'; dog.timer = CFG.BIG_CHASE_TIME;
  const events = [];
  for (let i = 0; i < 120; i++) {
    const ev = G.stepWalk(s, toward(L, { x: W.door.x, y: W.door.y + 20 }, 1), 0.05, makeRng(i));
    events.push(...ev.map((e) => e.type));
    if (G.inSafeZone(L.x, L.y) && events.includes('giveup')) break;
  }
  assert.ok(!events.includes('catch'), 'не догнала');
  assert.ok(G.inSafeZone(L.x, L.y), 'добежал до подъезда');
  assert.ok(events.includes('giveup'), 'собака бросила погоню');
});

test('страх зависит от расстояния и состояния большой собаки', () => {
  const { s, dog, L } = bigDogScene(41);
  L.x = 500 + 60;
  dog.state = 'wander';
  const calm = G.computeFear(s);
  dog.state = 'chase';
  const scared = G.computeFear(s);
  assert.ok(scared > calm && calm > 0);
  L.x = 500 + CFG.FEAR_RADIUS + 200;
  assert.equal(G.computeFear(s), 0);
});

/* ------------------------------ маленькие собаки ------------------------------ */

test('с маленькой собачкой Луи нюхается и дружит один раз', () => {
  const s = G.createWalk(0, makeRng(51));
  const L = s.louis;
  const dog = s.smallDogs[0];
  s.bigDogs = [];
  L.x = 500; L.y = 1240;
  dog.x = 560; dog.y = 1240;
  L.mood = 40;
  const events = [];
  for (let i = 0; i < 100; i++) events.push(...G.stepWalk(s, idle, 0.05, makeRng(i)));
  const friends = events.filter((e) => e.type === 'friend');
  assert.equal(friends.length, 1);
  assert.equal(friends[0].name, dog.name);
  assert.ok(dog.friend);
  assert.deepEqual(s.stats.friends, [dog.name]);
  assert.equal(s.stats.score, CFG.FRIEND_SCORE);
  assert.ok(L.mood > 40 + CFG.MOOD_FRIEND - 6, 'настроение выросло');
  for (let i = 0; i < 100; i++) events.push(...G.stepWalk(s, idle, 0.05));
  assert.equal(events.filter((e) => e.type === 'friend').length, 1, 'дружба только один раз');
});

test('если уйти, знакомство не засчитывается', () => {
  const s = G.createWalk(0, makeRng(52));
  const L = s.louis;
  const dog = s.smallDogs[0];
  s.bigDogs = [];
  L.x = 300; L.y = 1240; dog.x = 340; dog.y = 1240;
  for (let i = 0; i < 10; i++) G.stepWalk(s, idle, 0.05);
  assert.ok(dog.progress > 0);
  for (let i = 0; i < 40; i++) G.stepWalk(s, { x: 1, y: 0, mag: 1 }, 0.05);
  assert.ok(!dog.friend);
});

/* ------------------------------ настроение и конец ------------------------------ */

test('настроение падает со временем, но не у подъезда', () => {
  const s = G.createWalk(0, makeRng(61));
  s.bigDogs = []; s.smallDogs = []; s.items = [];
  const L = s.louis;
  const m0 = L.mood;
  for (let i = 0; i < 100; i++) G.stepWalk(s, idle, 0.1);
  assert.equal(L.mood, m0, 'у подъезда Луи не скучает');
  L.x = 500; L.y = 1240;
  for (let i = 0; i < 100; i++) G.stepWalk(s, idle, 0.1);
  assert.ok(Math.abs(L.mood - (m0 - CFG.MOOD_DECAY * 10)) < 0.01);
});

test('настроение кончилось - Луи грустит и прогулка заканчивается', () => {
  const s = G.createWalk(0, makeRng(62));
  s.bigDogs = []; s.smallDogs = []; s.items = [];
  s.louis.x = 500; s.louis.y = 1240; s.louis.mood = 1;
  let end = null;
  for (let i = 0; i < 100 && !end; i++) end = G.stepWalk(s, idle, 0.1).find((e) => e.type === 'end');
  assert.equal(end.reason, 'sad');
  assert.equal(s.result.homeBonus, 0);
  assert.equal(s.result.moodBonus, 0);
  assert.deepEqual(G.stepWalk(s, idle, 0.1), [], 'после конца ничего не происходит');
});

test('после окончания времени нужно дойти до подъезда за бонусом', () => {
  const s = G.createWalk(0, makeRng(63));
  s.bigDogs = []; s.smallDogs = []; s.items = [];
  const L = s.louis;
  L.x = 500; L.y = 700; L.mood = 100;
  s.time = 0.05;
  const ev = G.stepWalk(s, idle, 0.1);
  assert.ok(ev.some((e) => e.type === 'timeup'));
  assert.ok(s.timeUp && !s.over);
  let end = null;
  for (let i = 0; i < 400 && !end; i++) end = G.stepWalk(s, toward(L, { x: W.door.x, y: W.door.y + 20 }), 0.05).find((e) => e.type === 'end');
  assert.equal(end.reason, 'home');
  assert.equal(s.result.homeBonus, CFG.HOME_BONUS);
  assert.equal(s.result.score, s.stats.score + CFG.HOME_BONUS + Math.round(L.mood * CFG.END_MOOD_SCORE));
});

test('звёзды по порогам уровня', () => {
  const lv = G.LEVELS[0];
  assert.equal(G.starsFor(0, lv), 0);
  assert.equal(G.starsFor(lv.stars[0], lv), 1);
  assert.equal(G.starsFor(lv.stars[1] + 1, lv), 2);
  assert.equal(G.starsFor(lv.stars[2] * 10, lv), 3);
  for (const l of G.LEVELS) assert.ok(l.stars[0] < l.stars[1] && l.stars[1] < l.stars[2]);
});

test('целые прогулки проходят без ошибок и с разумным счётом', () => {
  for (let li = 0; li < G.LEVELS.length; li++) {
    for (let seed = 1; seed <= 8; seed++) {
      const rng = makeRng(seed * 7 + li);
      const s = G.createWalk(li, rng);
      let t = 0;
      while (!s.over && t < 400) {
        const L = s.louis;
        let input;
        const threat = s.bigDogs.find((d) => d.state !== 'wander' && G.dist(d.x, d.y, L.x, L.y) < 400);
        if (s.timeUp || threat) input = toward(L, { x: W.door.x, y: W.door.y + 30 }, 1);
        else {
          const goal = s.items.filter((i) => i.revealed)[0] || s.items[0];
          input = goal ? toward(L, goal) : idle;
        }
        if (rng() < 0.02) G.trySniff(s);
        G.stepWalk(s, input, 1 / 30, rng);
        t += 1 / 30;
      }
      assert.ok(s.over, 'прогулка закончилась');
      assert.ok(Number.isFinite(s.result.score) && s.result.score >= 0);
      assert.ok(s.result.stars >= 0 && s.result.stars <= 3);
    }
  }
});

/* ------------------------------ прогресс ------------------------------ */

test('прогресс: пустое, битое и недоступное хранилище', () => {
  assert.deepEqual(G.loadProgress(fakeStorage({})), G.emptyProgress());
  assert.deepEqual(G.loadProgress(fakeStorage({ [G.STORAGE_KEY]: '{oops' })), G.emptyProgress());
  const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  assert.deepEqual(G.loadProgress(broken), G.emptyProgress());
  assert.equal(G.saveProgress(broken, G.emptyProgress()), false);
  const weird = fakeStorage({ [G.STORAGE_KEY]: JSON.stringify({ levels: { morning: { best: 'x', stars: 9 }, day: { best: 120.7, stars: 7 } }, friends: ['Тоша', 5], totals: { walks: -3, treats: 4 } }) });
  const p = G.loadProgress(weird);
  assert.equal(p.levels.morning, undefined);
  assert.deepEqual(p.levels.day, { best: 120, stars: 3 });
  assert.deepEqual(p.friends, ['Тоша']);
  assert.deepEqual(p.totals, { treats: 4, toys: 0, walks: 0 });
});

test('прогресс: рекорд, звёзды, альбом друзей и открытие прогулок', () => {
  const st = fakeStorage({});
  let p = G.loadProgress(st);
  assert.ok(G.isUnlocked(p, 0));
  assert.ok(!G.isUnlocked(p, 1));
  const res = { score: 300, stars: 1, treats: 5, toys: 2, friends: ['Бусинка', 'Тоша'] };
  let r = G.recordWalk(p, 'morning', res);
  assert.ok(r.isBest);
  assert.deepEqual(r.newFriends, ['Бусинка', 'Тоша']);
  p = r.progress;
  assert.ok(G.isUnlocked(p, 1));
  assert.ok(!G.isUnlocked(p, 2));
  r = G.recordWalk(p, 'morning', { score: 200, stars: 0, treats: 1, toys: 0, friends: ['Тоша'] });
  assert.ok(!r.isBest);
  assert.deepEqual(r.newFriends, []);
  assert.deepEqual(r.progress.levels.morning, { best: 300, stars: 1 }, 'худший результат не портит рекорд');
  assert.deepEqual(r.progress.totals, { treats: 6, toys: 2, walks: 2 });
  assert.ok(G.saveProgress(st, r.progress));
  assert.deepEqual(G.loadProgress(st), r.progress);
  assert.equal(G.allFriendNames().length, 8);
});
