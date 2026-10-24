'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { createServer } = require('../server.js');

let server;
let base;

test.before(async () => {
  server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => new Promise((resolve) => server.close(resolve)));

/** Сырой запрос, чтобы путь не нормализовался клиентом. */
function rawRequest(pathname, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = http.request(base + pathname, { method }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.end();
  });
}

const APPS = [
  { dir: '/', marker: 'Мини-игры' },
  { dir: '/neon-runner/', marker: '<canvas id="game"' },
  { dir: '/louis/', marker: '<canvas id="game"' }
];

test('меню и обе игры отдаются как HTML без кэша', async () => {
  for (const a of APPS) {
    const r = await rawRequest(a.dir);
    assert.equal(r.status, 200, a.dir);
    assert.equal(r.headers['content-type'], 'text/html; charset=utf-8');
    assert.equal(r.headers['cache-control'], 'no-cache');
    assert.ok(r.body.toString().includes(a.marker), a.dir);
  }
});

test('папка без слеша перенаправляется на адрес со слешем', async () => {
  for (const [from, to] of [['/louis', '/louis/'], ['/neon-runner?x=1', '/neon-runner/?x=1'], ['/louis/icons', '/louis/icons/']]) {
    const r = await rawRequest(from);
    assert.equal(r.status, 301, from);
    assert.equal(r.headers.location, to, from);
  }
  // Протокольно-относительный путь не должен уводить на другой хост
  for (const p of ['//louis', '//evil.example/louis', '/%2F%2Fevil.example']) {
    const r = await rawRequest(p);
    if (r.headers.location) assert.ok(!r.headers.location.startsWith('//'), `${p} -> ${r.headers.location}`);
  }
});

test('манифесты отдаются с типом манифеста и режимом standalone', async () => {
  for (const a of APPS) {
    const r = await rawRequest(a.dir + 'manifest.json');
    assert.equal(r.status, 200, a.dir);
    assert.equal(r.headers['content-type'], 'application/manifest+json; charset=utf-8');
    const m = JSON.parse(r.body.toString());
    assert.equal(m.display, 'standalone');
    assert.equal(m.start_url, './');
    for (const icon of m.icons) {
      const ir = await rawRequest(a.dir + icon.src);
      assert.equal(ir.status, 200, a.dir + icon.src);
      assert.equal(ir.headers['content-type'], 'image/png');
    }
  }
});

test('service workers отдаются как JS без кэша', async () => {
  for (const a of APPS) {
    const r = await rawRequest(a.dir + 'sw.js');
    assert.equal(r.status, 200, a.dir);
    assert.equal(r.headers['content-type'], 'text/javascript; charset=utf-8');
    assert.equal(r.headers['cache-control'], 'no-cache');
  }
});

test('все файлы из списков precache существуют', async () => {
  for (const a of APPS) {
    const file = path.join(__dirname, '..', 'public', a.dir, 'sw.js');
    const sw = fs.readFileSync(file, 'utf8');
    const assets = [...sw.matchAll(/'\.\/([^']*)'/g)].map((m) => m[1]).filter((x) => x && !x.endsWith('/'));
    assert.ok(assets.length >= 5, a.dir);
    for (const asset of assets) {
      const r = await rawRequest(a.dir + asset);
      assert.equal(r.status, 200, a.dir + asset);
      assert.equal(Number(r.headers['content-length']), r.body.length);
    }
  }
});

test('кэши игр не удаляют друг друга', () => {
  const prefixes = [];
  for (const a of APPS) {
    const sw = fs.readFileSync(path.join(__dirname, '..', 'public', a.dir, 'sw.js'), 'utf8');
    const m = sw.match(/const CACHE_PREFIX = '([^']+)'/);
    assert.ok(m, `${a.dir}sw.js должен иметь CACHE_PREFIX`);
    assert.ok(/k\.startsWith\(CACHE_PREFIX\)/.test(sw), `${a.dir}sw.js чистит только свои кэши`);
    prefixes.push(m[1]);
  }
  for (const p of prefixes) assert.equal(prefixes.filter((q) => q.startsWith(p) || p.startsWith(q)).length, 1, 'префиксы не пересекаются');
});

test('скрипты, стили и иконки с правильными MIME', async () => {
  const cases = [
    ['/hub.css', 'text/css; charset=utf-8'],
    ['/neon-runner/game.js', 'text/javascript; charset=utf-8'],
    ['/neon-runner/style.css', 'text/css; charset=utf-8'],
    ['/louis/game.js', 'text/javascript; charset=utf-8'],
    ['/louis/logic.js', 'text/javascript; charset=utf-8'],
    ['/louis/style.css', 'text/css; charset=utf-8'],
    ['/icons/hub-192.png', 'image/png'],
    ['/louis/icons/icon-512.png', 'image/png']
  ];
  for (const [p, type] of cases) {
    const r = await rawRequest(p);
    assert.equal(r.status, 200, p);
    assert.equal(r.headers['content-type'], type, p);
  }
});

test('health-check', async () => {
  const r = await rawRequest('/health');
  assert.equal(r.status, 200);
  assert.equal(JSON.parse(r.body.toString()).status, 'ok');
});

test('HEAD без тела', async () => {
  const r = await rawRequest('/louis/', 'HEAD');
  assert.equal(r.status, 200);
  assert.equal(r.body.length, 0);
  assert.ok(Number(r.headers['content-length']) > 0);
});

test('404 для несуществующего файла', async () => {
  assert.equal((await rawRequest('/nope.txt')).status, 404);
  assert.equal((await rawRequest('/louis/nope.js')).status, 404);
});

test('выход за пределы public запрещён', async () => {
  for (const p of ['/../package.json', '/..%2Fpackage.json', '/%2e%2e/server.js', '/icons/../../server.js', '/louis/../../server.js']) {
    const r = await rawRequest(p);
    assert.ok(r.status === 403 || r.status === 404, `${p} -> ${r.status}`);
    assert.ok(!r.body.toString().includes('createServer'), p);
  }
});

test('POST не поддерживается', async () => {
  assert.equal((await rawRequest('/', 'POST')).status, 405);
});
