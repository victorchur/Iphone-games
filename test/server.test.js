'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
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

test('главная страница отдаётся как HTML', async () => {
  const r = await rawRequest('/');
  assert.equal(r.status, 200);
  assert.equal(r.headers['content-type'], 'text/html; charset=utf-8');
  assert.equal(r.headers['cache-control'], 'no-cache');
  assert.ok(r.body.toString().includes('<canvas id="game"'));
});

test('manifest.json отдаётся с типом манифеста', async () => {
  const r = await rawRequest('/manifest.json');
  assert.equal(r.status, 200);
  assert.equal(r.headers['content-type'], 'application/manifest+json; charset=utf-8');
  const m = JSON.parse(r.body.toString());
  assert.equal(m.display, 'standalone');
  assert.ok(m.icons.length >= 2);
});

test('service worker отдаётся как JS без кэширования', async () => {
  const r = await rawRequest('/sw.js');
  assert.equal(r.status, 200);
  assert.equal(r.headers['content-type'], 'text/javascript; charset=utf-8');
  assert.equal(r.headers['cache-control'], 'no-cache');
});

test('скрипты, стили и иконки с правильными MIME', async () => {
  const cases = [
    ['/game.js', 'text/javascript; charset=utf-8'],
    ['/logic.js', 'text/javascript; charset=utf-8'],
    ['/style.css', 'text/css; charset=utf-8'],
    ['/icons/icon-192.png', 'image/png'],
    ['/icons/icon-512.png', 'image/png']
  ];
  for (const [p, type] of cases) {
    const r = await rawRequest(p);
    assert.equal(r.status, 200, p);
    assert.equal(r.headers['content-type'], type, p);
    assert.equal(Number(r.headers['content-length']), r.body.length, p);
  }
});

test('все файлы из списка precache service worker существуют', async () => {
  const fs = require('fs');
  const path = require('path');
  const sw = fs.readFileSync(path.join(__dirname, '..', 'public', 'sw.js'), 'utf8');
  const assets = [...sw.matchAll(/'\.\/([^']*)'/g)].map((m) => m[1]).filter((a) => a && !a.endsWith('/'));
  assert.ok(assets.length >= 5);
  for (const a of assets) {
    const r = await rawRequest('/' + a);
    assert.equal(r.status, 200, a);
  }
});

test('health-check', async () => {
  const r = await rawRequest('/health');
  assert.equal(r.status, 200);
  assert.deepEqual(JSON.parse(r.body.toString()).status, 'ok');
});

test('HEAD без тела', async () => {
  const r = await rawRequest('/', 'HEAD');
  assert.equal(r.status, 200);
  assert.equal(r.body.length, 0);
  assert.ok(Number(r.headers['content-length']) > 0);
});

test('404 для несуществующего файла', async () => {
  const r = await rawRequest('/nope.txt');
  assert.equal(r.status, 404);
});

test('выход за пределы public запрещён', async () => {
  for (const p of ['/../package.json', '/..%2Fpackage.json', '/%2e%2e/server.js', '/icons/../../server.js']) {
    const r = await rawRequest(p);
    assert.ok(r.status === 403 || r.status === 404, `${p} -> ${r.status}`);
    assert.ok(!r.body.toString().includes('createServer'), p);
  }
});

test('POST не поддерживается', async () => {
  const r = await rawRequest('/', 'POST');
  assert.equal(r.status, 405);
});
