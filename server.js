/*
 * Neon Runner - статический сервер на встроенном модуле http.
 * Без зависимостей. Слушает process.env.PORT (по умолчанию 3000).
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, 'public');
const DEFAULT_PORT = 3000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.map': 'application/json; charset=utf-8'
};

// Файлы, которые браузер должен перепроверять при каждом запросе
const NO_CACHE = new Set(['index.html', 'sw.js', 'manifest.json']);

function contentTypeFor(relPath) {
  const base = path.basename(relPath);
  if (base === 'manifest.json') return 'application/manifest+json; charset=utf-8';
  return MIME[path.extname(relPath).toLowerCase()] || 'application/octet-stream';
}

function cacheControlFor(relPath) {
  return NO_CACHE.has(path.basename(relPath)) ? 'no-cache' : 'public, max-age=86400';
}

function sendText(res, status, text, extra) {
  res.writeHead(status, Object.assign({
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
    'Cache-Control': 'no-store'
  }, extra || {}));
  res.end(text);
}

/** Превращает URL в безопасный относительный путь внутри public или null. */
function resolvePath(urlPath) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(urlPath, 'http://localhost').pathname);
  } catch (e) {
    return null;
  }
  if (pathname.includes('\0')) return null;
  if (pathname.endsWith('/')) pathname += 'index.html';
  const abs = path.resolve(ROOT, '.' + path.posix.normalize(pathname));
  if (abs !== ROOT && !abs.startsWith(ROOT + path.sep)) return null;
  return abs;
}

function createServer(options) {
  const log = options && options.log ? console.log : () => {};

  return http.createServer((req, res) => {
    const finish = (status) => log(`${req.method} ${req.url} -> ${status}`);

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      sendText(res, 405, 'Method Not Allowed', { Allow: 'GET, HEAD' });
      return finish(405);
    }

    const pathname = req.url.split('?')[0];
    if (pathname === '/health') {
      const body = JSON.stringify({ status: 'ok', uptime: Math.round(process.uptime()) });
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(body),
        'Cache-Control': 'no-store'
      });
      res.end(req.method === 'HEAD' ? undefined : body);
      return finish(200);
    }

    const filePath = resolvePath(req.url);
    if (!filePath) {
      sendText(res, 403, 'Forbidden');
      return finish(403);
    }

    fs.stat(filePath, (err, stat) => {
      if (err || !stat.isFile()) {
        sendText(res, 404, 'Not Found');
        return finish(404);
      }
      const rel = path.relative(ROOT, filePath);
      res.writeHead(200, {
        'Content-Type': contentTypeFor(rel),
        'Content-Length': stat.size,
        'Cache-Control': cacheControlFor(rel),
        'Last-Modified': stat.mtime.toUTCString(),
        'X-Content-Type-Options': 'nosniff'
      });
      if (req.method === 'HEAD') {
        res.end();
        return finish(200);
      }
      const stream = fs.createReadStream(filePath);
      stream.on('error', () => {
        if (!res.headersSent) sendText(res, 500, 'Internal Server Error');
        else res.destroy();
      });
      stream.pipe(res);
      finish(200);
    });
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT) || DEFAULT_PORT;
  const server = createServer({ log: true });
  server.listen(port, '0.0.0.0', () => {
    console.log(`Neon Runner server listening on http://0.0.0.0:${port}`);
  });
  const shutdown = () => {
    console.log('Shutting down');
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

module.exports = { createServer, resolvePath, contentTypeFor, ROOT };
