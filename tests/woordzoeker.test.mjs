import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../app/js/games/woordzoeker/logic.js';
import { THEMES, THEME_IDS, wordsFor } from '../app/js/games/woordzoeker/words.js';
import { seededRandom } from '../app/js/core/util.js';

test('woordenlijsten: alleen hoofdletters A–Z, genoeg woorden per thema', () => {
  for (const id of THEME_IDS) {
    const words = wordsFor(id);
    assert.ok(words.length >= 25, `${THEMES[id].naam}: ${words.length} woorden`);
    for (const w of words) assert.match(w, /^[A-Z]+$/, `${id}: ${w}`);
    for (const lv of Object.keys(L.LEVELS)) assert.ok(L.pickWords(id, lv, seededRandom(1)).length === L.LEVELS[lv].count, `${id}/${lv} te weinig woorden`);
  }
});

test('pickWords: geen woord binnen een ander woord', () => {
  for (let seed = 0; seed < 50; seed++) {
    const ws = L.pickWords('dieren', 'moeilijk', seededRandom(seed));
    for (const a of ws) for (const b of ws) if (a !== b) assert.ok(!a.includes(b), `${b} in ${a}`);
  }
});

test('gegenereerde puzzels zijn geldig voor elk thema en niveau (300 puzzels)', () => {
  let n = 0;
  for (const theme of THEME_IDS) {
    for (const level of Object.keys(L.LEVELS)) {
      for (let seed = 0; seed < 12; seed++) {
        const s = L.newGame(theme, level, seededRandom(seed * 31 + n));
        const lv = L.LEVELS[level];
        assert.equal(s.grid.length, lv.size);
        assert.equal(s.words.length, lv.count);
        assert.ok(L.validateState(s), `${theme}/${level}/${seed} ongeldig`);
        for (const w of s.words) {
          assert.ok(lv.dirs.includes(w.dir), `richting ${w.dir} niet toegestaan op ${level}`);
          assert.equal(L.countOccurrences(s.grid.map((r) => [...r]), w.word), 1, `${w.word} niet precies één keer`);
        }
        n++;
      }
    }
  }
  assert.ok(n >= 288);
});

test('selectie: voorwaarts en achterstevoren gevonden, onzin niet', () => {
  const s = L.newGame('fruit', 'moeilijk', seededRandom(5));
  const w = s.words[0];
  const cells = L.wordCells(w);
  const [r1, c1] = cells[cells.length - 1];
  assert.equal(L.checkSelection(s, w.r, w.c, r1, c1), 0);
  assert.equal(L.checkSelection(s, r1, c1, w.r, w.c), 0, 'achterstevoren selecteren telt ook');
  assert.equal(L.checkSelection(s, 0, 0, 1, 2), -1, 'geen rechte lijn');
  L.markFound(s, 0);
  assert.equal(L.checkSelection(s, w.r, w.c, r1, c1), -1, 'al gevonden woord telt niet opnieuw');
});

test('puzzel is klaar als alle woorden gevonden zijn', () => {
  const s = L.newGame('sport', 'makkelijk', seededRandom(8));
  s.words.forEach((w, i) => {
    const cells = L.wordCells(w);
    const [r1, c1] = cells[cells.length - 1];
    const idx = L.checkSelection(s, w.r, w.c, r1, c1);
    assert.equal(idx, i);
    const done = L.markFound(s, idx);
    assert.equal(done, i === s.words.length - 1);
  });
  assert.equal(s.done, true);
});

test('readLine: rechte lijnen en diagonalen', () => {
  const g = ['ABC', 'DEF', 'GHI'];
  assert.equal(L.readLine(g, 0, 0, 0, 2), 'ABC');
  assert.equal(L.readLine(g, 2, 2, 0, 0), 'IEA');
  assert.equal(L.readLine(g, 2, 0, 0, 2), 'GEC');
  assert.equal(L.readLine(g, 0, 0, 1, 2), null);
});

test('validateState: gemanipuleerd rooster wordt afgewezen', () => {
  const s = L.newGame('huis', 'normaal', seededRandom(3));
  const w = s.words[0];
  const grid = s.grid.slice();
  const row = [...grid[w.r]];
  row[w.c] = row[w.c] === 'Q' ? 'X' : 'Q';
  grid[w.r] = row.join('');
  assert.equal(L.validateState({ ...s, grid }), false);
  assert.equal(L.validateState({ ...s, found: [0, 0] }), false);
  assert.equal(L.validateState({ ...s, level: 'extreem' }), false);
});
