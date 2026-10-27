// Minimale statische webserver zonder afhankelijkheden.
// Gebruik: node tools/serve.mjs [poort]   → http://localhost:8080
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';

const root = fileURLToPath(new URL('../app/', import.meta.url));
const port = Number(process.argv[2] || process.env.PORT || 8080);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path.endsWith('/')) path += 'index.html';
    const file = normalize(join(root, path));
    if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
    const info = await stat(file);
    if (!info.isFile()) throw new Error('geen bestand');
    res.writeHead(200, {
      'Content-Type': TYPES[extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    let body = await readFile(file);
    // Alleen voor de browsertest van app-updates: doe alsof er een nieuwe versie is.
    if (process.env.SPELLENKAST_TEST_VERSIE && path === '/sw.js') {
      body = body.toString().replace(/const VERSION = '([^']*)'/, `const VERSION = '$1-${process.env.SPELLENKAST_TEST_VERSIE}'`);
    }
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Niet gevonden');
  }
}).listen(port, () => {
  console.log(`Spellenkast draait op http://localhost:${port}`);
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list || []) {
      if (a.family === 'IPv4' && !a.internal) console.log(`  in je netwerk: http://${a.address}:${port}  (zonder https: geen offline-installatie op iPhone)`);
    }
  }
});
