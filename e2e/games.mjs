// Browsercontroles voor Blokval, Woordzoeker en Klondike. Wordt aangeroepen vanuit run.mjs (offline context).
import { join } from 'node:path';

export default async function ({ page, check, assert, URL_, SHOTS, state }) {
  const dbg = (fn, arg) => page.evaluate(fn, arg);
  const open = async (id, fresh = false) => {
    await page.goto(URL_ + `#/${id}${fresh ? '/nieuw' : ''}`);
    await page.waitForSelector('.spelscherm');
  };

  console.log('\nAlle spellen offline');
  await page.setViewportSize({ width: 390, height: 844 });

  for (const id of ['blokval', 'woordzoeker', '2048', 'klondike']) {
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

  // ---------------- Schermformaten ----------------
  console.log('\nSchermformaten');
  const sel = { blokval: '.blokval-knoppen', woordzoeker: '.wz-houder', klondike: '.kl-tafel', 2048: '.bord-houder' };
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
