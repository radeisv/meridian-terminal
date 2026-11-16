// A tiny static server for game/ (Node 22, standard library only), so an entry can be played
// locally without a build step: `node serve.ts` serves game/ on http://localhost:8080, and a
// POST to /capture/<name> saves screenshots/<name> for the screenshot pipeline. It refuses any
// path outside game/, answers only from localhost, and is a development convenience only.
import { createReadStream, statSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('./game', import.meta.url)));
const shotsDir = resolve(root, '..', 'screenshots');
if (!existsSync(shotsDir)) mkdirSync(shotsDir);
const args = process.argv.slice(2);
const portIndex = args.indexOf('--port');
const requested = portIndex === -1 ? 8080 : Number(args[portIndex + 1]);
const port = Number.isInteger(requested) && requested > 0 && requested < 65536 ? requested : 8080;

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.glb': 'model/gltf-binary',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
};

function serveGame(pathname: string, response: import('node:http').ServerResponse) {
  if (pathname.endsWith('/')) pathname += 'index.html';
  const file = resolve(join(root, normalize(pathname)));
  if (!file.startsWith(root + sep) && file !== root) {
    response.writeHead(403).end('forbidden');
    return true;
  }
  let size: number;
  try {
    const stats = statSync(file);
    if (!stats.isFile()) throw new Error('not a file');
    size = stats.size;
  } catch {
    response.writeHead(404).end('not found');
    return true;
  }
  response.writeHead(200, {
    'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
    'content-length': size,
    'cache-control': 'no-store',
  });
  createReadStream(file).pipe(response);
  return true;
}

function safeShotName(name: string): string | null {
  if (!/^[a-zA-Z0-9._-]{1,64}\.(png|jpg|jpeg)$/.test(name)) return null;
  const file = resolve(join(shotsDir, name));
  return file.startsWith(shotsDir + sep) ? file : null;
}

createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  let pathname: string;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    response.writeHead(400).end('bad request');
    return;
  }

  if (request.method === 'POST' && pathname.startsWith('/capture/')) {
    const captureMatch = /^\/capture\/(.+)$/.exec(pathname);
    const file = captureMatch ? safeShotName(captureMatch[1]) : null;
    if (!file) { response.writeHead(400).end('bad name'); return; }
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      const match = /^data:image\/(png|jpeg);base64,(.+)$/.exec(text);
      if (!match) { response.writeHead(400).end('expected a data URL'); return; }
      writeFileSync(file, Buffer.from(match[2], 'base64'));
      response.writeHead(200).end('saved');
      console.log(`saved screenshots/${captureMatch![1]}`);
    });
    return;
  }

  if (serveGame(pathname, response)) return;
  response.writeHead(404).end('not found');
}).listen(port, '127.0.0.1', () => {
  console.log(`game/ is on http://localhost:${port}`);
});
