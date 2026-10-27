// Werkt de lijst met offline bestanden en het versienummer in app/sw.js bij.
// Gebruik: node tools/build-sw.mjs
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../app/', import.meta.url));
const SKIP = new Set(['sw.js']);

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(p));
    else out.push(p);
  }
  return out;
}

const files = (await walk(root))
  .map((p) => relative(root, p).split(sep).join('/'))
  .filter((p) => !SKIP.has(p))
  .sort();

const hash = createHash('sha256');
for (const f of files) {
  hash.update(f);
  hash.update(await readFile(join(root, f)));
}
const version = hash.digest('hex').slice(0, 12);
const assets = ['./', ...files.map((f) => './' + f)];

const swPath = join(root, 'sw.js');
const sw = await readFile(swPath, 'utf8');
const block = `// <<PRECACHE>>\nconst VERSION = '${version}';\nconst ASSETS = ${JSON.stringify(assets, null, 2)};\n// <</PRECACHE>>`;
const next = sw.replace(/\/\/ <<PRECACHE>>[\s\S]*?\/\/ <<\/PRECACHE>>/, block);
if (next === sw && !sw.includes(version)) throw new Error('PRECACHE-markering niet gevonden in sw.js');
await writeFile(swPath, next);
console.log(`sw.js bijgewerkt: versie ${version}, ${assets.length} bestanden`);
