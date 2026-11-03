import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../app/js/games/snoepwissel/logic.js';
import { seededRandom } from '../app/js/core/util.js';

/**
 * Bord uit tekst: 8 regels van 8 tekens. a–f = kleur 0–5.
 * Hoofdletter = streep horizontaal (A = rood streep h), met ':' ervoor = verticaal, '*' ervoor = bom,
 * 'C' = kleurbom. Voor leesbaarheid gebruiken we per vak één token gescheiden door spaties.
 */
function G(lines) {
  let id = 1;
  const grid = [];
  for (const line of lines) {
    const tokens = line.trim().split(/\s+/);
    assert.equal(tokens.length, 8, line);
    for (const t of tokens) {
      if (t === 'C') { grid.push({ id: id++, k: -1, s: 'c' }); continue; }
      const k = 'abcdef'.indexOf(t[0].toLowerCase());
      const s = t.length > 1 ? { h: 'h', v: 'v', b: 'b' }[t[1]] : '';
      grid.push({ id: id++, k, s });
    }
  }
  assert.equal(grid.length, 64);
  return grid;
}
const at = (r, c) => r * 8 + c;
const stateOf = (grid, extra = {}) => ({ level: 1, grid, nextId: 100, colors: 6, target: 1000, movesLeft: 10, moves: 0, score: 0, status: 'bezig', ...extra });

// Een "rustig" bord zonder rijtjes, waarin we gericht patronen zetten.
const CALM = [
  'a b c d e f a b',
  'c d e f a b c d',
  'e f a b c d e f',
  'b c d e f a b c',
  'd e f a b c d e',
  'f a b c d e f a',
  'a b c d e f a b',
  'c d e f a b c d',
];

test('rustig testbord heeft geen rijtjes', () => {
  assert.equal(L.findRuns(G(CALM)).length, 0);
});

test('findRuns: horizontaal en verticaal, kleurbom telt niet mee', () => {
  const lines = CALM.slice();
  lines[0] = 'a a a d e f a b';
  lines[3] = 'b c d e f C C C';
  const g = G(lines);
  g[at(1, 7)] = { id: 900, k: 0, s: '' };
  g[at(2, 7)] = { id: 901, k: 0, s: '' };
  // kolom 7: rij0 = b(1)… maak rij 0..2 in kolom 7 gelijk
  g[at(0, 7)] = { id: 902, k: 0, s: '' };
  const runs = L.findRuns(g);
  const h = runs.find((r) => r.dir === 'h');
  assert.deepEqual(h.cells, [0, 1, 2]);
  const v = runs.find((r) => r.dir === 'v');
  assert.deepEqual(v.cells, [7, 15, 23]);
  assert.ok(!runs.some((r) => r.cells.includes(at(3, 5))), 'kleurbommen vormen geen rijtje');
});

test('specialForGroup: 4 → streep, 5 → kleurbom, L → bom op het kruispunt', () => {
  const four = { k: 2, runs: [{ dir: 'h', k: 2, cells: [0, 1, 2, 3] }], cells: [0, 1, 2, 3] };
  assert.deepEqual(L.specialForGroup(four), { at: 1, s: 'h', k: 2 });
  assert.equal(L.specialForGroup(four, [3]).at, 3, 'op de plek van de wissel');
  const fourV = { k: 1, runs: [{ dir: 'v', k: 1, cells: [0, 8, 16, 24] }], cells: [0, 8, 16, 24] };
  assert.equal(L.specialForGroup(fourV).s, 'v');
  const five = { k: 0, runs: [{ dir: 'h', k: 0, cells: [0, 1, 2, 3, 4] }], cells: [0, 1, 2, 3, 4] };
  assert.deepEqual(L.specialForGroup(five), { at: 2, s: 'c', k: -1 });
  const ell = { k: 3, runs: [{ dir: 'h', k: 3, cells: [16, 17, 18] }, { dir: 'v', k: 3, cells: [0, 8, 16] }], cells: [0, 8, 16, 17, 18] };
  assert.deepEqual(L.specialForGroup(ell), { at: 16, s: 'b', k: 3 });
  const three = { k: 3, runs: [{ dir: 'h', k: 3, cells: [0, 1, 2] }], cells: [0, 1, 2] };
  assert.equal(L.specialForGroup(three), null);
});

test('findGroups voegt een L-vorm samen tot één groep', () => {
  const lines = CALM.slice();
  lines[0] = 'd b c d e f a b';
  lines[1] = 'd d e f a b c d'.replace(/^d d/, 'd e');
  const g = G(lines);
  // kolom 0 rij 0..2 = d, rij 2 kolom 0..2 = d
  g[at(1, 0)] = { id: 800, k: 3, s: '' };
  g[at(2, 0)] = { id: 801, k: 3, s: '' };
  g[at(2, 1)] = { id: 802, k: 3, s: '' };
  g[at(2, 2)] = { id: 803, k: 3, s: '' };
  const groups = L.findGroups(g);
  const big = groups.find((x) => x.cells.length === 5);
  assert.ok(big, JSON.stringify(groups.map((x) => x.cells)));
  assert.equal(L.specialForGroup(big).s, 'b');
});

test('nieuw bord: geen kant-en-klare rijtjes, wel een zet, unieke ids', () => {
  for (let seed = 1; seed <= 120; seed++) {
    for (const colors of [5, 6]) {
      const { grid, nextId } = L.newBoard(colors, seededRandom(seed));
      assert.equal(L.findRuns(grid).length, 0);
      assert.ok(L.hasMove(grid));
      assert.equal(new Set(grid.map((c) => c.id)).size, 64);
      assert.ok(grid.every((c) => c.k >= 0 && c.k < colors && c.s === ''));
      assert.ok(nextId > Math.max(...grid.map((c) => c.id)));
    }
  }
});

test('isValidSwap: alleen buren, alleen als het iets oplevert', () => {
  const lines = CALM.slice();
  lines[0] = 'a a b a e f a b'; // b op (0,2) wisselen met a op (0,3) → aaa
  const g = G(lines);
  assert.ok(L.isValidSwap(g, at(0, 2), at(0, 3)));
  assert.ok(!L.isValidSwap(g, at(0, 2), at(0, 4)), 'geen buren');
  assert.ok(!L.isValidSwap(g, at(0, 7), at(0, 8)), 'over de rand naar de volgende rij');
  assert.ok(!L.isValidSwap(g, at(5, 5), at(5, 6)), 'levert niets op');
  g[at(5, 5)] = { id: 500, k: -1, s: 'c' };
  assert.ok(L.isValidSwap(g, at(5, 5), at(5, 6)), 'kleurbom mag altijd');
  g[at(6, 0)] = { ...g[at(6, 0)], s: 'h' };
  g[at(6, 1)] = { ...g[at(6, 1)], s: 'b' };
  assert.ok(L.isValidSwap(g, at(6, 0), at(6, 1)), 'twee speciale snoepjes mogen altijd');
});

test('ongeldige wissel kost geen zet en verandert niets', () => {
  const s = stateOf(G(CALM));
  const res = L.applySwap(s, at(4, 4), at(4, 5));
  assert.equal(res.ok, false);
  assert.equal(res.state, s);
});

test('gewone wissel: rijtje verdwijnt, score en zetten kloppen, bord blijft vol', () => {
  const lines = CALM.slice();
  lines[0] = 'a a b a e f a b';
  const s = stateOf(G(lines));
  const res = L.applySwap(s, at(0, 2), at(0, 3), seededRandom(1));
  assert.ok(res.ok);
  assert.equal(res.state.movesLeft, 9);
  assert.equal(res.state.moves, 1);
  const first = res.phases[0];
  assert.deepEqual(first.cleared.map((c) => c.i).sort((a, b) => a - b), [0, 1, 2]);
  assert.equal(first.points, 3 * L.POINTS_PER_CANDY);
  assert.equal(res.state.score, res.phases.reduce((n, p) => n + p.points, 0));
  assert.ok(res.state.grid.every(Boolean));
  assert.equal(L.findRuns(res.state.grid).length, 0, 'na afloop geen rijtjes meer');
  assert.ok(L.validateState(res.state));
  // Vallen: de drie nieuwe snoepjes komen van boven.
  assert.equal(first.spawns.length, 3);
  assert.ok(first.spawns.every((sp) => sp.fromRow < 0));
});

test('4 op een rij maakt een streepsnoepje op de plek van de wissel', () => {
  const lines = CALM.slice();
  lines[2] = 'c c a c e d e f'; // a op (2,2) wisselen met c op (1,2)? We maken het verticaal:
  const g = G(CALM);
  // Rij 4: c c x c met c erboven op x → wissel maakt cccc
  g[at(4, 0)] = { id: 700, k: 2, s: '' };
  g[at(4, 1)] = { id: 701, k: 2, s: '' };
  g[at(4, 3)] = { id: 702, k: 2, s: '' };
  g[at(3, 2)] = { id: 703, k: 2, s: '' };
  assert.equal(L.findRuns(g).length, 0, 'opzet zonder rijtjes');
  const res = L.applySwap(stateOf(g), at(3, 2), at(4, 2), seededRandom(2));
  assert.ok(res.ok);
  const created = res.phases[0].created;
  assert.equal(created.length, 1);
  assert.equal(created[0].s, 'h');
  assert.equal(created[0].k, 2);
  assert.equal(created[0].i, at(4, 2));
  assert.equal(res.phases[0].points, 4 * L.POINTS_PER_CANDY + L.SPECIAL_BONUS.h);
});

test('streepsnoepje in een rijtje wist de hele rij', () => {
  const g = G(CALM);
  g[at(5, 0)] = { id: 700, k: 0, s: 'h' };
  g[at(5, 1)] = { id: 701, k: 0, s: '' };
  g[at(4, 2)] = { id: 702, k: 0, s: '' }; // valt na wissel met (5,2) in rij 5
  const res = L.applySwap(stateOf(g), at(4, 2), at(5, 2), seededRandom(3));
  assert.ok(res.ok);
  const cleared = new Set(res.phases[0].cleared.map((c) => c.i));
  for (let c = 0; c < 8; c++) assert.ok(cleared.has(at(5, c)), `kolom ${c} van rij 5`);
  assert.equal(res.phases[0].effects[0].s, 'h');
});

test('kleurbom + snoepje wist alle snoepjes van die kleur', () => {
  const g = G(CALM);
  g[at(3, 3)] = { id: 600, k: -1, s: 'c' };
  const color = g[at(3, 4)].k;
  const count = g.filter((c) => c.k === color).length;
  const res = L.applySwap(stateOf(g), at(3, 3), at(3, 4), seededRandom(4));
  assert.ok(res.ok);
  assert.equal(res.combo, 'kleur');
  const cleared = res.phases[0].cleared;
  assert.equal(cleared.filter((c) => c.k === color).length, count);
  assert.ok(cleared.some((c) => c.s === 'c'), 'de kleurbom zelf verdwijnt ook');
});

test('twee kleurbommen wissen het hele bord', () => {
  const g = G(CALM);
  g[at(0, 0)] = { id: 600, k: -1, s: 'c' };
  g[at(0, 1)] = { id: 601, k: -1, s: 'c' };
  const res = L.applySwap(stateOf(g), at(0, 0), at(0, 1), seededRandom(5));
  assert.equal(res.combo, 'alles');
  assert.equal(res.phases[0].cleared.length, 64);
});

test('streep + streep wist rij en kolom; bom + bom een 5×5-gebied', () => {
  let g = G(CALM);
  g[at(3, 3)] = { ...g[at(3, 3)], s: 'h' };
  g[at(3, 4)] = { ...g[at(3, 4)], s: 'v' };
  let res = L.applySwap(stateOf(g), at(3, 3), at(3, 4), seededRandom(6));
  let cleared = new Set(res.phases[0].cleared.map((c) => c.i));
  for (let k = 0; k < 8; k++) { assert.ok(cleared.has(at(3, k))); assert.ok(cleared.has(at(k, 4))); }
  g = G(CALM);
  g[at(4, 4)] = { ...g[at(4, 4)], s: 'b' };
  g[at(4, 5)] = { ...g[at(4, 5)], s: 'b' };
  res = L.applySwap(stateOf(g), at(4, 4), at(4, 5), seededRandom(7));
  cleared = new Set(res.phases[0].cleared.map((c) => c.i));
  for (let r = 2; r <= 6; r++) for (let c = 3; c <= 7; c++) assert.ok(cleared.has(at(r, c)), `(${r},${c})`);
});

test('laatste zet bepaalt gehaald of mislukt', () => {
  const lines = CALM.slice();
  lines[0] = 'a a b a e f a b';
  const ok = L.applySwap(stateOf(G(lines), { movesLeft: 1, target: 10 }), at(0, 2), at(0, 3), seededRandom(8));
  assert.equal(ok.state.status, 'gehaald');
  const fail = L.applySwap(stateOf(G(lines), { movesLeft: 1, target: 999999 }), at(0, 2), at(0, 3), seededRandom(8));
  assert.equal(fail.state.status, 'mislukt');
  assert.equal(L.applySwap(fail.state, at(0, 0), at(0, 1)).ok, false, 'na afloop geen zetten meer');
});

test('schudden: zelfde snoepjes, geen rijtjes, wel een zet', () => {
  const { grid } = L.newBoard(6, seededRandom(9));
  const sh = L.shuffleBoard(grid, seededRandom(10));
  assert.ok(sh);
  assert.deepEqual(sh.map((c) => c.id).sort((a, b) => a - b), grid.map((c) => c.id).sort((a, b) => a - b));
  assert.equal(L.findRuns(sh).length, 0);
  assert.ok(L.hasMove(sh));
});

test('tip wijst een geldige zet aan', () => {
  const { grid } = L.newBoard(6, seededRandom(11));
  const [a, b] = L.findHint(grid);
  assert.ok(L.isValidSwap(grid, a, b));
});

test('simulatie: honderden zetten blijven geldig (geen gaten, dubbele ids of rijtjes)', () => {
  for (const level of [1, 4, 12]) {
    for (let seed = 1; seed <= 12; seed++) {
      const rng = seededRandom(seed * 31 + level);
      let s = L.newGame(level, rng);
      while (s.status === 'bezig') {
        const moves = L.validMoves(s.grid);
        assert.ok(moves.length, 'er is altijd een zet (anders was er geschud)');
        const [a, b] = moves[Math.floor(rng() * moves.length)];
        const res = L.applySwap(s, a, b, rng);
        assert.ok(res.ok);
        s = res.state;
        assert.equal(new Set(s.grid.map((c) => c.id)).size, 64);
        assert.equal(L.findRuns(s.grid).length, 0);
        assert.ok(L.validateState(s), JSON.stringify(s).slice(0, 200));
      }
    }
  }
});

test('moeilijkheid: eerste niveaus goed te halen, doel stijgt daarna geleidelijk', () => {
  const play = (level, seed) => {
    const rng = seededRandom(seed);
    let s = L.newGame(level, rng);
    while (s.status === 'bezig') { const [a, b] = L.findHint(s.grid); s = L.applySwap(s, a, b, rng).state; }
    return s.status === 'gehaald';
  };
  let passed = 0;
  for (let i = 0; i < 30; i++) passed += play(1, 1000 + i);
  assert.ok(passed >= 25, `niveau 1: ${passed}/30 gehaald door een eenvoudige speler`);
  let prev = 0;
  for (let n = 3; n <= 40; n++) {
    const cfg = L.levelConfig(n);
    assert.ok(cfg.moves >= 18 && cfg.colors === 6);
    assert.ok(cfg.target / cfg.moves >= prev - 1e-9, `doel per zet daalt niet (niveau ${n})`);
    prev = cfg.target / cfg.moves;
  }
});

test('sterren: 1 bij het doel, 2 bij 1,5×, 3 bij 2×', () => {
  assert.equal(L.starsFor(999, 1000), 0);
  assert.equal(L.starsFor(1000, 1000), 1);
  assert.equal(L.starsFor(1500, 1000), 2);
  assert.equal(L.starsFor(2000, 1000), 3);
});

test('validateState weigert kapotte standen', () => {
  const s = L.newGame(3, seededRandom(12));
  assert.ok(L.validateState(s));
  assert.ok(!L.validateState({ ...s, grid: s.grid.slice(1) }));
  assert.ok(!L.validateState({ ...s, grid: s.grid.map((c, i) => (i === 5 ? null : c)) }));
  assert.ok(!L.validateState({ ...s, grid: s.grid.map((c, i) => (i === 5 ? { ...c, k: 9 } : c)) }));
  assert.ok(!L.validateState({ ...s, grid: s.grid.map((c, i) => (i === 5 ? { ...c, s: 'x' } : c)) }));
  assert.ok(!L.validateState({ ...s, grid: s.grid.map((c, i) => (i === 5 ? { ...c, id: s.grid[0].id } : c)) }), 'dubbele id');
  assert.ok(!L.validateState({ ...s, nextId: 1 }));
  assert.ok(!L.validateState({ ...s, movesLeft: 0 }), 'bezig zonder zetten');
  assert.ok(!L.validateState({ ...s, status: '?' }));
  assert.ok(!L.validateState({ ...s, level: 0 }));
});
