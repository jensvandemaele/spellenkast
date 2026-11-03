// Browsercontroles voor Blokval, Woordzoeker, Klondike, Mijnenveger, Legpuzzel en Snoepwissel. Wordt aangeroepen vanuit run.mjs (offline context).
import { join } from 'node:path';

export default async function ({ page, check, assert, URL_, SHOTS, state }) {
  const dbg = (fn, arg) => page.evaluate(fn, arg);
  const open = async (id, fresh = false) => {
    await page.goto(URL_ + `#/${id}${fresh ? '/nieuw' : ''}`);
    await page.waitForSelector('.spelscherm');
  };

  console.log('\nAlle spellen offline');
  await page.setViewportSize({ width: 390, height: 844 });

  for (const id of ['blokval', 'woordzoeker', '2048', 'klondike', 'mijnenveger', 'legpuzzel', 'snoepwissel']) {
    await check(`${id} start offline`, async () => {
      await open(id);
      const ok = await dbg(() => !!window.__spellenkast.current?.instance);
      assert(ok, 'spel niet geladen');
    });
  }

  // ---------------- Blokval ----------------
  console.log('\nBlokval');
  await check('blokval: toetsenbord (schuiven, draaien, laten vallen)', async () => {
    await open('blokval', true);
    const p0 = await state(page);
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowUp');
    const p1 = await state(page);
    assert(p1.piece.col !== p0.piece.col || p1.piece.rot !== p0.piece.rot, 'blok bewoog niet');
    await page.keyboard.press('Space');
    await page.keyboard.press('Space');
    const s = await state(page);
    assert(s.pieces === 2 && s.score > 0, `pieces=${s.pieces} score=${s.score}`);
  });

  await check('blokval: schermknoppen werken met aanraking', async () => {
    const before = (await state(page)).pieces;
    await page.tap('button[aria-label="Draai rechtsom"]');
    await page.tap('button[aria-label="Naar links"]');
    await page.tap('button[aria-label="Meteen laten vallen"]');
    const s = await state(page);
    assert(s.pieces === before + 1, 'laten vallen via knop werkte niet');
  });

  await check('blokval: zwaartekracht laat het blok vallen', async () => {
    const r0 = (await state(page)).piece.row;
    await page.waitForTimeout(1300);
    const r1 = (await state(page)).piece.row;
    assert(r1 > r0, 'blok viel niet');
  });

  await check('blokval: pauze (P) stopt het spel en toont overlay', async () => {
    await page.keyboard.press('p');
    await page.waitForSelector('.blokval-houder .overlay');
    const r0 = (await state(page)).piece.row;
    await page.waitForTimeout(1200);
    assert((await state(page)).piece.row === r0, 'blok viel tijdens pauze');
    await page.click('.overlay .knop:has-text("Doorgaan")');
    assert(!(await page.$('.blokval-houder .overlay')), 'overlay bleef staan');
  });

  await check('blokval: volle rij verdwijnt en geeft punten', async () => {
    await dbg(() => {
      const s = window.__spellenkast.current.instance._debug.state;
      for (const row of s.board) row.fill('');
      for (let c = 0; c < 10; c++) s.board[19][c] = c < 6 ? 'J' : '';
      for (let c = 0; c < 10; c++) s.board[18][c] = c < 6 ? 'J' : '';
      s.piece = { type: 'O', rot: 0, row: 0, col: 6 };
      s.queue[0] = 'O';
    });
    const before = await state(page);
    await page.keyboard.press('Space');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Space');
    const s = await state(page);
    assert(s.lines - before.lines === 2, `rijen: ${s.lines - before.lines}`);
  });

  await check('blokval: game-over en opslag', async () => {
    await dbg(() => {
      const s = window.__spellenkast.current.instance._debug.state;
      for (let r = 2; r < 20; r++) for (let c = 0; c < 10; c++) s.board[r][c] = c === r % 10 ? '' : 'Z';
    });
    await page.keyboard.press('Space');
    await page.waitForSelector('.overlay:has-text("Spel voorbij")', { timeout: 3000 });
    const stats = await dbg(() => JSON.parse(localStorage.getItem('spellenkast:spel:blokval:stats')).d);
    assert(stats.beste > 0, 'beste score niet opgeslagen');
    await page.waitForTimeout(350);
    await page.screenshot({ path: join(SHOTS, 'blokval-gameover.png') });
  });

  await check('blokval: hervatten start gepauzeerd met dezelfde stand', async () => {
    await page.click('.overlay .knop:has-text("Opnieuw")');
    await page.keyboard.press('Space');
    const s = await state(page);
    await page.goto(URL_ + '#/');
    await page.waitForSelector('.spellenlijst');
    await page.click('[data-spel="blokval"] .knop.primair');
    await page.waitForSelector('.blokval-houder .overlay:has-text("Gepauzeerd")');
    const r = await state(page);
    assert(JSON.stringify(r.board) === JSON.stringify(s.board) && r.score === s.score, 'stand anders');
    await page.screenshot({ path: join(SHOTS, 'blokval-iphone.png') });
  });

  // ---------------- Woordzoeker ----------------
  console.log('\nWoordzoeker');
  const cellCenter = async (r, c) => page.evaluate(([r, c]) => {
    const el = document.querySelector(`.wz-cel[data-r="${r}"][data-c="${c}"]`).getBoundingClientRect();
    return [el.left + el.width / 2, el.top + el.height / 2];
  }, [r, c]);
  const ends = (w) => {
    const d = { E: [0, 1], S: [1, 0], SE: [1, 1], NE: [-1, 1], W: [0, -1], N: [-1, 0], NW: [-1, -1], SW: [1, -1] }[w.dir];
    return [w.r, w.c, w.r + d[0] * (w.word.length - 1), w.c + d[1] * (w.word.length - 1)];
  };

  await check('woordzoeker: woord selecteren door te slepen (muis)', async () => {
    await open('woordzoeker', true);
    const s = await state(page);
    const [r0, c0, r1, c1] = ends(s.words[0]);
    const a = await cellCenter(r0, c0), b = await cellCenter(r1, c1);
    await page.mouse.move(...a); await page.mouse.down(); await page.mouse.move(...b, { steps: 8 }); await page.mouse.up();
    const after = await state(page);
    assert(after.found.length === 1 && after.found[0] === 0, `gevonden: ${JSON.stringify(after.found)}`);
    assert(await page.$('.wz-lijst li.gevonden'), 'woord niet doorgestreept');
  });

  await check('woordzoeker: tik-tik-selectie (aanraking), achterstevoren', async () => {
    const s = await state(page);
    const [r0, c0, r1, c1] = ends(s.words[1]);
    const a = await cellCenter(r1, c1), b = await cellCenter(r0, c0);
    await page.touchscreen.tap(...a);
    await page.touchscreen.tap(...b);
    const after = await state(page);
    assert(after.found.includes(1), `gevonden: ${JSON.stringify(after.found)}`);
  });

  await check('woordzoeker: verkeerde selectie telt niet', async () => {
    const n = (await state(page)).found.length;
    const a = await cellCenter(0, 0), b = await cellCenter(0, 1);
    await page.mouse.move(...a); await page.mouse.down(); await page.mouse.move(...b, { steps: 3 }); await page.mouse.up();
    assert((await state(page)).found.length === n, 'onterecht gevonden');
  });

  await check('woordzoeker: toetsenbordselectie', async () => {
    const s = await state(page);
    const i = s.words.findIndex((_, k) => !s.found.includes(k));
    const [r0, c0, r1, c1] = ends(s.words[i]);
    await page.focus('.wz-rooster');
    const go = async (r, c, from) => {
      for (let k = from[0]; k < r; k++) await page.keyboard.press('ArrowDown');
      for (let k = from[0]; k > r; k--) await page.keyboard.press('ArrowUp');
      for (let k = from[1]; k < c; k++) await page.keyboard.press('ArrowRight');
      for (let k = from[1]; k > c; k--) await page.keyboard.press('ArrowLeft');
      await page.keyboard.press('Enter');
    };
    await go(r0, c0, [0, 0]);
    await go(r1, c1, [r0, c0]);
    assert((await state(page)).found.includes(i), 'niet gevonden via toetsenbord');
  });

  await check('woordzoeker: hervatten behoudt gevonden woorden', async () => {
    const s = await state(page);
    await page.reload();
    await page.waitForSelector('.wz-rooster');
    const r = await state(page);
    assert(JSON.stringify(r.found) === JSON.stringify(s.found) && JSON.stringify(r.grid) === JSON.stringify(s.grid), 'stand anders');
  });

  await check('woordzoeker: voltooiing wordt gedetecteerd', async () => {
    const s = await state(page);
    for (let i = 0; i < s.words.length; i++) {
      if (s.found.includes(i)) continue;
      await dbg((e) => window.__spellenkast.current.instance._debug.select(...e), ends(s.words[i]));
    }
    await page.waitForSelector('.overlay:has-text("Puzzel opgelost")');
    const stats = await dbg(() => JSON.parse(localStorage.getItem('spellenkast:spel:woordzoeker:stats')).d);
    assert(stats[s.level].opgelost === 1, 'statistiek niet bijgewerkt');
    await page.waitForTimeout(350);
    await page.screenshot({ path: join(SHOTS, 'woordzoeker-klaar.png') });
  });

  await check('woordzoeker: moeilijkheid wisselen geeft nieuw rooster', async () => {
    await page.click('.overlay .knop:has-text("Nieuwe puzzel")');
    await page.selectOption('select[aria-label="Moeilijkheid"]', 'moeilijk');
    await page.waitForFunction(() => window.__spellenkast.current.instance._debug.state.size === 12);
    await page.selectOption('select[aria-label="Moeilijkheid"]', 'makkelijk');
    await page.waitForFunction(() => window.__spellenkast.current.instance._debug.state.size === 8);
    await page.screenshot({ path: join(SHOTS, 'woordzoeker-iphone.png') });
  });

  // ---------------- Klondike ----------------
  console.log('\nKlondike');
  const setKlondike = (spec) => dbg(async (spec) => {
    const L = await import('./js/games/klondike/logic.js');
    const C = ([s, r, u = true]) => ({ s, r, u });
    const tableau = spec.tableau.map((p) => p.map(C));
    const waste = (spec.waste || []).map(C);
    const used = new Set([...tableau.flat(), ...waste].map(L.cardId));
    const stock = L.createDeck().filter((c) => !used.has(L.cardId(c)));
    window.__spellenkast.current.instance._debug.state = { stock, waste, foundations: [[], [], [], []], tableau, moves: 1, passes: 0, elapsedMs: 0, won: false, undo: [] };
  }, spec);

  await check('klondike: nieuw spel heeft 52 kaarten correct gedeeld', async () => {
    await open('klondike', true);
    const n = await page.locator('.kl-onder .kaart').count();
    assert(n === 28, `tableau-kaarten: ${n}`);
    const s = await state(page);
    assert(s.stock.length === 24, 'trekstapel niet 24');
  });

  await check('klondike: kaart trekken door te tikken op de trekstapel', async () => {
    await page.click('.kl-trek');
    const s = await state(page);
    assert(s.waste.length === 1 && s.stock.length === 23, 'trekken mislukt');
  });

  await check('klondike: slepen van een kaart naar een geldige plek', async () => {
    await setKlondike({ tableau: [[[0, 10]], [[1, 9]], [[1, 1]], [], [], [], []] });
    const from = await page.locator('[data-pile="tableau"][data-index="1"] .kaart').boundingBox();
    const to = await page.locator('[data-pile="tableau"][data-index="0"] .kaart').boundingBox();
    await page.mouse.move(from.x + from.width / 2, from.y + 10);
    await page.mouse.down();
    await page.mouse.move(to.x + to.width / 2, to.y + 30, { steps: 10 });
    await page.mouse.up();
    const s = await state(page);
    assert(s.tableau[0].length === 2 && s.tableau[1].length === 0, 'slepen mislukt');
  });

  await check('klondike: ongeldig slepen springt terug', async () => {
    const from = await page.locator('[data-pile="tableau"][data-index="2"] .kaart').boundingBox();
    const to = await page.locator('[data-pile="tableau"][data-index="0"] .kaart').last().boundingBox();
    await page.mouse.move(from.x + from.width / 2, from.y + 10);
    await page.mouse.down();
    await page.mouse.move(to.x + to.width / 2, to.y + 20, { steps: 10 });
    await page.mouse.up();
    const s = await state(page);
    assert(s.tableau[2].length === 1 && s.tableau[0].length === 2, 'ongeldige zet uitgevoerd');
    assert(!(await page.$('.kl-sleep')), 'sleeplaag bleef staan');
  });

  await check('klondike: tikken-dan-tikken en nogmaals tikken = automatisch naar aflegstapel', async () => {
    await page.tap('[data-pile="tableau"][data-index="2"] .kaart');
    assert(await page.$('.kaart.gekozen'), 'geen selectie zichtbaar');
    await page.tap('[data-pile="tableau"][data-index="2"] .kaart');
    const s = await state(page);
    assert(s.foundations[1].length === 1, 'aas niet naar aflegstapel');
  });

  await check('klondike: tik kaart, tik bestemming', async () => {
    await page.tap('[data-pile="tableau"][data-index="0"] .kaart >> nth=1'); // ♥9
    await page.tap('[data-pile="tableau"][data-index="3"]'); // lege stapel: mag niet (geen heer)
    let s = await state(page);
    assert(s.tableau[0].length === 2, 'onterecht verplaatst naar lege stapel');
    await page.tap('[data-pile="tableau"][data-index="0"] .kaart >> nth=0', { position: { x: 10, y: 6 } }); // selecteer reeks vanaf ♠10
    await page.tap('[data-pile="tableau"][data-index="0"] .kaart >> nth=0', { position: { x: 10, y: 6 } }); // nogmaals: auto -> nergens (geen heer), selectie weg
    s = await state(page);
    assert(s.tableau[0].length === 2, 'reeks verdween');
  });

  await check('klondike: ongedaan maken (knop en Ctrl+Z)', async () => {
    let s = await state(page);
    const f = s.foundations[1].length;
    await page.click('button:has-text("Ongedaan")');
    s = await state(page);
    assert(s.foundations[1].length === f - 1 && s.tableau[2].length === 1, 'ongedaan maken mislukt');
    await page.keyboard.press('Control+z');
    s = await state(page);
    assert(s.tableau[1].length === 1, 'Ctrl+Z mislukt');
  });

  await check('klondike: toetsenbord (Tab + Enter op trekstapel)', async () => {
    const before = (await state(page)).waste.length;
    await page.focus('.kl-trek');
    await page.keyboard.press('Enter');
    assert((await state(page)).waste.length === before + 1, 'Enter trok geen kaart');
  });

  await check('klondike: automatisch afmaken en winst', async () => {
    const cols = [[0, 1], [1, 0], [3, 2], [2, 3]];
    const tableau = [[], [], [], [], [], [], []];
    cols.forEach(([a, b], i) => { for (let r = 13; r >= 1; r--) tableau[i].push([(13 - r) % 2 === 0 ? a : b, r]); });
    await setKlondike({ tableau });
    await page.click('button:has-text("Afmaken")');
    await page.waitForSelector('.overlay:has-text("Gewonnen")', { timeout: 15000 });
    const stats = await dbg(() => JSON.parse(localStorage.getItem('spellenkast:spel:klondike:stats')).d);
    assert(stats.gewonnen === 1, 'winst niet geteld');
    await page.waitForTimeout(350);
    await page.screenshot({ path: join(SHOTS, 'klondike-gewonnen.png') });
  });

  await check('klondike: hervatten na herladen', async () => {
    await page.click('.overlay .knop:has-text("Nieuw spel")');
    await page.click('.kl-trek');
    await page.click('.kl-trek');
    const s = await state(page);
    await page.reload();
    await page.waitForSelector('.kl-tafel .kaart');
    const r = await state(page);
    assert(JSON.stringify(r.tableau) === JSON.stringify(s.tableau) && r.waste.length === 2 && r.undo.length === 2, 'stand anders');
    await page.screenshot({ path: join(SHOTS, 'klondike-iphone.png') });
  });

  // ---------------- Mijnenveger ----------------
  console.log('\nMijnenveger');
  const mvCell = async (i) => page.evaluate((i) => {
    const b = document.querySelector(`.mv-vak[data-i="${i}"]`).getBoundingClientRect();
    return [b.left + b.width / 2, b.top + b.height / 2];
  }, i);
  const setMines = (mines) => dbg((mines) => {
    const api = window.__spellenkast.current.instance._debug;
    const s = api.state;
    const n = s.rows * s.cols;
    api.state = { ...s, mines, open: Array(n).fill(0), flags: Array(n).fill(0), status: 'bezig', exploded: -1, moves: 1, elapsedMs: 0 };
  }, mines);

  await check('mijnenveger: eerste tik (aanraking) is veilig en opent een gebied', async () => {
    await open('mijnenveger', true);
    await page.touchscreen.tap(...await mvCell(40));
    const s = await state(page);
    assert(s.mines && s.mines.length === s.mineCount, 'geen mijnen gelegd');
    assert(s.status === 'bezig' && s.open[40] === 1, `status ${s.status}`);
    assert(s.open.filter(Boolean).length > 1, 'geen gebied geopend');
    const stored = await dbg(() => JSON.parse(localStorage.getItem('spellenkast:spel:mijnenveger:stand')).d);
    assert(JSON.stringify(stored.open) === JSON.stringify(s.open), 'stand niet opgeslagen');
  });

  await check('mijnenveger: vlag met lang indrukken, rechtsklik en vlagknop', async () => {
    await setMines([0, 1, 2, 3, 4, 5, 6, 7, 8, 80]);
    const a = await mvCell(70);
    await page.mouse.move(...a); await page.mouse.down(); await page.waitForTimeout(550); await page.mouse.up();
    let s = await state(page);
    assert(s.flags[70] === 1 && s.open[70] === 0, 'lang indrukken zette geen vlag');
    await page.mouse.click(...await mvCell(71), { button: 'right' });
    s = await state(page);
    assert(s.flags[71] === 1, 'rechtsklik zette geen vlag');
    await page.click('.mv-vlagknop');
    await page.touchscreen.tap(...await mvCell(72));
    s = await state(page);
    assert(s.flags[72] === 1 && s.open[72] === 0, 'vlagmodus werkte niet');
    await page.touchscreen.tap(...await mvCell(72));
    assert((await state(page)).flags[72] === 0, 'vlag niet weggehaald');
    await page.click('.mv-vlagknop');
    assert(await page.$eval('.mv-vlagknop', (b) => b.getAttribute('aria-pressed')) === 'false', 'vlagmodus bleef aan');
  });

  await check('mijnenveger: toetsenbord (pijltjes, F, Enter)', async () => {
    await setMines([0, 1, 2, 3, 4, 5, 6, 7, 8, 80]);
    await page.focus('.mv-bord');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('f');
    let s = await state(page);
    const cur = s.flags.indexOf(1);
    assert(cur >= 0, 'F zette geen vlag');
    await page.keyboard.press('f');
    await page.keyboard.press('Enter');
    s = await state(page);
    assert(s.open[cur] === 1, 'Enter opende niets');
  });

  await check('mijnenveger: winnen en statistiek', async () => {
    await setMines([0, 1, 2, 3, 4, 5, 6, 7, 8, 80].slice(0, 10));
    await page.touchscreen.tap(...await mvCell(40));
    await page.waitForSelector('.mv-houder .overlay:has-text("Veld geveegd")');
    const st = await dbg(() => JSON.parse(localStorage.getItem('spellenkast:spel:mijnenveger:stats')).d);
    assert(st.makkelijk.gewonnen >= 1 && st.makkelijk.besteTijd > 0, JSON.stringify(st.makkelijk));
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(SHOTS, 'mijnenveger-gewonnen.png') });
  });

  await check('mijnenveger: op een mijn = verloren, mijnen worden getoond', async () => {
    await page.click('.overlay .knop:has-text("Nieuw spel")');
    await setMines([10, 11, 12, 13, 14, 15, 16, 17, 30, 31]);
    await page.mouse.click(...await mvCell(70), { button: 'right' }); // verkeerde vlag
    await page.touchscreen.tap(...await mvCell(30));
    await page.waitForSelector('.mv-houder .overlay:has-text("Boem")', { timeout: 3000 });
    assert(await page.$('.mv-vak.boem') && await page.$('.mv-vak.fout'), 'mijn of foute vlag niet gemarkeerd');
    await page.click('.overlay .knop:has-text("Bord bekijken")');
    await page.screenshot({ path: join(SHOTS, 'mijnenveger-verloren.png') });
  });

  await check('mijnenveger: niveau wisselen en hervatten', async () => {
    await page.selectOption('select[aria-label="Moeilijkheid"]', 'moeilijk');
    await page.waitForFunction(() => window.__spellenkast.current.instance._debug.state.rows === 16);
    await page.touchscreen.tap(...await mvCell(100));
    const s = await state(page);
    await page.reload();
    await page.waitForSelector('.mv-bord');
    const r = await state(page);
    assert(r.level === 'moeilijk' && JSON.stringify(r.open) === JSON.stringify(s.open) && JSON.stringify(r.mines) === JSON.stringify(s.mines), 'stand anders');
    await page.screenshot({ path: join(SHOTS, 'mijnenveger-iphone.png') });
    await page.selectOption('select[aria-label="Moeilijkheid"]', 'makkelijk');
    await page.click('dialog .knop:has-text("Nieuw spel")');
  });

  // ---------------- Legpuzzel ----------------
  console.log('\nLegpuzzel');
  const lpScreen = (i, which) => dbg(([i, which]) => {
    const d = window.__spellenkast.current.instance._debug;
    const p = which === 'home' ? d.home(i) : d.pos(i);
    const f = document.querySelector('.lp-veld').getBoundingClientRect();
    const S = d.layout.S;
    return [f.left + p.x + S / 2, f.top + p.y + S / 2];
  }, [i, which]);
  const lpTop = async () => (await state(page)).order.slice(-1)[0]; // bovenste losse stukje
  const lpDrag = async (from, to) => {
    await page.mouse.move(...from); await page.mouse.down();
    await page.mouse.move(...to, { steps: 12 }); await page.mouse.up();
  };

  await check('legpuzzel: stukjes worden uitgestrooid naast het bord', async () => {
    await open('legpuzzel', true);
    await page.waitForFunction(() => window.__spellenkast.current.instance._debug.state.pieces.every((p) => p.x !== null));
    const n = await page.locator('.lp-stuk').count();
    const s = await state(page);
    assert(n === s.n * s.n, `${n} stukjes`);
    const drawn = await dbg(() => {
      const c = document.querySelector('.lp-stuk');
      const d = c.getContext('2d').getImageData(c.width / 2, c.height / 2, 1, 1).data;
      return d[3] > 0;
    });
    assert(drawn, 'stukje is niet getekend');
  });

  await check('legpuzzel: slepen naar de juiste plek klikt vast', async () => {
    const i = await lpTop();
    await lpDrag(await lpScreen(i, 'pos'), await lpScreen(i, 'home'));
    const s = await state(page);
    assert(s.pieces[i].placed === 1, 'niet vastgeklikt');
    assert(s.moves === 1, `zetten ${s.moves}`);
    const stored = await dbg(() => JSON.parse(localStorage.getItem('spellenkast:spel:legpuzzel:stand')).d);
    assert(stored.pieces[i].placed === 1, 'niet opgeslagen');
  });

  await check('legpuzzel: verkeerde plek → stukje blijft los liggen waar je het neerlegt', async () => {
    const s0 = await state(page);
    const i = s0.order.filter((k) => !s0.pieces[k].placed).slice(-1)[0];
    const home = await lpScreen(i, 'home');
    const from = await lpScreen(i, 'pos');
    const lay = await dbg(() => window.__spellenkast.current.instance._debug.layout.S);
    const to = [home[0] + lay * 1.2 * (home[0] > 200 ? -1 : 1), home[1] + lay * 1.1];
    await lpDrag(from, to);
    const s = await state(page);
    assert(s.pieces[i].placed === 0 && (s.pieces[i].x !== s0.pieces[i].x || s.pieces[i].y !== s0.pieces[i].y), 'positie niet bijgewerkt');
  });

  await check('legpuzzel: voorbeeld aan/uit en opruimen', async () => {
    await page.click('button[aria-label="Voorbeeld"]');
    assert(await page.$('.lp-veld.met-voorbeeld'), 'voorbeeld niet zichtbaar');
    const prefs = await dbg(() => JSON.parse(localStorage.getItem('spellenkast:spel:legpuzzel:voorkeur')).d);
    assert(prefs.voorbeeld === true, 'voorkeur niet bewaard');
    await page.click('button[aria-label="Voorbeeld"]');
    const before = await state(page);
    await page.click('button[aria-label="Opruimen"]');
    const after = await state(page);
    const moved = after.pieces.filter((p, k) => !p.placed && (p.x !== before.pieces[k].x || p.y !== before.pieces[k].y)).length;
    assert(moved > 0, 'opruimen verplaatste niets');
    assert(after.pieces.filter((p) => p.placed).length === before.pieces.filter((p) => p.placed).length, 'vaste stukjes verplaatst');
  });

  await check('legpuzzel: hervatten na herladen', async () => {
    const s = await state(page);
    await page.reload();
    await page.waitForSelector('.lp-stuk');
    const r = await state(page);
    assert(JSON.stringify(r.pieces) === JSON.stringify(s.pieces) && r.cutSeed === s.cutSeed && JSON.stringify(r.image) === JSON.stringify(s.image), 'stand anders');
    await page.waitForTimeout(200);
    await page.screenshot({ path: join(SHOTS, 'legpuzzel-iphone.png') });
  });

  await check('legpuzzel: puzzel af wordt herkend', async () => {
    const s = await state(page);
    for (let i = 0; i < s.n * s.n; i++) {
      if (s.pieces[i].placed) continue;
      await dbg((i) => { const d = window.__spellenkast.current.instance._debug; const h = d.home(i); d.drop(i, h.x + 3, h.y - 2); }, i);
    }
    await page.waitForSelector('.lp-veld .overlay:has-text("Puzzel af")');
    const st = await dbg(() => JSON.parse(localStorage.getItem('spellenkast:spel:legpuzzel:stats')).d);
    assert(st[s.level].opgelost === 1, 'statistiek niet bijgewerkt');
    await page.waitForTimeout(700);
    await page.screenshot({ path: join(SHOTS, 'legpuzzel-af.png') });
  });

  await check('legpuzzel: eigen foto kiezen maakt een puzzel van die foto', async () => {
    await page.click('.overlay .knop:has-text("Bekijken")');
    await page.setInputFiles('.lp-knoppen input[type="file"]', join(process.cwd(), 'app', 'icons', 'icon-512.png'));
    await page.waitForFunction(() => window.__spellenkast.current.instance._debug.state.image.kind === 'foto');
    const prefs = await dbg(() => JSON.parse(localStorage.getItem('spellenkast:spel:legpuzzel:voorkeur')).d);
    assert(prefs.afbeelding === 'foto' && prefs.foto.startsWith('data:image/jpeg;base64,'), 'foto niet bewaard');
    await page.waitForFunction(() => window.__spellenkast.current.instance._debug.state.pieces.every((p) => p.x !== null));
    await page.waitForTimeout(300);
    assert(await page.locator('select[aria-label="Afbeelding"] option[value="foto"]').count() === 1, 'geen optie "Eigen foto"');
    await page.screenshot({ path: join(SHOTS, 'legpuzzel-foto.png') });
    await page.selectOption('select[aria-label="Afbeelding"]', 'willekeurig');
    await page.waitForFunction(() => window.__spellenkast.current.instance._debug.state.image.kind === 'thema');
  });

  // ---------------- Snoepwissel ----------------
  console.log('\nSnoepwissel');
  const swCell = (i) => page.evaluate((i) => {
    const b = document.querySelector('.sw-bord').getBoundingClientRect();
    const s = b.width / 8;
    return [b.left + (i % 8) * s + s / 2, b.top + Math.floor(i / 8) * s + s / 2];
  }, i);
  const swHint = () => dbg(async () => {
    const L = await import('./js/games/snoepwissel/logic.js');
    return L.findHint(window.__spellenkast.current.instance._debug.state.grid);
  });
  const swIdle = () => page.waitForFunction(() => !window.__spellenkast.current.instance._debug.busy, null, { timeout: 15000 });

  await check('snoepwissel: vegen (muis) wisselt en lost rijtjes op', async () => {
    await open('snoepwissel', true);
    const s0 = await state(page);
    const [a, b] = await swHint();
    await page.mouse.move(...await swCell(a)); await page.mouse.down();
    await page.mouse.move(...await swCell(b), { steps: 6 }); await page.mouse.up();
    await swIdle();
    const s = await state(page);
    assert(s.moves === 1 && s.movesLeft === s0.movesLeft - 1 && s.score > 0, `zetten ${s.moves}, score ${s.score}`);
    assert(await page.locator('.sw-snoep').count() === 64, 'niet 64 snoepjes op het scherm');
    const ids = await page.$$eval('.sw-snoep', (els) => els.map((e) => Number(e.dataset.id)).sort((x, y) => x - y));
    assert(JSON.stringify(ids) === JSON.stringify(s.grid.map((c) => c.id).sort((x, y) => x - y)), 'scherm loopt niet gelijk met de stand');
  });

  await check('snoepwissel: tik-tik (aanraking)', async () => {
    const before = (await state(page)).moves;
    const [a, b] = await swHint();
    await page.touchscreen.tap(...await swCell(a));
    assert(await page.$('.sw-snoep.gekozen'), 'geen selectie zichtbaar');
    await page.touchscreen.tap(...await swCell(b));
    await swIdle();
    assert((await state(page)).moves === before + 1, 'tik-tik wisselde niet');
  });

  await check('snoepwissel: ongeldige wissel kost geen zet', async () => {
    const s0 = await state(page);
    const pair = await dbg(async () => {
      const L = await import('./js/games/snoepwissel/logic.js');
      const g = window.__spellenkast.current.instance._debug.state.grid;
      for (let i = 0; i < 63; i++) if (i % 8 < 7 && !L.isValidSwap(g, i, i + 1)) return [i, i + 1];
      return null;
    });
    await page.mouse.move(...await swCell(pair[0])); await page.mouse.down();
    await page.mouse.move(...await swCell(pair[1]), { steps: 6 }); await page.mouse.up();
    await swIdle();
    const s = await state(page);
    assert(s.moves === s0.moves && JSON.stringify(s.grid) === JSON.stringify(s0.grid), 'ongeldige wissel uitgevoerd');
  });

  await check('snoepwissel: toetsenbord (pijltjes, Enter, pijltje)', async () => {
    const before = (await state(page)).moves;
    // Na herladen staat de toetsenbordcursor op vak 27 (rij 4, kolom 4).
    await page.reload();
    await page.waitForSelector('.sw-snoep');
    const [a, b] = await swHint();
    const from = [3, 3], to = [Math.floor(a / 8), a % 8];
    await page.focus('.sw-bord');
    for (let k = from[0]; k < to[0]; k++) await page.keyboard.press('ArrowDown');
    for (let k = from[0]; k > to[0]; k--) await page.keyboard.press('ArrowUp');
    for (let k = from[1]; k < to[1]; k++) await page.keyboard.press('ArrowRight');
    for (let k = from[1]; k > to[1]; k--) await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Enter');
    const dir = b - a === 1 ? 'ArrowRight' : b - a === -1 ? 'ArrowLeft' : b - a === 8 ? 'ArrowDown' : 'ArrowUp';
    await page.keyboard.press(dir);
    await swIdle();
    assert((await state(page)).moves === before + 1, 'toetsenbordwissel mislukt');
  });

  await check('snoepwissel: niveau gehaald → sterren en volgend niveau', async () => {
    await dbg(() => { const d = window.__spellenkast.current.instance._debug; d.state = { ...d.state, movesLeft: 1, target: 20 }; });
    const [a, b] = await swHint();
    await dbg(([a, b]) => window.__spellenkast.current.instance._debug.swap(a, b), [a, b]);
    await page.waitForSelector('.sw-houder .overlay:has-text("gehaald")', { timeout: 15000 });
    const st = await dbg(() => JSON.parse(localStorage.getItem('spellenkast:spel:snoepwissel:stats')).d);
    assert(st.hoogsteNiveau === 2 && st.sterren[0] === 3, JSON.stringify(st));
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(SHOTS, 'snoepwissel-gehaald.png') });
    await page.click('.overlay .knop:has-text("Volgend niveau")');
    const s = await state(page);
    assert(s.level === 2 && s.moves === 0, `niveau ${s.level}`);
  });

  await check('snoepwissel: zetten op zonder doel → opnieuw proberen', async () => {
    await dbg(() => { const d = window.__spellenkast.current.instance._debug; d.state = { ...d.state, movesLeft: 1, target: 999999 }; });
    const [a, b] = await swHint();
    await dbg(([a, b]) => window.__spellenkast.current.instance._debug.swap(a, b), [a, b]);
    await page.waitForSelector('.sw-houder .overlay:has-text("Zetten op")', { timeout: 15000 });
    await page.click('.overlay .knop:has-text("Opnieuw")');
    const s = await state(page);
    assert(s.level === 2 && s.status === 'bezig' && s.moves === 0, JSON.stringify({ level: s.level, status: s.status }));
  });

  await check('snoepwissel: hervatten na herladen, niveaukeuze bewaard', async () => {
    const [a, b] = await swHint();
    await dbg(([a, b]) => window.__spellenkast.current.instance._debug.swap(a, b), [a, b]);
    await swIdle();
    const s = await state(page);
    await page.reload();
    await page.waitForSelector('.sw-snoep');
    const r = await state(page);
    assert(JSON.stringify(r.grid) === JSON.stringify(s.grid) && r.score === s.score && r.level === 2, 'stand anders');
    const opts = await page.$$eval('select[aria-label="Niveau"] option', (o) => o.map((x) => x.textContent));
    assert(opts.length === 2 && opts[0].includes('★★★'), JSON.stringify(opts));
    await page.screenshot({ path: join(SHOTS, 'snoepwissel-iphone.png') });
  });

  // ---------------- Schermformaten ----------------
  console.log('\nSchermformaten');
  const sel = { blokval: '.blokval-knoppen', woordzoeker: '.wz-houder', klondike: '.kl-tafel', 2048: '.bord-houder', mijnenveger: '.mv-houder', legpuzzel: '.lp-veld', snoepwissel: '.sw-houder' };
  for (const [w, h, name] of [[320, 568, 'se'], [375, 667, 'iphone8'], [1280, 800, 'pc'], [844, 390, 'liggend']]) {
    for (const id of Object.keys(sel)) {
      await check(`${id} past op ${w}×${h}`, async () => {
        await page.setViewportSize({ width: w, height: h });
        await open(id);
        await page.waitForTimeout(150);
        const r = await page.evaluate((s) => {
          const b = document.querySelector(s).getBoundingClientRect();
          return { right: b.right, bottom: b.bottom, sw: document.documentElement.scrollWidth, vw: innerWidth, vh: innerHeight };
        }, sel[id]);
        assert(r.sw <= r.vw, `horizontale overloop ${r.sw} > ${r.vw}`);
        assert(r.right <= r.vw + 0.5, `buiten beeld rechts (${r.right})`);
        if (id !== 'woordzoeker') assert(r.bottom <= r.vh + 0.5, `buiten beeld onder (${r.bottom} > ${r.vh})`);
        if (name === 'se' || name === 'pc') await page.screenshot({ path: join(SHOTS, `${id}-${name}.png`) });
      });
    }
  }

  await check('instellingen: geluid en animaties worden bewaard', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(URL_ + '#/');
    await page.waitForSelector('.spellenlijst');
    await page.click('#acties button[aria-label="Instellingen"]');
    await page.waitForSelector('dialog[open] #inst-geluid');
    await page.uncheck('#inst-geluid');
    await page.selectOption('#inst-animaties', 'uit');
    assert(await page.evaluate(() => document.documentElement.dataset.beweging === 'uit'), 'animaties niet uit');
    await page.screenshot({ path: join(SHOTS, 'instellingen.png') });
    await page.click('dialog .knop:has-text("Sluiten")');
    await page.reload();
    await page.waitForSelector('.spellenlijst');
    const st = await page.evaluate(() => window.__spellenkast.settings.get());
    assert(st.geluid === false && st.animaties === 'uit', JSON.stringify(st));
    await page.evaluate(() => window.__spellenkast.settings.set({ geluid: true, animaties: 'auto' }));
  });

  await check('donkere weergave', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto(URL_ + '#/');
    await page.waitForSelector('.spellenlijst');
    await page.screenshot({ path: join(SHOTS, 'start-donker.png'), fullPage: true });
    await open('klondike');
    await page.screenshot({ path: join(SHOTS, 'klondike-donker.png') });
    await page.emulateMedia({ colorScheme: 'light' });
  });
}
