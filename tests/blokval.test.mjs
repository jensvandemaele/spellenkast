import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../app/js/games/blokval/logic.js';
import { seededRandom } from '../app/js/core/util.js';

const fresh = (seed = 1) => L.newGame(seededRandom(seed));

test('nieuw spel: leeg bord, een blok en een rij volgende blokken', () => {
  const s = fresh();
  assert.ok(s.piece);
  assert.ok(s.queue.length >= 7);
  assert.ok(L.validateState(s));
  assert.ok(s.board.flat().every((v) => v === ''));
});

test('zak van zeven: elke 7 blokken bevatten elke vorm één keer', () => {
  const rng = seededRandom(9);
  const s = { queue: [] };
  const seq = [];
  for (let i = 0; i < 10; i++) { L.refillQueue(s, rng); seq.push(...s.queue.splice(0, 7)); }
  for (let i = 0; i < 70; i += 7) assert.deepEqual(seq.slice(i, i + 7).sort(), [...L.TYPES].sort());
});

test('elke vorm heeft 4 cellen in alle 4 standen', () => {
  for (const type of L.TYPES) for (let rot = 0; rot < 4; rot++) assert.equal(L.cellsOf({ type, rot, row: 0, col: 0 }).length, 4);
});

test('bewegen stopt bij de muur', () => {
  const s = fresh();
  s.piece = { type: 'O', rot: 0, row: 0, col: 4 };
  let n = 0;
  while (L.move(s, -1)) n++;
  assert.equal(n, 4);
  assert.equal(s.piece.col, 0);
  assert.equal(L.move(s, -1), false);
  while (L.move(s, 1));
  assert.equal(s.piece.col, L.W - 2);
});

test('draaien: vier keer draaien geeft dezelfde stand; muurschop werkt', () => {
  const s = fresh();
  s.piece = { type: 'T', rot: 0, row: 5, col: 4 };
  for (let i = 0; i < 4; i++) assert.ok(L.rotate(s, 1));
  assert.equal(s.piece.rot, 0);
  // I-blok rechtop tegen de linkermuur: draaien moet lukken door een schop
  s.piece = { type: 'I', rot: 1, row: 5, col: -2 };
  assert.ok(!L.collides(s.board, s.piece));
  assert.ok(L.rotate(s, 1));
  assert.ok(!L.collides(s.board, s.piece));
});

test('O-blok draait niet', () => {
  const s = fresh();
  s.piece = { type: 'O', rot: 0, row: 3, col: 3 };
  assert.equal(L.rotate(s, 1), false);
});

test('hard laten vallen: onderaan, 2 punten per rij, volgende blok verschijnt', () => {
  const s = fresh();
  s.piece = { type: 'O', rot: 0, row: 0, col: 0 };
  const next = s.queue[0];
  L.hardDrop(s, seededRandom(2));
  assert.equal(s.board[L.H - 1][0], 'O');
  assert.equal(s.board[L.H - 2][1], 'O');
  assert.equal(s.score, (L.H - 2) * 2);
  assert.equal(s.piece.type, next);
  assert.equal(s.pieces, 1);
});

test('versneld vallen: 1 punt per rij', () => {
  const s = fresh();
  const row = s.piece.row;
  assert.ok(L.softDrop(s));
  assert.equal(s.piece.row, row + 1);
  assert.equal(s.score, 1);
});

test('volle rijen verdwijnen, rijen erboven zakken, punten × niveau', () => {
  const s = fresh();
  for (let r = L.H - 2; r < L.H; r++) for (let c = 0; c < L.W; c++) s.board[r][c] = c < 8 ? 'J' : '';
  s.board[L.H - 3][0] = 'T'; // blijft liggen en moet 2 rijen zakken
  s.piece = { type: 'O', rot: 0, row: 0, col: 8 };
  const res = L.hardDrop(s, seededRandom(3));
  assert.equal(res.cleared, 2);
  assert.equal(s.lines, 2);
  assert.equal(s.board[L.H - 1][0], 'T');
  assert.ok(s.board[L.H - 1].slice(1).every((v) => v === ''));
  assert.equal(s.score, (L.H - 2) * 2 + 300);
});

test('vier rijen tegelijk = 800 × niveau; niveau stijgt per 10 rijen', () => {
  const s = fresh();
  s.lines = 8; s.level = 1;
  for (let r = L.H - 4; r < L.H; r++) for (let c = 0; c < L.W; c++) s.board[r][c] = c === 0 ? '' : 'L';
  s.piece = { type: 'I', rot: 1, row: 0, col: -2 }; // verticaal in kolom 0
  assert.ok(!L.collides(s.board, s.piece));
  const before = s.score;
  const res = L.hardDrop(s, seededRandom(4));
  assert.equal(res.cleared, 4);
  assert.equal(s.score - before - (L.H - 4) * 2, 800);
  assert.equal(s.lines, 12);
  assert.equal(s.level, 2);
});

test('valsnelheid neemt af met niveau', () => {
  let prev = Infinity;
  for (let l = 1; l <= 20; l++) { const g = L.gravityMs(l); assert.ok(g <= prev); prev = g; }
  assert.equal(L.gravityMs(1), 1000);
});

test('game-over als een nieuw blok geen ruimte heeft', () => {
  const s = fresh();
  for (let c = 0; c < L.W; c++) { if (c !== 0) { s.board[0][c] = 'Z'; s.board[1][c] = 'Z'; } }
  s.piece = { type: 'O', rot: 0, row: 5, col: 0 };
  // Blok vastzetten zodat een nieuw blok bovenin moet verschijnen
  L.hardDrop(s, seededRandom(5));
  assert.equal(s.over, true);
});

test('validateState wijst beschadigde toestand af', () => {
  const s = fresh();
  assert.equal(L.validateState({ ...s, board: s.board.slice(1) }), false);
  assert.equal(L.validateState({ ...s, piece: { ...s.piece, type: 'Q' } }), false);
  assert.equal(L.validateState({ ...s, score: -5 }), false);
  assert.equal(L.validateState(JSON.parse(JSON.stringify(s))), true);
});
