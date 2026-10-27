// Browsertests (Chromium via Playwright): installatie, offline starten, hervatten, opslagherstel en schermformaten.
// Gebruik: npm run build && npm run test:browser   (vereist: npx playwright install chromium)
import { chromium, devices } from 'playwright';

// Optioneel: DEVICE="Pixel 8" emuleert een Android-toestel (user agent, aanraking, mobiel scherm).
const DEVICE = process.env.DEVICE && devices[process.env.DEVICE];
if (process.env.DEVICE && !DEVICE) throw new Error('Onbekend toestel: ' + process.env.DEVICE);
const { defaultBrowserType, ...deviceOpts } = DEVICE || {};
const ctxOpts = (extra = {}) => (DEVICE ? { ...deviceOpts, ...extra } : { viewport: { width: 390, height: 844 }, hasTouch: true, ...extra });
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = 8123;
const URL_ = `http://localhost:${PORT}/`;
const SHOTS = process.env.SCREENSHOTS || join(ROOT, 'e2e', 'screenshots');
await mkdir(SHOTS, { recursive: true });

const results = [];
let currentName = '';
async function check(name, fn) {
  currentName = name;
  try { await fn(); results.push([true, name]); console.log('  ✓', name); }
  catch (e) { results.push([false, name, e]); console.log('  ✗', name, '\n     ', e.message.split('\n')[0]); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'mislukt'); }

function startServer(env = {}) {
  const p = spawn(process.execPath, [join(ROOT, 'tools', 'serve.mjs'), String(PORT)], { stdio: ['ignore', 'pipe', 'inherit'], env: { ...process.env, ...env } });
  return new Promise((res) => p.stdout.once('data', () => res(p)));
}

const errors = [];
function watch(page) {
  page.on('pageerror', (e) => errors.push(`[${currentName}] ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`[${currentName}] console: ${m.text()}`);
    if (m.text().startsWith('Opslagprobleem')) console.log(`     (${currentName}) ${m.text()}`);
  });
}

async function openApp(ctx, path = '') {
  const page = ctx.pages()[0] || await ctx.newPage();
  watch(page);
  await page.goto(URL_ + path);
  await page.waitForSelector('.spellenlijst, .spelscherm');
  return page;
}

const state = (page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__spellenkast.current.instance._debug.state)));

// ============================================================
const profile = await mkdtemp(join(tmpdir(), 'spellenkast-'));
let server = await startServer();
let ctx = await chromium.launchPersistentContext(profile, ctxOpts());

if (DEVICE) console.log(`Toestel: ${process.env.DEVICE} — ${deviceOpts.userAgent}`);
console.log('\nInstallatie en eerste gebruik (online)');
let page = await openApp(ctx);
let saved2048;

await check('service worker wordt actief en cachet alle bestanden', async () => {
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => document.getElementById('offline-status')?.classList.contains('ok'), null, { timeout: 10000 });
  const n = await page.evaluate(async () => {
    const keys = await caches.keys();
    const c = await caches.open(keys.find((k) => k.startsWith('spellenkast-')));
    return (await c.keys()).length;
  });
  assert(n > 10, `slechts ${n} bestanden in de cache`);
});

await check('startpagina toont alle spellen met uitleg en knoppen', async () => {
  const cards = await page.$$eval('.spelkaart', (els) => els.map((e) => ({ id: e.dataset.spel, text: e.innerText })));
  assert(cards.length >= 1, 'geen spelkaarten');
  for (const c of cards) assert(/Spelen|Hervatten/.test(c.text), `kaart ${c.id} zonder startknop`);
});

await check('2048: spelen met toetsenbord, score en opslag', async () => {
  await page.click('[data-spel="2048"] .knop.primair');
  await page.waitForSelector('.bord-2048');
  for (const k of ['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp']) await page.keyboard.press(k);
  const s = await state(page);
  assert(s.moves > 0, 'geen zetten geregistreerd');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('spellenkast:spel:2048:stand')));
  assert(stored.v === 1 && JSON.stringify(stored.d.grid) === JSON.stringify(s.grid), 'opgeslagen stand wijkt af');
  saved2048 = s;
});

await check('2048: vegen met aanraking/muis', async () => {
  const before = (await state(page)).moves;
  const box = await page.locator('.bord-houder').boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  for (const [dx, dy] of [[-120, 0], [0, -120], [120, 0], [0, 120], [-120, 0]]) {
    await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.move(cx + dx, cy + dy, { steps: 4 }); await page.mouse.up();
  }
  const after = await state(page);
  assert(after.moves > before, 'vegen deed niets');
  saved2048 = after;
});

await check('pagina scrollt niet door spelbewegingen', async () => {
  const y = await page.evaluate(() => [window.scrollY, document.scrollingElement.scrollHeight <= window.innerHeight + 1]);
  assert(y[0] === 0, 'pagina is gescrold');
});

await ctx.close();
server.kill();
console.log('\nVolledig afsluiten, server uit, offline heropenen');
ctx = await chromium.launchPersistentContext(profile, ctxOpts({ offline: true }));
page = await openApp(ctx);

await check('app start zonder netwerk en zonder server', async () => {
  assert(await page.locator('.spellenlijst').isVisible(), 'startpagina niet zichtbaar');
});

await check('2048: "Hervatten" verschijnt en hervat exact dezelfde stand', async () => {
  const btn = page.locator('[data-spel="2048"] .knop.primair');
  assert((await btn.innerText()).includes('Hervatten'), 'geen hervatknop');
  await btn.click();
  await page.waitForSelector('.bord-2048');
  const s = await state(page);
  assert(JSON.stringify(s.grid) === JSON.stringify(saved2048.grid) && s.score === saved2048.score, 'stand niet gelijk');
});

await check('herladen (offline) op een spel-URL werkt', async () => {
  await page.reload();
  await page.waitForSelector('.bord-2048');
});

await check('nieuw spel vraagt eerst bevestiging', async () => {
  await page.click('#acties button[aria-label="Nieuw spel"]');
  await page.waitForSelector('dialog[open]');
  await page.click('dialog .knop:has-text("Annuleren")');
  const s = await state(page);
  assert(s.moves === saved2048.moves, 'spel gewist ondanks annuleren');
  await page.click('#acties button[aria-label="Nieuw spel"]');
  await page.click('dialog .knop:has-text("Nieuw spel")');
  await page.waitForFunction(() => window.__spellenkast.current.instance._debug.state.moves === 0, null, { timeout: 3000 });
});

await check('beschadigde opslag laat de app niet vastlopen', async () => {
  await page.goto(URL_ + '#/');
  await page.waitForSelector('.spellenlijst');
  await page.evaluate(() => {
    localStorage.setItem('spellenkast:spel:2048:stand', '{"v":1,"d":{"grid":"kapot"');
    localStorage.setItem('spellenkast:spel:2048:stats', 'onzin');
    localStorage.setItem('spellenkast:instellingen', '{"v":1,"d":null}');
  });
  await page.reload();
  await page.waitForSelector('.spellenlijst');
  const txt = await page.locator('[data-spel="2048"]').innerText();
  assert(txt.includes('Spelen') && txt.includes('Nog niet gespeeld'), 'kapotte stand niet opgevangen');
  await page.click('[data-spel="2048"] .knop.primair');
  await page.waitForSelector('.bord-2048');
  const s = await state(page);
  assert(s.moves === 0, 'geen schone start');
  const kapot = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.endsWith(':kapot')).length);
  assert(kapot === 3, `${kapot} records in quarantaine`);
  await page.waitForSelector('.melding.zichtbaar');
});

await check('startpagina: kleine iPhone (320×568) zonder horizontaal scrollen', async () => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto(URL_ + '#/');
  await page.waitForSelector('.spellenlijst');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  assert(!overflow, 'horizontale overloop');
  await page.screenshot({ path: join(SHOTS, 'start-320.png'), fullPage: true });
});

for (const [w, h, name] of [[320, 568, 'se'], [390, 844, 'iphone'], [1280, 800, 'pc']]) {
  await check(`2048 past op ${w}×${h}`, async () => {
    await page.setViewportSize({ width: w, height: h });
    await page.goto(URL_ + '#/2048');
    await page.waitForSelector('.bord-2048');
    const r = await page.evaluate(() => {
      const b = document.querySelector('.bord-houder').getBoundingClientRect();
      return { bottom: b.bottom, right: b.right, vh: innerHeight, vw: innerWidth, sw: document.documentElement.scrollWidth };
    });
    assert(r.bottom <= r.vh && r.right <= r.vw && r.sw <= r.vw, `valt buiten scherm: ${JSON.stringify(r)}`);
    await page.screenshot({ path: join(SHOTS, `2048-${name}.png`) });
  });
}

// Uitbreidingen per spel (worden toegevoegd zodra de spellen bestaan)
const extra = await import('./games.mjs').catch((e) => { if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e; return null; });
if (extra) await extra.default({ ctx, page, check, assert, URL_, SHOTS, state });

await ctx.close();

console.log('\nApp-update: opgeslagen spellen blijven behouden');
server = await startServer({ SPELLENKAST_TEST_VERSIE: 'update' });
ctx = await chromium.launchPersistentContext(profile, ctxOpts());
page = await openApp(ctx);
await check('nieuwe versie wordt gemeld, geactiveerd en saves blijven', async () => {
  const before = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter((k) => k.startsWith('spellenkast:')).map((k) => [k, localStorage.getItem(k)])));
  await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
  await page.waitForSelector('#update:not([hidden])', { timeout: 15000 });
  await Promise.all([page.waitForEvent('load'), page.click('#update button')]);
  await page.waitForSelector('.spellenlijst');
  const keys = await page.evaluate(() => caches.keys());
  assert(keys.length === 1 && keys[0].endsWith('-update'), `caches: ${keys}`);
  const after = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter((k) => k.startsWith('spellenkast:')).map((k) => [k, localStorage.getItem(k)])));
  for (const k of Object.keys(before)) if (!k.endsWith(':kapot')) assert(after[k] === before[k], `${k} veranderd`);
  const resumable = await page.$$eval('.spelkaart', (els) => els.filter((e) => e.innerText.includes('Hervatten')).map((e) => e.dataset.spel));
  assert(resumable.includes('klondike'), `hervatbaar: ${resumable}`);
});
await ctx.close();
server.kill();

console.log('');
if (errors.length) {
  console.log('Fouten in de browserconsole:');
  for (const e of errors) console.log('  -', e);
}
const failed = results.filter((r) => !r[0]);
console.log(`${results.length - failed.length}/${results.length} browsercontroles geslaagd${errors.length ? `, ${errors.length} consolefouten` : ''}`);
process.exit(failed.length || errors.length ? 1 : 0);
