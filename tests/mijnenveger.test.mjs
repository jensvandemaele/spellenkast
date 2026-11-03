import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../app/js/games/mijnenveger/logic.js';
import { seededRandom } from '../app/js/core/util.js';

/** Makkelijk bord (9×9) met mijnen op de gegeven [rij, kolom]-plekken. */
function withMines(cells, level = 'makkelijk') {
  const s = L.newGame(level);
  const mines = cells.map(([r, c]) => r * s.cols + c);
  return { ...s, mineCount: mines.length, mines, _fixed: true };
}
// Voor eigen mijnaantallen: validateState verwacht het niveau-aantal, dus alleen gebruiken voor regels.

test('nieuw spel: afmetingen per niveau, nog geen mijnen', () => {
  for (const id of L.LEVEL_IDS) {
    const s = L.newGame(id);
    assert.equal(s.open.length, s.rows * s.cols);
    assert.equal(s.mines, null);
    assert.equal(s.mineCount, L.LEVELS[id].mines);
    assert.ok(L.validateState(s), id);
  }
});

test('placeMines: juiste aantal, uniek, aangetikt vak en buren vrij', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const safe = (seed * 7) % 81;
    const m = L.placeMines(9, 9, 10, safe, seededRandom(seed));
    assert.equal(m.length, 10);
    assert.equal(new Set(m).size, 10);
    const forbidden = new Set([safe, ...L.neighbors(safe, 9, 9)]);
    assert.ok(m.every((i) => !forbidden.has(i)), `seed ${seed}`);
  }
});

test('placeMines: vol bordje houdt minstens het aangetikte vak vrij', () => {
  const m = L.placeMines(3, 3, 8, 4, seededRandom(3));
  assert.equal(m.length, 8);
  assert.ok(!m.includes(4));
});

test('eerste tik is altijd veilig en opent een gebied', () => {
  for (const level of L.LEVEL_IDS) {
    for (let seed = 1; seed <= 60; seed++) {
      const s = L.newGame(level);
      const i = Math.floor(seededRandom(seed)() * s.rows * s.cols);
      const res = L.reveal(s, i, seededRandom(seed + 1000));
      assert.equal(res.exploded, false);
      assert.equal(L.counts(res.state)[i], 0, 'eerste vak is een 0');
      assert.ok(res.opened.length > 1, 'overstroming opent buren');
      assert.ok(L.validateState(res.state));
      assert.equal(s.mines, null, 'oude stand ongewijzigd');
    }
  }
});

test('buren en tellingen kloppen', () => {
  assert.deepEqual(L.neighbors(0, 9, 9).sort((a, b) => a - b), [1, 9, 10]);
  assert.equal(L.neighbors(40, 9, 9).length, 8);
  const s = withMines([[0, 0], [0, 2], [1, 1]]);
  const cnt = L.counts(s);
  assert.equal(cnt[0 * 9 + 1], 3);
  assert.equal(cnt[1 * 9 + 0], 2);
  assert.equal(cnt[2 * 9 + 2], 1);
  assert.equal(cnt[8 * 9 + 8], 0);
});

test('overstroming stopt bij getallen', () => {
  const s = withMines([[0, 0]]);
  const res = L.reveal(s, 80);
  // Alles behalve de mijn gaat open: de 0-gebieden verbinden het hele bord.
  assert.equal(res.opened.length, 80);
  assert.equal(res.won, true);
  assert.equal(res.state.status, 'gewonnen');
  assert.equal(res.state.flags[0], 1, 'mijnen krijgen automatisch een vlag');
});

test('op een mijn tikken = verloren', () => {
  const s = withMines([[4, 4], [0, 8]]);
  const res = L.reveal(s, 4 * 9 + 4);
  assert.equal(res.exploded, true);
  assert.equal(res.state.status, 'verloren');
  assert.equal(res.state.exploded, 40);
  // Daarna gebeurt er niets meer.
  assert.equal(L.reveal(res.state, 0).state, res.state);
  assert.equal(L.toggleFlag(res.state, 0).changed, false);
});

test('vlaggen: niet op open vakjes, gevlagd vak gaat niet open', () => {
  const s = withMines([[0, 0], [8, 8]]);
  const f = L.toggleFlag(s, 1);
  assert.equal(f.changed, true);
  assert.equal(f.state.flags[1], 1);
  assert.equal(L.minesLeft(f.state), 1);
  assert.equal(L.reveal(f.state, 1).state, f.state, 'gevlagd vak blijft dicht');
  const opened = L.reveal(s, 40).state;
  assert.equal(L.toggleFlag(opened, 40).changed, false);
  assert.equal(L.toggleFlag(f.state, 1).state.flags[1], 0, 'tweede keer haalt de vlag weg');
});

test('akkoord: opent buren als de vlaggen kloppen', () => {
  // Mijnen op (0,0) en (2,2); (1,1) is een 2.
  let s = withMines([[0, 0], [2, 2], [8, 8]]);
  s = { ...s, open: s.open.map((v, i) => (i === 10 ? 1 : v)) };
  assert.equal(L.chord(s, 10).state, s, 'zonder vlaggen gebeurt er niets');
  s = L.toggleFlag(s, 0).state;
  assert.equal(L.chord(s, 10).state, s, 'met één vlag van de twee ook niet');
  s = L.toggleFlag(s, 20).state;
  const res = L.chord(s, 10);
  assert.equal(res.exploded, false);
  for (const k of L.neighbors(10, 9, 9)) if (k !== 0 && k !== 20) assert.equal(res.state.open[k], 1, `buur ${k} open`);
});

test('akkoord met verkeerde vlag raakt een mijn', () => {
  let s = withMines([[0, 0], [8, 8]]);
  s = { ...s, open: s.open.map((v, i) => (i === 10 ? 1 : v)) }; // (1,1) is een 1
  s = L.toggleFlag(s, 2).state; // verkeerde plek
  const res = L.chord(s, 10);
  assert.equal(res.exploded, true);
  assert.equal(res.state.status, 'verloren');
  assert.deepEqual(L.wrongFlags(res.state), [2]);
});

test('tap: dicht → omdraaien, open getal → akkoord', () => {
  const s = withMines([[0, 0], [8, 8]]);
  const a = L.tap(s, 10);
  assert.equal(a.state.open[10], 1);
  assert.equal(L.tap(a.state, 10).state, a.state, 'akkoord zonder vlag doet niets');
});

test('validateState: accepteert een lopend spel, weigert kapotte standen', () => {
  const s = L.reveal(L.newGame('normaal'), 70, seededRandom(5)).state;
  assert.ok(L.validateState(s));
  assert.ok(!L.validateState(null));
  assert.ok(!L.validateState({ ...s, level: 'onbekend' }));
  assert.ok(!L.validateState({ ...s, open: s.open.slice(1) }));
  assert.ok(!L.validateState({ ...s, flags: s.flags.map(() => 2) }));
  assert.ok(!L.validateState({ ...s, mines: s.mines.slice(1) }));
  assert.ok(!L.validateState({ ...s, mines: s.mines.map(() => 3) }), 'dubbele mijnen');
  assert.ok(!L.validateState({ ...s, status: 'raar' }));
  const openMine = s.open.slice(); openMine[s.mines[0]] = 1;
  assert.ok(!L.validateState({ ...s, open: openMine }), 'open mijn terwijl het spel loopt');
  const both = s.open.slice(); const flags = s.flags.slice(); const k = both.indexOf(1); flags[k] = 1;
  assert.ok(!L.validateState({ ...s, flags }), 'open én gevlagd');
  assert.ok(!L.validateState({ ...L.newGame('makkelijk'), open: L.newGame('makkelijk').open.map((_, i) => (i === 3 ? 1 : 0)) }), 'open vak zonder mijnen');
});
