// A tiny web server for playing the game on your own computer.
//   node serve.mjs
// then open http://localhost:5176 in your browser.
// (Opening index.html by double-clicking won't work: browsers block
//  JavaScript modules on file:// addresses.)
import http from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = normalize(fileURLToPath(new URL('.', import.meta.url)));
const port = Number(process.env.PORT) || 5176;
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.md': 'text/plain; charset=utf-8',
};

// Three.js normally loads from a CDN. On your own computer we fetch it
// through this server instead and keep a copy in .cdn-cache, so the game
// still works with a flaky connection, and offline after the first run.
async function cdn(path, res) {
  const rest = path.slice('/__lib/'.length);
  if (rest.includes('..')) { res.writeHead(403); res.end(); return; }
  const cacheFile = join(root, '.cdn-cache', rest.replace(/[^\w.@-]/g, '_'));
  try {
    let data;
    try { data = await readFile(cacheFile); }
    catch {
      const r = await fetch('https://unpkg.com/' + rest);
      if (!r.ok) throw new Error('CDN said ' + r.status);
      data = Buffer.from(await r.arrayBuffer());
      await mkdir(join(root, '.cdn-cache'), { recursive: true });
      await writeFile(cacheFile, data);
    }
    res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(data);
  } catch (e) {
    res.writeHead(502);
    res.end('Could not get ' + rest + ': ' + e.message);
  }
}

http.createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (path.startsWith('/__lib/')) return cdn(path, res);
  if (path.endsWith('/')) path += 'index.html';
  const file = normalize(join(root, path));
  if (!file.startsWith(root.endsWith(sep) ? root : root + sep)) {
    res.writeHead(403);
    res.end();
    return;
  }
  try {
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
}).listen(port, () => console.log(`fin05 is running at http://localhost:${port}`));
