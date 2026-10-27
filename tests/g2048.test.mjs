import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../app/js/games/g2048/logic.js';
import { seededRandom } from '../app/js/core/util.js';

const g = (rows) => rows.map((r) => r.slice());

test('slideLine: schuift naar links zonder samenvoegen', () => {
  assert.deepEqual(L.slideLine([0, 2, 0, 4]).line, [2, 4, 0, 0]);
});

test('slideLine: elke tegel voegt hooguit één keer samen', () => {
  assert.deepEqual(L.slideLine([2, 2, 2, 2]).line, [4, 4, 0, 0]);
  assert.deepEqual(L.slideLine([4, 4, 8, 0]).line, [8, 8, 0, 0]); // niet 16
  assert.deepEqual(L.slideLine([2, 2, 4, 4]).line, [4, 8, 0, 0]);
  assert.deepEqual(L.slideLine([2, 0, 2, 2]).line, [4, 2, 0, 0]); // voorste paar eerst
  assert.deepEqual(L.slideLine([8, 4, 4, 0]).line, [8, 8, 0, 0]);
});

test('slideLine: score is de som van samengevoegde tegels', () => {
  assert.equal(L.slideLine([2, 2, 4, 4]).gained, 12);
  assert.equal(L.slideLine([2, 4, 8, 16]).gained, 0);
});

test('slideGrid: alle vier richtingen', () => {
  const grid = g([[2, 0, 0, 2], [0, 4, 4, 0], [0, 0, 0, 0], [2, 0, 0, 0]]);
  assert.deepEqual(L.slideGrid(grid, 'links').grid, [[4, 0, 0, 0], [8, 0, 0, 0], [0, 0, 0, 0], [2, 0, 0, 0]]);
  assert.deepEqual(L.slideGrid(grid, 'rechts').grid, [[0, 0, 0, 4], [0, 0, 0, 8], [0, 0, 0, 0], [0, 0, 0, 2]]);
  assert.deepEqual(L.slideGrid(grid, 'omhoog').grid, [[4, 4, 4, 2], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
  assert.deepEqual(L.slideGrid(grid, 'omlaag').grid, [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [4, 4, 4, 2]]);
});

test('applyMove: geen nieuwe tegel bij een ongeldige zet', () => {
  const state = { grid: g([[2, 4, 8, 16], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]), score: 0, moves: 0, won: false, keepPlaying: false, over: false };
  const res = L.applyMove(state, 'links', () => 0);
  assert.equal(res.moved, false);
  assert.equal(res.state, state);
  assert.equal(res.spawned, null);
});

test('applyMove: precies één nieuwe tegel na een geldige zet en score telt op', () => {
  const state = { grid: g([[2, 2, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]), score: 10, moves: 3, won: false, keepPlaying: false, over: false };
  const res = L.applyMove(state, 'links', seededRandom(1));
  assert.equal(res.moved, true);
  assert.equal(res.state.score, 14);
  assert.equal(res.state.moves, 4);
  const tiles = res.state.grid.flat().filter((v) => v);
  assert.equal(tiles.length, 2);
  assert.ok(tiles.includes(4));
  assert.deepEqual(state.grid[0], [2, 2, 0, 0], 'oude toestand blijft ongewijzigd');
});

test('applyMove: winst bij 2048, maar maar één keer gemeld', () => {
  const state = { grid: g([[1024, 1024, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]), score: 0, moves: 0, won: false, keepPlaying: false, over: false };
  const r1 = L.applyMove(state, 'links', seededRandom(2));
  assert.equal(r1.justWon, true);
  assert.equal(r1.state.won, true);
  const r2 = L.applyMove({ ...r1.state, keepPlaying: true }, 'rechts', seededRandom(3));
  assert.equal(r2.justWon, false);
});

test('game-over wanneer geen zet meer mogelijk is', () => {
  const full = g([[2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 4, 8]]);
  assert.equal(L.canMove(full), false);
  const almost = g([[2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 4, 4]]);
  assert.equal(L.canMove(almost), true);
  // Zet die het bord vult zonder verdere mogelijkheden
  const st = { grid: g([[2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [8, 16, 32, 0]]), score: 0, moves: 0, won: false, keepPlaying: false, over: false };
  const res = L.applyMove(st, 'rechts', () => 0.95); // nieuwe tegel wordt 4 op de enige lege plek (links)
  assert.equal(res.moved, true);
  assert.deepEqual(res.state.grid[3], [4, 8, 16, 32]);
  assert.equal(res.state.over, true);
});

test('nieuwe tegels: ongeveer 90% tweeën', () => {
  const rng = seededRandom(42);
  let twos = 0;
  for (let i = 0; i < 2000; i++) {
    const grid = L.emptyGrid();
    L.addRandomTile(grid, rng);
    if (grid.flat().includes(2)) twos++;
  }
  assert.ok(twos > 1700 && twos < 1900, `aantal tweeën: ${twos}`);
});

test('newGame: twee tegels', () => {
  const s = L.newGame(seededRandom(7));
  assert.equal(s.grid.flat().filter((v) => v).length, 2);
  assert.ok(L.validateState(s));
});

test('validateState wijst onzin af', () => {
  assert.equal(L.validateState(null), false);
  assert.equal(L.validateState({ grid: [[1]] }), false);
  const s = L.newGame(seededRandom(1));
  assert.equal(L.validateState({ ...s, score: -1 }), false);
  const bad = { ...s, grid: s.grid.map((r) => r.slice()) };
  bad.grid[0][0] = 3;
  assert.equal(L.validateState(bad), false);
});
